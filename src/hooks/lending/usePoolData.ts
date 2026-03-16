import { useQuery } from '@tanstack/react-query'
import type { PoolRiskBreakdown, PoolRisk } from './useFlattenedPools'
import { BACKEND_BASE_URL } from '../../config/backend'

const endpointLendingLatest = `${BACKEND_BASE_URL}/v1/data/lending/latest?chains=`

// ============================================================================
// Types for the /lending/latest API response (new format)
// ============================================================================

interface LendingLatestApiResponse {
  success: boolean
  data: { count: number; items: LenderEntryRaw[] }
  error?: { code: string; message: string }
}

interface LenderEntryRaw {
  chainId: string
  lenderKey: string
  lastFetched: number
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
 * Fetches public lending data for a specific chain.
 * Returns pools grouped by lender key.
 */
export function useMarginPublicData(chainId: string, enabled = true) {
  const {
    data: lenderData,
    isLoading,
    isFetching,
    error,
  } = useQuery<LenderData>({
    queryKey: ['lendingPublic', chainId],
    enabled,
    queryFn: async () => {
      const r = await fetch(endpointLendingLatest + chainId)
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        throw new Error(`HTTP ${r.status}: ${text || r.statusText}`)
      }
      const json = (await r.json()) as LendingLatestApiResponse
      if (!json.success) {
        throw new Error(json.error?.message ?? 'API returned success: false')
      }

      const transformed: LenderData = {}
      for (const entry of json.data.items) {
        transformed[entry.lenderKey] = entry.markets.map(rawMarketToPoolDataItem)
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

/**
 * Fetches pool data grouped by e-mode / pool configuration for a specific chain + lender.
 */
export function usePoolConfigData(chainId: string, lenderKey: string) {
  return useQuery<PoolConfigGroup[]>({
    queryKey: ['poolsByConfig', chainId, lenderKey],
    queryFn: async () => {
      const url = `${BACKEND_BASE_URL}/v1/data/lending/pools/by-config?chains=${chainId}&lenders=${lenderKey}`
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
