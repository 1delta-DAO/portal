import { useQuery } from '@tanstack/react-query'
import {
  fetchVaultsCatalog,
  type VaultEntry,
  type VaultProvider,
} from '../../sdk/vaults-helper'

export interface UseVaultsCatalogParams {
  chainId?: string
  providers?: VaultProvider[]
  enabled?: boolean
}

/**
 * Fetches the per-chain vault catalog across providers and flattens to a
 * uniform `VaultEntry[]`. Matches the guide's recommended 20-30s SWR window
 * (the backend caches the underlying response for ~20s already).
 */
export function useVaultsCatalog(params: UseVaultsCatalogParams) {
  const { chainId, providers, enabled = true } = params
  const providersKey = (providers ?? []).join(',')

  const { data, isLoading, isFetching, error, refetch } = useQuery<VaultEntry[]>({
    queryKey: ['vaultsCatalog', chainId ?? '', providersKey],
    enabled: enabled && !!chainId,
    queryFn: async () => {
      if (!chainId) return []
      const res = await fetchVaultsCatalog({ chainId, providers })
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
