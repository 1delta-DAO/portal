import { useEffect, useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'

// ============================================================================
// Types for the /lending/pools API response
// ============================================================================

export interface PoolExposure {
  debts: string[] | null
  label: string
  configId: string
  collaterals: string[] | null
}

export interface PoolAssetInfo {
  chainId: string
  address: string
  symbol: string
  name: string
  decimals: number
  logoURI: string
  assetGroup: string
  currencyId: string
  props?: Record<string, unknown>
}

export interface PoolPriceInfo {
  priceUsd: number
  priceTs: string
  priceUsd24h: number
  priceTs24h: string
  priceChange24h: number
}

export interface PoolOraclePrice {
  oraclePrice: number | null
  oraclePriceUsd: number | null
}

export interface PoolUnderlyingInfo {
  asset: PoolAssetInfo
  prices: PoolPriceInfo
  oraclePrice: PoolOraclePrice
}

export interface LenderInfo {
  key: string
  name: string
  logoURI: string
}

export interface PoolEntry {
  chainId: string
  marketUid: string
  name: string
  lenderKey: string
  lenderInfo?: LenderInfo
  underlyingAddress: string
  depositRate: string
  variableBorrowRate: string
  stableBorrowRate: string
  intrinsicYield: string | null
  totalDeposits: string
  totalDebt: string
  totalLiquidity: string
  totalDepositsUsd: string
  totalDebtUsd: string
  totalLiquidityUsd: string
  borrowLiquidity: string
  withdrawLiquidity: string
  depositable: string
  utilization: string
  configIds: string[]
  exposures: PoolExposure[]
  rewards: unknown | null
  underlyingInfo: PoolUnderlyingInfo
  risk: PoolRisk | null
}

export interface PoolOwnerShare {
  /** Owner address, or the literal "others" for the tail bucket */
  owner: string
  /** Fraction of the pool held by this owner, 0–1 */
  share: number
}

export interface PoolRiskBreakdown {
  category: string
  score: number | null
  label: string
  curatorValidated?: boolean
  curatorIds?: string[] | null
  /** Oracle risk: human-readable description */
  description?: string | null
  /** Oracle risk: whether the oracle has a static base price */
  staticBase?: boolean | null
  /** Oracle risk: base asset symbol or address */
  baseAsset?: string | null
  /** Concentration risk: per-owner share of the pool (shares are fractions 0–1) */
  ownerDistribution?: PoolOwnerShare[] | null
}

export interface PoolRisk {
  score: number
  label: string
  breakdown: PoolRiskBreakdown[]
}

interface PoolsApiResponse {
  success: boolean
  data: {
    start: number
    count: number
    items: PoolEntry[]
  }
  error?: { code: string; message: string }
}

// ============================================================================
// Endpoint
// ============================================================================

import { BACKEND_BASE_URL } from '../../config/backend'

const endpointPools = `${BACKEND_BASE_URL}/v1/data/lending/pools`

/**
 * Default page size requested from the API. The backend caps `count` at 1000;
 * we stay well under that to keep individual requests reasonable while still
 * minimizing round-trips for the typical "fetch all matching pools" workload.
 */
const DEFAULT_PAGE_SIZE = 500

/**
 * Optional server-side filters supported by `/v1/data/lending/pools`. All
 * fields are passed straight through to the backend; see the OpenAPI spec for
 * semantics. Numeric rates (`minYield`, `maxYield`, `minUtil`, `maxUtil`) are
 * decimals (0–1), not percentages.
 */
export interface PoolsFilters {
  lender?: string
  underlyings?: string[]
  assetGroups?: string[]
  minYield?: number
  maxYield?: number
  minUtil?: number
  maxUtil?: number
  minTvlUsd?: number
  maxTvlUsd?: number
  minDeposits?: number
  maxDeposits?: number
  minDebt?: number
  maxDebt?: number
  minDebtUsd?: number
  maxDebtUsd?: number
  minLiquidity?: number
  maxLiquidity?: number
  minLiquidityUsd?: number
  maxLiquidityUsd?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc' | 'ASC' | 'DESC'
}

function buildPoolsUrl(
  base: string,
  chainIds: (number | string)[] | undefined,
  lender: string | undefined,
  start: number,
  count: number,
  maxRiskScore: number | undefined,
  filters: PoolsFilters | undefined
) {
  const url = new URL(base)

  if (chainIds && chainIds.length > 0) {
    chainIds.forEach((v) => url.searchParams.append('chainId', String(v)))
  }
  if (lender) {
    url.searchParams.append('lender', lender)
  }
  url.searchParams.set('start', String(start))
  url.searchParams.set('count', String(count))
  if (maxRiskScore !== undefined) url.searchParams.set('maxRiskScore', String(maxRiskScore))
  url.searchParams.set('includeExposures', 'true')

  if (filters) {
    if (filters.lender && !lender) url.searchParams.append('lender', filters.lender)
    if (filters.underlyings?.length) {
      url.searchParams.set('underlyings', filters.underlyings.join(','))
    }
    if (filters.assetGroups?.length) {
      url.searchParams.set('assetGroups', filters.assetGroups.join(','))
    }
    const numericKeys: (keyof PoolsFilters)[] = [
      'minYield',
      'maxYield',
      'minUtil',
      'maxUtil',
      'minTvlUsd',
      'maxTvlUsd',
      'minDeposits',
      'maxDeposits',
      'minDebt',
      'maxDebt',
      'minDebtUsd',
      'maxDebtUsd',
      'minLiquidity',
      'maxLiquidity',
      'minLiquidityUsd',
      'maxLiquidityUsd',
    ]
    for (const k of numericKeys) {
      const v = filters[k] as number | undefined
      if (v !== undefined && Number.isFinite(v)) url.searchParams.set(k, String(v))
    }
    if (filters.sortBy) url.searchParams.set('sortBy', filters.sortBy)
    if (filters.sortDir) url.searchParams.set('sortDir', String(filters.sortDir).toUpperCase())
  }

  return url.toString()
}

// ============================================================================
// Hook
// ============================================================================

/**
 * useFlattenedPools
 *
 * Fetches from `/v1/data/lending/pools`, paging until the server runs out of
 * results. Optional `filters` are passed straight through as query params so
 * the backend can do the filtering work — see {@link PoolsFilters}.
 *
 * Note: the backend's response field `data.count` is the *page* item count,
 * not a grand total, so end-of-stream is detected purely by "page returned
 * fewer than `pageSize` rows". Client `count` returned from the hook is the
 * cumulative number of fetched rows.
 */
export function useFlattenedPools(params: {
  chainId?: string
  lender?: string
  maxRiskScore?: number
  enabled?: boolean
  pageSize?: number
  filters?: PoolsFilters
}) {
  const chainId = params?.chainId
  const lender = params?.lender
  const maxRiskScore = params?.maxRiskScore ?? 4
  const enabled = params?.enabled ?? true
  const pageSize = params?.pageSize ?? DEFAULT_PAGE_SIZE
  const filters = params?.filters

  // Stable serialization so the queryKey only changes when filter values change.
  const filtersKey = useMemo(() => (filters ? JSON.stringify(filters) : ''), [filters])

  const { data, isLoading, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage, error } =
    useInfiniteQuery<PoolsApiResponse>({
      queryKey: [
        'flattenedPools',
        chainId ?? '',
        lender ?? '',
        maxRiskScore,
        pageSize,
        filtersKey,
      ],
      enabled,
      initialPageParam: 0 as number,
      queryFn: async ({ pageParam }) => {
        const url = buildPoolsUrl(
          endpointPools,
          chainId ? [chainId] : [],
          lender,
          pageParam as number,
          pageSize,
          maxRiskScore,
          filters
        )
        const r = await fetch(url)
        if (!r.ok) {
          const text = await r.text().catch(() => '')
          throw new Error(`HTTP ${r.status}: ${text || r.statusText}`)
        }
        const json = (await r.json()) as PoolsApiResponse

        if (!json.success) {
          throw new Error(json.error?.message ?? 'Pools API returned success: false')
        }

        return json
      },
      getNextPageParam: (lastPage, allPages) => {
        // The backend returns `data.count = items.length` (page count, not
        // total), so the only reliable end-of-stream signal is "the last page
        // came back smaller than the requested page size".
        if (lastPage.data.items.length < pageSize) return undefined
        return allPages.reduce((sum, p) => sum + p.data.items.length, 0)
      },
      refetchInterval: 8 * 60 * 1000,
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    })

  // Auto-fetch remaining pages so all data is available for client-side filtering
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Flatten all pages into a single array
  const pools = useMemo(() => {
    if (!data?.pages) return []
    return data.pages.flatMap((page) => page.data.items)
  }, [data])

  return {
    pools,
    count: pools.length,
    isPoolsLoading: isLoading,
    isPoolsFetching: isFetching,
    isFetchingMore: isFetchingNextPage,
    hasMore: !!hasNextPage,
    error,
  }
}
