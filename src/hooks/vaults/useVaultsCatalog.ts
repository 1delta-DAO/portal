import { useQuery } from '@tanstack/react-query'
import { fetchVaultsCatalog, type VaultEntry } from '../../sdk/vaults-helper'

export interface UseVaultsCatalogParams {
  chainId?: string
  enabled?: boolean
}

/**
 * Fetches the per-chain vault catalog for *every* provider and flattens to a
 * uniform `VaultEntry[]`. Provider selection is a pure client-side filter (see
 * the vaults view), so it deliberately does NOT participate in the query key —
 * toggling providers must never trigger a refetch. Matches the guide's 20-30s
 * SWR window (the backend caches the underlying response for ~20s already).
 */
export function useVaultsCatalog(params: UseVaultsCatalogParams) {
  const { chainId, enabled = true } = params

  const { data, isLoading, isFetching, error, refetch } = useQuery<VaultEntry[]>({
    queryKey: ['vaultsCatalog', chainId ?? ''],
    enabled: enabled && !!chainId,
    queryFn: async () => {
      if (!chainId) return []
      const res = await fetchVaultsCatalog({ chainId })
      if (!res.success) throw new Error(res.error ?? 'Failed to load vaults catalog')
      return res.vaults ?? []
    },
    staleTime: 20_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  return {
    vaults: data ?? [],
    isVaultsLoading: isLoading,
    isVaultsFetching: isFetching,
    vaultsError: error as Error | null,
    refetchVaults: refetch,
  }
}
