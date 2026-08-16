import { RewardEntry, totalRewardApr } from '../../components/lending/shared/rewards'
import { useQuery } from '@tanstack/react-query'
import type { PoolRisk, PoolOracleInfo, LenderInfo } from '../../sdk/lending-helper/poolTypes'
import type { AnyTermSheet } from '../../components/lending/terms/types'
import type {
  LenderData,
  LenderInfoMap,
  LenderSummary,
  PendleAssetData,
  PoolConfig,
  PoolConfigGroup,
  PoolDataItem,
} from '../../sdk/lending-helper/marketTypes'
import { apiFetch } from '../../sdk/http'

const endpointLendingLatest = '/v1/data/lending/latest'
const endpointLendingLenders = '/v1/data/lending/lenders'

/** Backend cap on the `lenders` query parameter for /lending/latest. */
const LENDERS_PER_REQUEST = 20

// ============================================================================
// Types for the /lending/latest API response
// ============================================================================

interface LendingLatestData {
  count: number
  items: LenderEntryRaw[]
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
  /**
   * Canonical fixed-term descriptor. `/lending/latest` serves it per LENDER
   * KEY (schemas.ts: "Fixed-term descriptor for this lender key"), not on the
   * market rows — and every fixed-term lender key we serve is one market
   * (Lista broker, Exactly market, Midnight/Term repo), so it is hoisted onto
   * each `PoolDataItem` where `fixedTermDetails()` expects to find it.
   */
  fixedTerm?: Record<string, unknown> | null
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
  /**
   * Reward programs as the API serves them: one entry per (reward token,
   * source), carrying symbol / logo / sourceLabel / link / endsAt. An ARRAY —
   * it used to be defaulted to `{}`, which discarded all provenance.
   */
  rewards: RewardEntry[]
  config: Record<string, PoolConfig>
  caps: { borrowCap: number | null; supplyCap: number | null; debtCeiling: number | null } | null
  flags: {
    isActive: boolean | null
    isFrozen: boolean | null
    hasStable: boolean | null
    borrowingEnabled: boolean | null
    collateralActive: boolean | null
    variableBorrowDisabled?: boolean | null
  } | null
  // Raw rate card — the API serializes termId/durationDays/apr as strings
  // (BROKERED_MARKETS.md §2); coerced to numbers in the transform.
  terms?: Array<{
    termId: number | string
    durationDays: number | string
    apr: number | string
  }> | null
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
  /** Oracle feed-correctness classification (top-level on /lending/latest markets). */
  oracleInfo?: PoolOracleInfo | null
  params?: any
}

// ============================================================================
// Transformed types for internal use
// ============================================================================

// ============================================================================
// Transform
// ============================================================================

function rawMarketToPoolDataItem(raw: RawMarket, entry?: LenderEntryRaw): PoolDataItem {
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
      props: asset.props,
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
    // Keep the ARRAY — RewardBadge renders per-program detail (token, source,
    // exact link, end date) off it. Defaulting to {} threw all of that away.
    rewards: Array.isArray(raw.rewards) ? raw.rewards : [],
    // Points programs are excluded from these totals: they have no priceable
    // value, so folding them in would overstate the yield. See RewardBadge.
    depositRewardApr: totalRewardApr(raw.rewards, 'deposit'),
    borrowRewardApr: totalRewardApr(raw.rewards, 'borrow'),
    // Prefer the program IDENTITY over the legacy mechanism tag — `source` is
    // 'merkle' for every Merkl campaign and so names nothing.
    rewardSources: Array.from(
      new Set(
        (Array.isArray(raw.rewards) ? raw.rewards : [])
          .map((r: any) => r?.sourceLabel ?? r?.sourceId ?? r?.source)
          .filter(Boolean)
      )
    ) as string[],
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
    termSheet: (raw as { termSheet?: AnyTermSheet }).termSheet,
    risk: raw.risk ?? null,
    oracleInfo: raw.oracleInfo ?? null,
    params: raw.params ?? entry?.params,
    // Both live on the lender ENTRY in `/lending/latest`, never on the market
    // row. Dropping them left `fixedTermDetails(pool)` null for every brokered
    // market, which silently hid the ↻ Refinance / Roll button on Lista.
    fixedTerm: (entry?.fixedTerm ?? null) as PoolDataItem['fixedTerm'],
    // Coerce the string-serialized rate card into clean numbers.
    terms: raw.terms
      ? raw.terms.map((t) => ({
          termId: Number(t.termId),
          durationDays: Number(t.durationDays),
          apr: Number(t.apr),
        }))
      : null,
    variableBorrowDisabled: raw.flags?.variableBorrowDisabled ?? false,
  }
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
      const data = await apiFetch<{ items: LenderSummary[] }>(endpointLendingLenders, {
        params: { chains: chainId, maxRiskScore },
      })
      // Defensively drop any item missing lenderInfo.key.
      return data.items.filter((it) => !!it.lenderInfo?.key)
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
        chunks.map((chunk) =>
          apiFetch<LendingLatestData>(endpointLendingLatest, {
            params: { chains: chainId, lenders: chunk.join(','), maxRiskScore },
          })
        )
      )

      // The lender key now lives on `entry.lenderInfo.key`. Skip any entry
      // that's missing it defensively rather than crashing the whole query.
      for (const data of responses) {
        for (const entry of data.items) {
          const key = entry.lenderInfo?.key
          if (!key) continue
          lenderData[key] = entry.markets.map((m) => rawMarketToPoolDataItem(m, entry))
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
      const data = await apiFetch<{ items: PoolConfigGroup[] }>(
        '/v1/data/lending/pools/by-config',
        { params: { chains: chainId, lenders: lenderKey, maxRiskScore } }
      )
      return data.items
    },
    enabled: !!chainId && !!lenderKey,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 5_000,
    retry: 1,
  })
}
