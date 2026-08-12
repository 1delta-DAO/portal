import { apiFetch, errorMessage } from '../http'
import type { VaultValidatorItem, VaultValidatorsResponse } from './types'

export interface FetchVaultValidatorsParams {
  chainId: string
  /** The LST vault's share-token address. */
  shareToken: string
}

export interface FetchVaultValidatorsResult {
  success: boolean
  items?: VaultValidatorItem[]
  error?: string
}

const ENDPOINT = '/v1/data/vaults/validators'

/**
 * Lists the selectable delegation targets (validators / groups / pools) for an
 * LST vault whose `delegation.source === 'endpoint'`. The API returns them
 * capacity-descending; `recommended` marks the default and `selectable` gates
 * the row.
 */
export async function fetchVaultValidators(
  params: FetchVaultValidatorsParams
): Promise<FetchVaultValidatorsResult> {
  try {
    const payload = await apiFetch<VaultValidatorsResponse>(ENDPOINT, {
      params: { chainId: params.chainId, shareToken: params.shareToken },
    })
    return { success: true, items: payload?.items ?? [] }
  } catch (err) {
    return { success: false, error: errorMessage(err) }
  }
}
