import { useQuery } from '@tanstack/react-query'
import {
  fetchVaultValidators,
  type VaultValidatorItem,
} from '../../sdk/vaults-helper'

export interface UseVaultValidatorsParams {
  chainId?: string
  shareToken?: string
  /** Only fetch when the vault's delegation source is `endpoint`. */
  enabled?: boolean
}

export interface UseVaultValidatorsResult {
  validators: VaultValidatorItem[]
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

/**
 * Lazily loads an LST vault's selectable delegation targets. Disabled by
 * default — the caller enables it only for endpoint-sourced delegations (and,
 * for optional pickers, only once the user opens the advanced selector).
 */
export function useVaultValidators(
  params: UseVaultValidatorsParams
): UseVaultValidatorsResult {
  const { chainId, shareToken, enabled = true } = params
  const queryEnabled = enabled && !!chainId && !!shareToken

  const { data, isLoading, error, refetch } = useQuery<VaultValidatorItem[]>({
    queryKey: ['vaultValidators', chainId ?? '', shareToken?.toLowerCase() ?? ''],
    enabled: queryEnabled,
    queryFn: async () => {
      if (!chainId || !shareToken) return []
      const res = await fetchVaultValidators({ chainId, shareToken })
      if (!res.success) throw new Error(res.error ?? 'Failed to load validators')
      return res.items ?? []
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  return {
    validators: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  }
}
