import { BACKEND_BASE_URL } from '../../config/backend'
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

const ENDPOINT = `${BACKEND_BASE_URL}/v1/data/vaults/user`

export async function fetchUserVaults(
  params: FetchUserVaultsParams
): Promise<FetchUserVaultsResult> {
  try {
    if (params.vaults.length === 0) return { success: true, items: [] }

    const qs = new URLSearchParams()
    qs.set('chainId', params.chainId)
    qs.set('account', params.account)
    qs.set('vaults', params.vaults.join(','))

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
        error: json.error?.message ?? 'User vaults returned success: false',
      }
    }

    return { success: true, items: (json.data?.items ?? []) as UserVaultItem[] }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' }
  }
}
