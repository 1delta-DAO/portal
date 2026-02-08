import { useQuery } from '@tanstack/react-query'

// @ts-ignore
const BACKEND_BASE_URL = `https://beta.data.1delta.io` // import.meta.env.VITE_MARGIN_API_URL
const endpointLendingLatest = `${BACKEND_BASE_URL}/lending/latest?chains=`

// ============================================================================
// Types for the /lending/latest API response (flat array)
// ============================================================================

interface LendingLatestApiResponse {
  ok: boolean
  data: LenderEntryRaw[]
}

interface LenderEntryRaw {
  chainId: string
  lender: string
  lastFetched: number
  markets: PoolDataItem[]
}

// ============================================================================
// Transformed types for internal use (pools indexed by poolId)
// ============================================================================

export type LenderData = {
  [chainId: string]: ChainLendingData
}

export interface ChainLendingData {
  data: {
    [lender: string]: LenderPoolData
  }
  lastFetched: number
}

export interface LenderPoolData {
  data: {
    [poolId: string]: PoolDataItem
  }
  chainId: string
}

export interface PoolDataItem {
  poolId: string
  underlying: string
  asset: PoolAsset
  totalDeposits: number
  totalDebtStable: number
  totalDebt: number
  totalLiquidity: number
  totalDepositsUSD: number
  totalDebtStableUSD: number
  totalDebtUSD: number
  totalLiquidityUSD: number
  depositRate: number
  variableBorrowRate: number
  stableBorrowRate: number
  intrinsicYield: number
  rewards: Record<string, unknown>
  config: Record<string, PoolConfig>
  borrowCap: number
  supplyCap: number
  debtCeiling: number
  collateralActive: boolean
  borrowingEnabled: boolean
  hasStable: boolean
  isActive: boolean
  isFrozen: boolean
  oraclePrice?: number
  oraclePriceUSD?: number
  params?: any
}

export interface PoolAsset {
  chainId: string
  decimals: number
  name: string
  address: string
  symbol: string
  logoURI: string
  assetGroup: string
  currencyId: string
  pendle?: PendleAssetData
}

export interface PendleAssetData {
  expiry: number
  syAddress: string
  tokenType: string
  ytAddress: string
  marketAddress: string
}

export interface PoolConfig {
  label: string
  category: number
  borrowFactor: number
  debtDisabled: boolean
  collateralFactor: number
  collateralDisabled: boolean
  borrowCollateralFactor: number
}

export interface FlattenedPool {
  chainId: string
  lender: string
  poolId: string
  pool: PoolDataItem
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Flattens LenderData into an array for display in tables/lists.
 * Optionally filter by chainId.
 */
export function flattenLenderData(
  lenderData: LenderData | undefined,
  filterChainId?: string
): FlattenedPool[] {
  if (!lenderData) return []

  const result: FlattenedPool[] = []

  for (const [chainId, chainData] of Object.entries(lenderData)) {
    if (filterChainId && chainId !== filterChainId) continue

    for (const [lender, lenderPoolData] of Object.entries(chainData.data)) {
      for (const [poolId, pool] of Object.entries(lenderPoolData.data)) {
        result.push({
          chainId,
          lender,
          poolId,
          pool,
        })
      }
    }
  }

  return result
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetches public lending data for a specific chain.
 * Returns data indexed by poolId for easy lookup.
 */
export function useMarginPublicData(chainId: string) {
  const {
    data: lenderData,
    isLoading,
    isFetching,
    error,
  } = useQuery<LenderData>({
    queryKey: ['lendingPublic', chainId],
    queryFn: async () => {
      const r = await fetch(endpointLendingLatest + chainId)
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        throw new Error(`HTTP ${r.status}: ${text || r.statusText}`)
      }
      const json = (await r.json()) as LendingLatestApiResponse
      if (!json.ok) {
        throw new Error('API returned ok: false')
      }

      // Transform flat array response into nested LenderData structure
      const transformed: LenderData = {}

      for (const entry of json.data) {
        const { chainId: cId, lender, lastFetched, markets } = entry

        if (!transformed[cId]) {
          transformed[cId] = { data: {}, lastFetched }
        }

        const poolDataByKey: Record<string, PoolDataItem> = {}
        for (const pool of markets) {
          poolDataByKey[pool.poolId] = pool
        }

        transformed[cId].data[lender] = {
          data: poolDataByKey,
          chainId: cId,
        }

        // Keep the most recent lastFetched
        if (lastFetched > transformed[cId].lastFetched) {
          transformed[cId].lastFetched = lastFetched
        }
      }

      return transformed
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 5_000,
    retry: 1,
  })

  return {
    lenderData,
    isPublicDataLoading: isLoading,
    isPublicDataFetching: isFetching,
    error,
  }
}
