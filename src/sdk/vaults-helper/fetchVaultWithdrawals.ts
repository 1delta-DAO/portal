import { BACKEND_BASE_URL } from '../../config/backend'
import type {
  VaultWithdrawalRequest,
  VaultWithdrawalsResponse,
} from './types'

export interface FetchVaultWithdrawalsParams {
  chainId: string
  /** The user whose pending unbonds/redeems to list. */
  account: string
}

export interface FetchVaultWithdrawalsResult {
  success: boolean
  requests?: VaultWithdrawalRequest[]
  error?: string
}

const ENDPOINT = `${BACKEND_BASE_URL}/v1/data/vaults/withdrawals`

/**
 * Lists a user's pending/claimable withdrawal requests across every async
 * vault family (lst, gmx, lagoon). The worker normalises each protocol's queue
 * to the uniform {@link VaultWithdrawalRequest} shape, so the frontend treats
 * every vault identically — poll until `status === 'claimable'`, then build the
 * claim action with the entry's reference fields.
 */
export async function fetchVaultWithdrawals(
  params: FetchVaultWithdrawalsParams
): Promise<FetchVaultWithdrawalsResult> {
  try {
    const qs = new URLSearchParams()
    qs.set('chainId', params.chainId)
    // The guide spells this both `account` and `user`; send both to be safe.
    qs.set('account', params.account)
    qs.set('user', params.account)

    const res = await fetch(`${ENDPOINT}?${qs}`)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        success: false,
        error: `HTTP ${res.status}: ${text || res.statusText}`,
      }
    }

    const json = await res.json()
    // Gateway wraps as { success, data }; the raw worker returns the payload
    // at the top level. Tolerate both.
    if ('success' in json && json.success === false) {
      return {
        success: false,
        error: json.error?.message ?? 'Withdrawals reader returned success: false',
      }
    }
    const payload: VaultWithdrawalsResponse = json.data ?? json
    return { success: true, requests: payload.requests ?? [] }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' }
  }
}
