import { useQuery } from '@tanstack/react-query'
import {
  fetchLenders,
  fetchLendingLatest,
  fetchPoolsByConfig,
} from '../../sdk/lending-helper/fetchMarkets'
import type {
  LenderData,
  LenderInfoMap,
  LenderSummary,
  PoolConfigGroup,
} from '../../sdk/lending-helper/marketTypes'

// The /lending/latest wire types, transform and fetchers live in
// `sdk/lending-helper/fetchMarkets`; these hooks are only the react-query
// bindings.

/**
 * Fetches the lightweight lender enumeration for a chain — one entry per
 * (chainId, lenderKey), sorted server-side by `tvlUsd` desc. Use this to
 * drive the lender dropdown without paying the cost of fetching full
 * per-market data for every lender.
 */
export function useLenders(chainId: string, enabled = true, maxRiskScore = 6) {
  const { data, isLoading, isFetching, error } = useQuery<LenderSummary[]>({
    queryKey: ['lendingLenders', chainId],
    enabled: enabled && !!chainId,
    queryFn: () => fetchLenders(chainId, maxRiskScore),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 30_000,
    retry: 1,
  })

  return {
    lenders: data,
    isLendersLoading: isLoading,
    isLendersFetching: isFetching,
    lendersError: error,
  }
}

/**
 * Fetches full per-market lending data for a specific (chain, lenders) pair,
 * grouped by lender key. Chunking against the backend's per-request lender cap
 * happens in the sdk fetcher.
 *
 * Pass an empty `lenderKeys` array to skip the fetch entirely (useful while
 * the lighter `useLenders` enumeration is still loading).
 */
export function useLendingLatest(
  chainId: string,
  lenderKeys: string[] | undefined,
  enabled = true,
  maxRiskScore = 5
) {
  // Sort the keys so the query key is stable regardless of input order.
  const sortedKeys = [...(lenderKeys ?? [])].sort()
  const sortedKeysCsv = sortedKeys.join(',')

  const { data, isLoading, isFetching, error } = useQuery<{
    lenderData: LenderData
    lenderInfoMap: LenderInfoMap
  }>({
    queryKey: ['lendingPublic', chainId, sortedKeysCsv],
    enabled: enabled && !!chainId && sortedKeys.length > 0,
    queryFn: () => fetchLendingLatest(chainId, sortedKeys, maxRiskScore),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 5_000,
    retry: 1,
  })

  return {
    lenderData: data?.lenderData,
    lenderInfoMap: data?.lenderInfoMap,
    isPublicDataLoading: isLoading,
    isPublicDataFetching: isFetching,
    error,
  }
}

/**
 * Fetches pool data grouped by e-mode / pool configuration for a specific chain + lender.
 */
export function usePoolConfigData(chainId: string, lenderKey: string, maxRiskScore = 4) {
  return useQuery<PoolConfigGroup[]>({
    queryKey: ['poolsByConfig', chainId, lenderKey, maxRiskScore],
    queryFn: () => fetchPoolsByConfig(chainId, lenderKey, maxRiskScore),
    enabled: !!chainId && !!lenderKey,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 5_000,
    retry: 1,
  })
}
