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

export interface PoolEntry {
  chainId: string
  marketUid: string
  name: string
  lenderKey: string
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

export interface PoolRiskBreakdown {
  category: string
  score: number | null
  label: string
  curatorValidated?: boolean
  curatorIds?: string[]
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

/** Number of items to request per API page */
const API_PAGE_SIZE = 100

function buildPoolsUrl(
  base: string,
  chainIds?: (number | string)[],
  lenders?: string[],
  start?: number,
  count?: number,
  maxRiskScore?: number
) {
  const url = new URL(base)

  if (chainIds && chainIds.length > 0) {
    chainIds.forEach((v) => url.searchParams.append('chainId', String(v)))
  }
  if (lenders && lenders.length > 0) {
    lenders.forEach((v) => url.searchParams.append('lender', String(v)))
  }
  if (start !== undefined) url.searchParams.set('start', String(start))
  if (count !== undefined) url.searchParams.set('count', String(count))
  if (maxRiskScore !== undefined) url.searchParams.set('maxRiskScore', String(maxRiskScore))

  url.searchParams.set('includeExposures', 'true')

  return url.toString()
}

// ============================================================================
// Hook
// ============================================================================

/**
 * useFlattenedPools
 * Fetches from the /lending/pools endpoint filtered by chainId and lender.
 * Uses infinite query to paginate through all results in chunks of API_PAGE_SIZE.
 */
export function useFlattenedPools(params: {
  chainId?: string
  lender?: string
  maxRiskScore?: number
  enabled?: boolean
}) {
  const chainId = params?.chainId
  const lender = params?.lender
  const maxRiskScore = params?.maxRiskScore ?? 4
  const enabled = params?.enabled ?? true

  const { data, isLoading, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage, error } =
    useInfiniteQuery<PoolsApiResponse>({
      queryKey: ['flattenedPools', chainId ?? '', lender ?? '', maxRiskScore],
      enabled,
      initialPageParam: 0 as number,
      queryFn: async ({ pageParam }) => {
        const url = buildPoolsUrl(
          endpointPools,
          chainId ? [chainId] : [],
          lender ? [lender] : [],
          pageParam as number,
          API_PAGE_SIZE,
          maxRiskScore
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
        const totalFetched = allPages.reduce((sum, p) => sum + p.data.items.length, 0)
        // Reached the end: fewer items returned than requested
        if (lastPage.data.items.length < API_PAGE_SIZE) return undefined
        // Reached the end: fetched all available items
        if (lastPage.data.count > 0 && totalFetched >= lastPage.data.count) return undefined
        return totalFetched
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

  const totalServerCount = data?.pages?.[0]?.data?.count ?? 0

  return {
    pools,
    count: totalServerCount,
    isPoolsLoading: isLoading,
    isPoolsFetching: isFetching,
    isFetchingMore: isFetchingNextPage,
    hasMore: !!hasNextPage,
    error,
  }
}
