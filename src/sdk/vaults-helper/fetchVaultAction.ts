import { BACKEND_BASE_URL } from '../../config/backend'
import type { VaultProvider } from './types'

export type VaultActionType = 'Deposit' | 'Withdraw'

export interface VaultActionParams {
  actionType: VaultActionType
  chainId: string
  /** Vault contract address (share token). */
  vault: string
  /** Underlying ERC-20 the vault accepts. */
  underlying: string
  /** Operator EOA that signs the transaction. */
  operator: string
  /** Amount in **underlying units** (raw). For withdraw, ignored when `isAll`. */
  amount: string
  /** Receiver of the resulting shares (deposit) or underlying (withdraw). Defaults to operator. */
  receiver?: string
  /** Address of the asset the user wants to *pay* with (deposit) — zeroAddress for native ETH. */
  payAsset?: string
  /** Address of the asset the user wants to *receive* (withdraw) — currently composer-blocked for native ETH. */
  receiveAsset?: string
  /** Opt-in to a provider-native flow (currently only `provider=fluid` for fWETH `depositNative`). */
  provider?: VaultProvider
  /** Routing mode override. Default 'auto' lets the worker pick direct vs. composer. */
  mode?: 'auto' | 'direct' | 'proxy'
  /** Withdraw-all flag. When true, amount is ignored. */
  isAll?: boolean
  /**
   * Pre-fetched share balance for `isAll` withdraws. When provided, request is
   * POSTed so the worker doesn't have to read `balanceOf` from its own RPC.
   * Required if your state lives on a different RPC than the worker's.
   */
  sharesRaw?: string
}

export interface VaultTransaction {
  to: string
  data: string
  value: string
}

export interface VaultPermission extends VaultTransaction {
  description?: string
}

export interface VaultActionResponse {
  transactions: VaultTransaction[]
  permissions: VaultPermission[]
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
    const action = params.actionType.toLowerCase()
    const qs = new URLSearchParams()
    qs.set('chainId', params.chainId)
    qs.set('vault', params.vault)
    qs.set('underlying', params.underlying)
    qs.set('amount', params.amount)
    qs.set('operator', params.operator)

    if (params.receiver) qs.set('receiver', params.receiver)
    if (params.payAsset) qs.set('payAsset', params.payAsset)
    if (params.receiveAsset) qs.set('receiveAsset', params.receiveAsset)
    if (params.provider) qs.set('provider', params.provider)
    if (params.mode) qs.set('mode', params.mode)
    if (params.isAll) qs.set('isAll', 'true')

    const url = `${VAULT_ACTIONS_BASE}/${action}?${qs}`

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

    return {
      success: true,
      data: {
        transactions: json.actions?.transactions ?? [],
        permissions: json.actions?.permissions ?? [],
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' }
  }
}
