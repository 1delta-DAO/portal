import { apiFetch, errorMessage } from '../http'
import type { UserVaultItem } from './types'

export interface FetchUserVaultsParams {
  chainId: string
  account: string
  /** CSV-friendly array of vault addresses to query. */
  vaults: string[]
}

export interface FetchUserVaultsResult {
  success: boolean
  items?: UserVaultItem[]
  error?: string
}

const ENDPOINT = '/v1/data/vaults/user'

export async function fetchUserVaults(
  params: FetchUserVaultsParams
): Promise<FetchUserVaultsResult> {
  try {
    if (params.vaults.length === 0) return { success: true, items: [] }

    const data = await apiFetch<{ items?: UserVaultItem[] }>(ENDPOINT, {
      params: {
        chainId: params.chainId,
        account: params.account,
        vaults: params.vaults.join(','),
      },
    })
    return { success: true, items: data?.items ?? [] }
  } catch (err) {
    return { success: false, error: errorMessage(err) }
  }
}
