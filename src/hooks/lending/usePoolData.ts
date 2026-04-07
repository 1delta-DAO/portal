import { useQuery } from '@tanstack/react-query'
import type { PoolRiskBreakdown, PoolRisk, LenderInfo } from './useFlattenedPools'
import { BACKEND_BASE_URL } from '../../config/backend'

const endpointLendingLatest = `${BACKEND_BASE_URL}/v1/data/lending/latest`
const endpointLendingLenders = `${BACKEND_BASE_URL}/v1/data/lending/lenders`

/** Backend cap on the `lenders` query parameter for /lending/latest. */
const LENDERS_PER_REQUEST = 20

// ============================================================================
// Types for the /lending/latest API response
// ============================================================================

interface LendingLatestApiResponse {
  success: boolean
  data: { count: number; items: LenderEntryRaw[] }
  actions?: unknown
  error?: { code: string; message: string }
}

interface LenderEntryRaw {
  chainId: string
  /** The lender key now lives on lenderInfo.key — there is no top-level lenderKey. */
  lenderInfo: LenderInfo
  lastFetched: number
  /** Aggregate USD totals across all markets in this lender entry. */
  totalDepositsUsd: number
  totalDebtUsd: number
  tvlUsd: number
  /** Lender-wide params (e.g. Morpho/Lista market metadata). Free-form. */
  params?: Record<string, unknown>
  markets: RawMarket[]
}

/** Shape of each market as returned by the new /lending/latest API */
interface RawMarket {
  marketUid: string
  name: string
  totalDeposits: number
  totalDebtStable: number
  totalDebt: number
  totalLiquidity: number
  totalDepositsUsd: number
  totalDebtStableUsd: number
  totalDebtUsd: number
  totalLiquidityUsd: number
  depositRate: number
  variableBorrowRate: number
  stableBorrowRate: number
  intrinsicYield: number
  rewards: Record<string, unknown>
  config: Record<string, PoolConfig>
  caps: { borrowCap: number | null; supplyCap: number | null; debtCeiling: number | null } | null
  flags: {
    isActive: boolean | null
    isFrozen: boolean | null
    hasStable: boolean | null
    borrowingEnabled: boolean | null
    collateralActive: boolean | null
  } | null
  underlyingInfo: {
    asset: {
      chainId: string
      decimals: number
      name: string
      address: string
      symbol: string
      logoURI: string
      assetGroup: string
      currencyId: string
      props?: Record<string, unknown>
    }
    oraclePrice: { oraclePrice: number | null; oraclePriceUsd: number | null } | null
    prices: Record<string, unknown> | null
  }
  risk?: PoolRisk | null
  params?: any
}

// ============================================================================
// Transformed types for internal use
// ============================================================================

/** Pools grouped by lender key. One level — no chainId wrapping. */
export type LenderData = {
  [lender: string]: PoolDataItem[]
}

/** Lender info map keyed by lender key. */
export type LenderInfoMap = {
  [lender: string]: LenderInfo
}

/**
 * Lightweight per-(chain, lender) summary returned by /lending/lenders.
 * Used to drive the lender dropdown without paying the cost of fetching
 * full per-market data for every lender.
 */
export interface LenderSummary {
  chainId: string
  lenderInfo: LenderInfo
  /** TVL in USD across all of this lender's markets on this chain. */
  tvlUsd: number
  /** Server-side timestamp the underlying data was last refreshed. */
  lastFetched: number
}

interface LendingLendersApiResponse {
  success: boolean
  data: { count: number; items: LenderSummary[] }
  actions?: unknown
  error?: { code: string; message: string }
}

export interface PoolDataItem {
  marketUid: string
  name: string
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
  risk?: PoolRisk | null
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

// ============================================================================
// Transform
// ============================================================================

function rawMarketToPoolDataItem(raw: RawMarket): PoolDataItem {
  const info = raw.underlyingInfo
  const asset = info.asset
  return {
    marketUid: raw.marketUid,
    name: raw.name,
    underlying: asset.address,
    asset: {
      chainId: asset.chainId,
      decimals: asset.decimals,
      name: asset.name,
      address: asset.address,
      symbol: asset.symbol,
      logoURI: asset.logoURI,
      assetGroup: asset.assetGroup,
      currencyId: asset.currencyId,
      pendle: asset.props?.pendle as PendleAssetData | undefined,
    },
    totalDeposits: raw.totalDeposits,
    totalDebtStable: raw.totalDebtStable,
    totalDebt: raw.totalDebt,
    totalLiquidity: raw.totalLiquidity,
    totalDepositsUSD: raw.totalDepositsUsd,
    totalDebtStableUSD: raw.totalDebtStableUsd,
    totalDebtUSD: raw.totalDebtUsd,
    totalLiquidityUSD: raw.totalLiquidityUsd,
    depositRate: raw.depositRate,
    variableBorrowRate: raw.variableBorrowRate,
    stableBorrowRate: raw.stableBorrowRate,
    intrinsicYield: raw.intrinsicYield,
    rewards: raw.rewards ?? {},
    config: raw.config ?? {},
    borrowCap: raw.caps?.borrowCap ?? 0,
    supplyCap: raw.caps?.supplyCap ?? 0,
    debtCeiling: raw.caps?.debtCeiling ?? 0,
    collateralActive: raw.flags?.collateralActive ?? true,
    borrowingEnabled: raw.flags?.borrowingEnabled ?? true,
    hasStable: raw.flags?.hasStable ?? false,
    isActive: raw.flags?.isActive ?? true,
    isFrozen: raw.flags?.isFrozen ?? false,
    oraclePrice: info.oraclePrice?.oraclePrice ?? undefined,
    oraclePriceUSD: info.oraclePrice?.oraclePriceUsd ?? undefined,
    risk: raw.risk ?? null,
    params: raw.params,
  }
}

// ============================================================================
// Types for the /pools/by-config API response
// ============================================================================

interface PoolsByConfigApiResponse {
  success: boolean
  data: { count: number; items: PoolConfigGroup[] }
  error?: { code: string; message: string }
}

export interface PoolConfigGroup {
  lenderKey: string
  chainId: string
  configId: string
  label: string
  category: string
  collaterals: ConfigMarketItem[] | null
  borrowables: ConfigMarketItem[] | null
  configRiskScore: number | null
  configRiskLabel: string | null
  configRiskBreakdown?: PoolRiskBreakdown[]
}

export interface ConfigMarketItem {
  marketUid: string
  depositRate: number
  borrowFactor: number
  totalDebtUsd: number
  intrinsicYield: number | null
  underlyingInfo: {
    asset: {
      name: string
      symbol: string
      address: string
      chainId: string
      logoURI: string
      decimals: number
      assetGroup: string
      currencyId: string
      intrinsicYield: number | null
      props?: Record<string, unknown> | null
    }
    prices: {
      priceUsd: number
      priceUsd24h: number
      priceTs: string
      priceTs24h: string
    } | null
    tokenRisk?: {
      riskLabel: string
      riskScore: number
    } | null
    oraclePrice: {
      oraclePrice: number
      oraclePriceUsd: number
    } | null
  }
  collateralFactor: number
  stableBorrowRate: number
  totalDepositsUsd: number
  variableBorrowRate: number
  borrowCollateralFactor: number
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetches the lightweight lender enumeration for a chain — one entry per
 * (chainId, lenderKey), sorted server-side by `tvlUsd` desc. Use this to
 * drive the lender dropdown without paying the cost of fetching full
 * per-market data for every lender.
 *
 * Endpoint: `GET /v1/data/lending/lenders?chains=<chainId>`
 */
export function useLenders(chainId: string, enabled = true, maxRiskScore = 6) {
  const { data, isLoading, isFetching, error } = useQuery<LenderSummary[]>({
    queryKey: ['lendingLenders', chainId],
    enabled: enabled && !!chainId,
    queryFn: async () => {
      const url = `${endpointLendingLenders}?chains=${chainId}&maxRiskScore=${maxRiskScore}`
      const r = await fetch(url)
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        throw new Error(`HTTP ${r.status}: ${text || r.statusText}`)
      }
      const json = (await r.json()) as LendingLendersApiResponse
      if (!json.success) {
        throw new Error(json.error?.message ?? 'API returned success: false')
      }
      // Defensively drop any item missing lenderInfo.key.
      return json.data.items.filter((it) => !!it.lenderInfo?.key)
    },
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
 * Fetches full per-market lending data for a specific (chain, lenders) pair.
 * `/lending/latest` requires both `chains` and `lenders` and caps the
 * `lenders` list at {@link LENDERS_PER_REQUEST} keys per request, so this
 * hook chunks the input array internally and merges the results.
 *
 * Returns pools grouped by lender key.
 *
 * Pass an empty `lenderKeys` array to skip the fetch entirely (useful while
 * the lighter `useLenders` enumeration is still loading).
 */
export function useMarginPublicData(
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
    queryFn: async () => {
      // Chunk the lenders into batches that respect the backend's per-request cap.
      const chunks: string[][] = []
      for (let i = 0; i < sortedKeys.length; i += LENDERS_PER_REQUEST) {
        chunks.push(sortedKeys.slice(i, i + LENDERS_PER_REQUEST))
      }

      const lenderData: LenderData = {}
      const lenderInfoMap: LenderInfoMap = {}

      // Fire all chunks in parallel — the backend handles them independently
      // and we merge the results into a single keyed map.
      const responses = await Promise.all(
        chunks.map(async (chunk) => {
          const url = `${endpointLendingLatest}?chains=${chainId}&lenders=${chunk.join(',')}&maxRiskScore=${maxRiskScore}`
          const r = await fetch(url)
          if (!r.ok) {
            const text = await r.text().catch(() => '')
            throw new Error(`HTTP ${r.status}: ${text || r.statusText}`)
          }
          const json = (await r.json()) as LendingLatestApiResponse
          if (!json.success) {
            throw new Error(json.error?.message ?? 'API returned success: false')
          }
          return json
        })
      )

      // The lender key now lives on `entry.lenderInfo.key`. Skip any entry
      // that's missing it defensively rather than crashing the whole query.
      for (const json of responses) {
        for (const entry of json.data.items) {
          const key = entry.lenderInfo?.key
          if (!key) continue
          lenderData[key] = entry.markets.map(rawMarketToPoolDataItem)
          lenderInfoMap[key] = entry.lenderInfo
        }
      }

      return { lenderData, lenderInfoMap }
    },
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
    queryFn: async () => {
      const url = `${BACKEND_BASE_URL}/v1/data/lending/pools/by-config?chains=${chainId}&lenders=${lenderKey}&maxRiskScore=${maxRiskScore}`
      const r = await fetch(url)
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        throw new Error(`HTTP ${r.status}: ${text || r.statusText}`)
      }
      const json = (await r.json()) as PoolsByConfigApiResponse
      if (!json.success) {
        throw new Error(json.error?.message ?? 'API returned success: false')
      }
      return json.data.items
    },
    enabled: !!chainId && !!lenderKey,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 5_000,
    retry: 1,
  })
}
