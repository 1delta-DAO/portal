import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchUserVaults, type UserVaultItem } from '../../sdk/vaults-helper'

export interface UseUserVaultsParams {
  chainId?: string
  account?: string
  /** Vault addresses to query — typically every vault from the catalog. */
  vaults: string[]
  /** When false, zero-share entries are filtered out. Defaults to false. */
  includeZero?: boolean
  enabled?: boolean
}

export interface UseUserVaultsResult {
  items: UserVaultItem[]
  byVault: Map<string, UserVaultItem>
  isLoading: boolean
  isFetching: boolean
  error: Error | null
  refetch: () => void
}

/**
 * Fetches the user's share balances across a known set of vault addresses.
 * Hits `GET /v1/data/vaults/user` which batches a single multicall on the
 * worker. Stable address sorting keeps the query key invariant under reorder.
 */
export function useUserVaults(params: UseUserVaultsParams): UseUserVaultsResult {
  const { chainId, account, vaults, includeZero = false, enabled = true } = params

  // Stable, lowercased key so reorder doesn't trigger a refetch.
  const vaultsKey = useMemo(
    () => [...new Set(vaults.map((v) => v.toLowerCase()))].sort().join(','),
    [vaults]
  )

  const queryEnabled = enabled && !!chainId && !!account && vaultsKey.length > 0

  const { data, isLoading, isFetching, error, refetch } = useQuery<UserVaultItem[]>({
    queryKey: ['userVaults', chainId ?? '', account ?? '', vaultsKey],
    enabled: queryEnabled,
    queryFn: async () => {
      if (!chainId || !account) return []
      const addrs = vaultsKey.split(',').filter(Boolean)
      const res = await fetchUserVaults({ chainId, account, vaults: addrs })
      if (!res.success) throw new Error(res.error ?? 'Failed to load user vaults')
      return res.items ?? []
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  const items = useMemo(() => {
    const all = data ?? []
    if (includeZero) return all
    return all.filter((it) => {
      try {
        return BigInt(it.sharesRaw) > 0n
      } catch {
        return parseFloat(it.shares ?? '0') > 0
      }
    })
  }, [data, includeZero])

  const byVault = useMemo(() => {
    const map = new Map<string, UserVaultItem>()
    for (const it of data ?? []) map.set(it.vault.toLowerCase(), it)
    return map
  }, [data])

  return {
    items,
    byVault,
    isLoading,
    isFetching,
    error: (error as Error | null) ?? null,
    refetch,
  }
}
