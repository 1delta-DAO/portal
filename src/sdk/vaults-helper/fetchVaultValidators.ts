import { BACKEND_BASE_URL } from '../../config/backend'
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

const ENDPOINT = `${BACKEND_BASE_URL}/v1/data/vaults/validators`

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
    const qs = new URLSearchParams()
    qs.set('chainId', params.chainId)
    qs.set('shareToken', params.shareToken)

    const res = await fetch(`${ENDPOINT}?${qs}`)
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
        error: json.error?.message ?? 'Validators reader returned success: false',
      }
    }
    const payload: VaultValidatorsResponse = json.data ?? {}
    return { success: true, items: payload.items ?? [] }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' }
  }
}
