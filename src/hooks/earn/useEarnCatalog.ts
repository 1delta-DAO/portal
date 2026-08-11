import { useQuery } from '@tanstack/react-query'
import {
  fetchEarn,
  EMPTY_FACETS,
  type EarnFacets,
  type EarnMarket,
  type EarnSourceStatus,
} from '../../sdk/earn-helper'

export interface UseEarnCatalogParams {
  chainIds: string[]
  /** Server-side filters. Values must come from `facets`, never a constant. */
  brand?: string[]
  protocol?: string[]
  curator?: string[]
  venue?: string[]
  venueKind?: string
  assetGroup?: string
  assetSymbol?: string
  terms?: 'none' | 'digest' | 'full'
  depositableOnly?: boolean
  includePassthrough?: boolean
  includeIlliquid?: boolean
  minTvlUsd?: number
  maxRiskScore?: number
  sort?: 'rate' | 'marketRate' | 'tvl' | 'liquidity'
  enabled?: boolean
}

export interface UseEarnCatalogResult {
  items: EarnMarket[]
  /** The server's filter vocabulary — build every dropdown from this. */
  facets: EarnFacets
  /** Per-origin health. A `degraded`/`failed` entry means the list is partial. */
  sources: EarnSourceStatus[]
  /** Per-default removal counts, so each toggle can show its own number. */
  excluded: { passthrough: number; illiquid: number; lowTvl: number; highRisk: number }
  isLoading: boolean
  isFetching: boolean
  error: Error | null
  refetch: () => void
}

/**
 * The unified earn listing — one fetch covering lending markets AND vaults.
 *
 * Replaces the pair of `usePoolData` + `useVaultsCatalog` calls the existing
 * Earn tab makes, and with them the client-side merge, the client-side venue
 * list and the client-side `'lending' | 'vaults'` mode switch.
 */
export function useEarnCatalog(params: UseEarnCatalogParams): UseEarnCatalogResult {
  const {
    chainIds,
    brand,
    protocol,
    curator,
    venue,
    venueKind,
    assetGroup,
    assetSymbol,
    terms,
    depositableOnly,
    includePassthrough,
    includeIlliquid,
    minTvlUsd,
    maxRiskScore,
    sort = 'rate',
    enabled = true,
  } = params

  // Stable key so chain reorder does not refetch.
  const chainKey = [...new Set(chainIds)].sort().join(',')
  const venueKey = venue?.length ? [...venue].sort().join(',') : ''
  const brandKey = brand?.length ? [...brand].sort().join(',') : ''
  const protocolKey = protocol?.length ? [...protocol].sort().join(',') : ''
  const curatorKey = curator?.length ? [...curator].sort().join(',') : ''

  const queryEnabled = enabled && chainKey.length > 0

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: [
      'earnCatalog',
      chainKey,
      brandKey,
      protocolKey,
      curatorKey,
      venueKey,
      venueKind ?? '',
      assetGroup ?? '',
      assetSymbol ?? '',
      terms ?? '',
      depositableOnly ? '1' : '0',
      includePassthrough ? '1' : '0',
      includeIlliquid ? '1' : '0',
      String(minTvlUsd ?? ''),
      String(maxRiskScore ?? ''),
      sort,
    ],
    enabled: queryEnabled,
    queryFn: async () => {
      const res = await fetchEarn({
        chainIds: chainKey.split(',').filter(Boolean),
        brand,
        protocol,
        curator,
        venue,
        venueKind,
        assetGroup,
        assetSymbol,
        terms,
        depositableOnly,
        includePassthrough,
        includeIlliquid,
        minTvlUsd,
        maxRiskScore,
        sort,
      })
      if (!res.success) throw new Error(res.error ?? 'Failed to load earn catalog')
      return res
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  return {
    items: data?.items ?? [],
    facets: data?.facets ?? EMPTY_FACETS,
    sources: data?.sources ?? [],
    excluded: data?.excluded ?? {
      passthrough: 0,
      illiquid: 0,
      lowTvl: 0,
      highRisk: 0,
    },
    isLoading,
    isFetching,
    error: (error as Error) ?? null,
    refetch,
  }
}
