import { useQuery } from '@tanstack/react-query'

// ============================================================================
// Types for the /lending/pools API response
// ============================================================================

export interface PoolExposure {
  debts: string[] | null
  label: string
  configId: number
  collaterals: string[] | null
}

export interface PoolEntry {
  chainId: string
  lenderKey: string
  underlyingAddress: string
  assetGroup: string
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
  utilization: string
  configIds: number[]
  exposures: PoolExposure[]
}

interface PoolsApiResponse {
  ok: boolean
  start: number
  count: number
  pools: PoolEntry[]
}

// ============================================================================
// Endpoint
// ============================================================================

import { BACKEND_BASE_URL } from '../../config/backend'

const endpointPools = `${BACKEND_BASE_URL}/v1/data/lending/pools`

function buildPoolsUrl(base: string, chainIds?: (number | string)[], lenders?: string[]) {
  const url = new URL(base)

  const appendArray = (key: string, values?: (string | number)[]) => {
    if (!values || values.length === 0) return
    values.forEach((v) => url.searchParams.append(key, String(v)))
  }

  appendArray('chainId', chainIds)
  appendArray('lender', lenders)

  return url.toString()
}

// ============================================================================
// Hook
// ============================================================================

/**
 * useFlattenedPools
 * Fetches from the /lending/pools endpoint filtered by chainId and lender.
 */
export function useFlattenedPools(params: {
  chainId?: string
  lender?: string
  enabled?: boolean
}) {
  const chainId = params?.chainId
  const lender = params?.lender
  const enabled = params?.enabled ?? true

  const url = buildPoolsUrl(endpointPools, chainId ? [chainId] : [], lender ? [lender] : [])

  const { data, isLoading, isFetching, error } = useQuery<PoolsApiResponse>({
    queryKey: ['flattenedPools', url],
    enabled,
    queryFn: async () => {
      const r = await fetch(url)
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        throw new Error(`HTTP ${r.status}: ${text || r.statusText}`)
      }
      const json = (await r.json()) as PoolsApiResponse

      return {
        ok: json.ok,
        start: json.start ?? 0,
        count: json.count ?? 0,
        pools: Array.isArray(json?.pools) ? json.pools : [],
      }
    },
    refetchInterval: 8 * 60 * 1000,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })

  return {
    pools: data?.pools ?? [],
    count: data?.count ?? 0,
    isPoolsLoading: isLoading,
    isPoolsFetching: isFetching,
    error,
  }
}
