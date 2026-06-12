import { BACKEND_BASE_URL } from '../../config/backend'
import {
  resolveVaultRoute,
  vaultFamily,
  type VaultActionVerb,
  type VaultProvider,
} from './types'

export type VaultActionType = 'Deposit' | 'Withdraw'

/** Maps the UI's coarse tab to a builder verb (instant-exit families only). */
export function verbForActionType(t: VaultActionType): VaultActionVerb {
  return t === 'Deposit' ? 'deposit' : 'withdraw'
}

export interface VaultActionParams {
  /** Which builder verb to invoke. */
  verb: VaultActionVerb
  /**
   * The vault's provider — selects the calldata-builder family/route. NOTE:
   * this is *routing only*; the native-deposit opt-in is `nativeProvider`.
   */
  provider: VaultProvider
  chainId: string
  /** Vault contract address (the share token). */
  vault: string
  /** Underlying ERC-20 the vault accepts (required for generic ERC-4626). */
  underlying?: string
  /** Operator EOA that signs the transaction. `receiver` defaults to it. */
  operator: string
  /** Amount in the relevant token's smallest unit. Ignored for `claim`/`cancel`. */
  amount?: string
  /** Receiver of the resulting shares (deposit) or underlying (withdraw). */
  receiver?: string
  /** Asset the user pays with (deposit) — zeroAddress for native. */
  payAsset?: string
  /** Asset the user receives (withdraw, where the composer supports it). */
  receiveAsset?: string
  /**
   * Provider-native deposit opt-in for generic ERC-4626 (currently only
   * `fluid` for fWETH `depositNative`). Sent as the backend's `provider` query.
   */
  nativeProvider?: VaultProvider
  /** Routing mode override. Default 'auto' lets the worker pick. */
  mode?: 'auto' | 'direct' | 'proxy'
  /** Lagoon settlement mode (sync vs async). */
  settlement?: 'sync' | 'async'
  /** Withdraw-all flag. When true, amount is ignored. */
  isAll?: boolean
  /** Pre-fetched share balance for `isAll` withdraws (POST path). */
  sharesRaw?: string
  /**
   * Protocol-native request references for `claim` / `cancel`, captured from a
   * `/v1/data/vaults/withdrawals` entry. Undefined values are dropped.
   */
  ref?: Record<string, string | number | undefined>
}

export interface VaultTransaction {
  to: string
  data: string
  /** Decimal string of wei. Carries the execution fee for async families (GMX). */
  value: string
}

export interface VaultPermission extends VaultTransaction {
  description?: string
}

export interface VaultActionResponse {
  /** ERC-20 approvals — run FIRST. */
  permissions: VaultPermission[]
  /** The action itself — run in array order, after permissions. */
  transactions: VaultTransaction[]
  /** Optional follow-ups (e.g. unwrap) — run LAST. */
  postTransactions: VaultTransaction[]
}

export interface VaultActionResult {
  success: boolean
  data?: VaultActionResponse
  error?: string
}

const VAULT_ACTIONS_BASE = `${BACKEND_BASE_URL}/v1/actions/vaults`

export async function fetchVaultAction(
  params: VaultActionParams
): Promise<VaultActionResult> {
  try {
    const family = vaultFamily(params.provider)
    const route = resolveVaultRoute(family, params.verb)

    const qs = new URLSearchParams()
    qs.set('chainId', params.chainId)

    // Vault identity differs by route style.
    if (route.idStyle === 'share') {
      qs.set('shareToken', params.vault)
    } else {
      qs.set('vault', params.vault)
      if (params.underlying) qs.set('underlying', params.underlying)
    }

    qs.set('operator', params.operator)

    // Fixed per-route params (interface=hypercore, kind=lagoon, …).
    for (const [k, v] of Object.entries(route.baseQuery)) qs.set(k, v)

    // The verb travels in `action` for dedicated-family routes; for generic
    // routes it's already encoded in the path segment.
    if (route.actionInQuery) qs.set('action', params.verb)

    // Amount only matters for deposit / withdraw / request-withdraw.
    const verbUsesAmount =
      params.verb === 'deposit' ||
      params.verb === 'withdraw' ||
      params.verb === 'request-withdraw'
    if (verbUsesAmount && params.amount != null) qs.set('amount', params.amount)

    if (params.receiver) qs.set('receiver', params.receiver)
    if (params.payAsset) qs.set('payAsset', params.payAsset)
    if (params.receiveAsset) qs.set('receiveAsset', params.receiveAsset)
    if (params.nativeProvider) qs.set('provider', params.nativeProvider)
    if (params.mode) qs.set('mode', params.mode)
    if (params.settlement) qs.set('mode', params.settlement)
    if (params.isAll) qs.set('isAll', 'true')

    // Pass-through request references for claim/cancel (drop empties).
    if (params.ref) {
      for (const [k, v] of Object.entries(params.ref)) {
        if (v != null && String(v).length > 0) qs.set(k, String(v))
      }
    }

    const url = `${VAULT_ACTIONS_BASE}/${route.segment}?${qs}`

    // POST path: caller supplied `sharesRaw` for isAll withdraws (works against
    // any RPC). GET path: worker reads balanceOf from its own RPC.
    const usePost = params.isAll && params.sharesRaw != null
    const res = usePost
      ? await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sharesRaw: params.sharesRaw }),
        })
      : await fetch(url)

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        success: false,
        error: `HTTP ${res.status}: ${text || res.statusText}`,
      }
    }

    const json = await res.json()
    if (!json.success) {
      return {
        success: false,
        error: json.error?.message ?? 'Vault action returned success: false',
      }
    }

    const actions = json.actions ?? {}
    return {
      success: true,
      data: {
        permissions: actions.permissions ?? [],
        transactions: actions.transactions ?? [],
        postTransactions: actions.postTransactions ?? [],
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' }
  }
}
