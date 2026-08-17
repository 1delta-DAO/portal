import { apiFetchLoose, errorMessage } from '../http'
import type { VaultWithdrawalRequest, VaultWithdrawalsResponse } from './types'

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

const ENDPOINT = '/v1/data/vaults/withdrawals'

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
    // `apiFetchLoose`: the gateway wraps this as `{ success, data }` but the
    // raw worker returns the payload at the top level. Tolerate both.
    const payload = await apiFetchLoose<VaultWithdrawalsResponse>(ENDPOINT, {
      params: {
        chainId: params.chainId,
        // The guide spells this both `account` and `user`; send both to be safe.
        account: params.account,
        user: params.account,
      },
    })
    return { success: true, requests: payload?.requests ?? [] }
  } catch (err) {
    return { success: false, error: errorMessage(err) }
  }
}
