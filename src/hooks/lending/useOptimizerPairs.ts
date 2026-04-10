import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { BACKEND_BASE_URL } from '../../config/backend'

/**
 * Client for the optimizer endpoint:
 *
 *   GET /v1/data/lending/pairs/optimize
 *
 * Replaces the older `/pairs/by-collateral` and `/pairs/by-debt` endpoints,
 * which were structurally identical except for which side was required.
 *
 * Wire format notes that aren't obvious from the swagger:
 *
 *  - Numeric fields can come back either as JSON numbers or as decimal
 *    strings (the backend uses strings to preserve precision on the SQL
 *    `numeric` columns). The `num` helper handles both transparently.
 *  - APR fields (`aprBase`, `aprTotal`, `depositAprLong`, `borrowAprShort`,
 *    `rewardApr*`) are returned in **percent units** (e.g. `2.19` = 2.19%)
 *    while `ltv`, `utilizationLong`, `utilizationShort` are already
 *    fractions. The normaliser divides APRs by 100 so the rest of the UI
 *    can use a single `fmtPct` formatter.
 *  - The new envelope is `{ ok, total, count, pairs, ... }`. We tolerate
 *    the legacy `{ success, data: { items, count } }` shape too so a
 *    rolling backend deployment doesn't break the UI.
 */

/**
 * UI-only direction toggle. The endpoint accepts both sides simultaneously,
 * so this only controls *which* side gets the optional amount input + which
 * "max debt" / "min collateral" column is shown in the table.
 */
export type OptimizerDirection = 'by-collateral' | 'by-debt'

export type OptimizerSortKey =
  | 'aprTotal'
  | 'aprBase'
  | 'maxLeverage'
  | 'ltv'
  | 'depositAprLong'
  | 'borrowAprShort'
  | 'totalDepositsUsdLong'
  | 'totalDepositsUsdShort'
  | 'totalDebtUsdLong'
  | 'totalDebtUsdShort'
  | 'totalLiquidityUsdLong'
  | 'totalLiquidityUsdShort'
  | 'utilizationLong'
  | 'utilizationShort'
  | 'borrowLiquidityShort'

export interface OptimizerAssetRef {
  chainId: string
  address: string
  symbol?: string
  name?: string
  decimals?: number
  logoURI?: string
  assetGroup?: string
  priceUsd?: number
}

// ---------------------------------------------------------------------------
// Raw API shape
// ---------------------------------------------------------------------------

interface RawAssetInfo {
  asset?: {
    chainId?: string
    address?: string
    symbol?: string
    name?: string
    decimals?: number
    logoURI?: string
    assetGroup?: string
  }
  prices?: { priceUsd?: number } | null
  oraclePrice?: { oraclePriceUsd?: number } | null
}

interface RawOptimizerPair {
  chainId: string
  lender: string
  marketLongUid?: string
  marketShortUid?: string
  maxLeverage?: string | number
  eModeConfigId?: string | number
  eMode?: string | number
  collateralFactorLong?: string | number
  borrowCollateralFactorLong?: string | number
  borrowFactorShort?: string | number
  ltv?: string | number
  depositAprLong?: string | number
  borrowAprShort?: string | number
  rewardAprLong?: string | number
  rewardAprShort?: string | number
  aprBase?: string | number
  aprTotal?: string | number
  totalDepositsUsdLong?: string | number
  totalDebtUsdLong?: string | number
  totalLiquidityUsdLong?: string | number
  totalDepositsUsdShort?: string | number
  totalDebtUsdShort?: string | number
  totalLiquidityUsdShort?: string | number
  utilizationLong?: string | number
  utilizationShort?: string | number
  depositableLong?: string | number | null
  borrowLiquidityShort?: string | number | null
  underlyingInfoLong?: RawAssetInfo
  underlyingInfoShort?: RawAssetInfo
  // New (camelCase) amount-derived fields from /pairs/optimize.
  maxDebtAmount?: string | number | null
  maxDebtAmountUsd?: string | number | null
  minCollateralAmount?: string | number | null
  minCollateralAmountUsd?: string | number | null
  // Legacy snake_case fallbacks (older deployments).
  max_debt_amount?: string | number | null
  min_collateral_amount?: string | number | null
  [extra: string]: unknown
}

interface EnvelopeBody {
  start?: number
  count?: number
  total?: number | null
  hasMore?: boolean | null
  nextStart?: number | null
  /** New /pairs/optimize field name. */
  pairs?: RawOptimizerPair[]
  /** Legacy key — older deployments returned `items` instead of `pairs`. */
  items?: RawOptimizerPair[]
}

interface OptimizerApiResponse extends EnvelopeBody {
  // The backend wraps the envelope inside `{ success, data }` to match the
  // rest of /v1/data/lending/*, but the swagger shows the body fields at
  // the top level. Tolerate either layout.
  ok?: boolean
  success?: boolean
  data?: EnvelopeBody
  // Error in either shape
  error?: string | { code?: string; message?: string }
}

// ---------------------------------------------------------------------------
// Normalised row used by the UI
// ---------------------------------------------------------------------------

export interface OptimizerPairRow {
  chainId: string
  lenderKey: string
  marketLongUid?: string
  marketShortUid?: string
  /**
   * E-mode / config the LTV + leverage in this row were computed against.
   * Required for handoffs into Lending/Loop so the receiving panel can
   * pre-select the same config and the user sees consistent numbers.
   */
  eModeConfigId?: string
  collateral: OptimizerAssetRef
  debt: OptimizerAssetRef
  /** APRs as fractions (0.05 = 5%). */
  depositAprLong: number
  borrowAprShort: number
  rewardAprLong: number
  rewardAprShort: number
  aprBase: number
  aprTotal: number
  /** Loan-to-value as a fraction. */
  ltv: number
  maxLeverage: number
  /** Utilizations as fractions. */
  utilizationLong: number
  utilizationShort: number
  totalDepositsUsdLong: number
  totalDebtUsdLong: number
  totalLiquidityUsdLong: number
  totalDepositsUsdShort: number
  totalDebtUsdShort: number
  totalLiquidityUsdShort: number
  borrowLiquidityShort: number
  /** Optional amount-derived columns. */
  maxDebtAmount?: number
  maxDebtAmountUsd?: number
  minCollateralAmount?: number
  minCollateralAmountUsd?: number
}

const num = (v: unknown): number => {
  if (v == null) return NaN
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

const numOr0 = (v: unknown): number => {
  const n = num(v)
  return Number.isFinite(n) ? n : 0
}

const optNum = (v: unknown): number | undefined => {
  if (v == null) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function asAssetRef(info: RawAssetInfo | undefined, fallbackChainId: string): OptimizerAssetRef {
  const a = info?.asset
  return {
    chainId: a?.chainId ?? fallbackChainId,
    address: (a?.address ?? '').toLowerCase(),
    symbol: a?.symbol,
    name: a?.name,
    decimals: a?.decimals,
    logoURI: a?.logoURI,
    assetGroup: a?.assetGroup,
    priceUsd: info?.prices?.priceUsd ?? info?.oraclePrice?.oraclePriceUsd,
  }
}

function normalisePair(raw: RawOptimizerPair): OptimizerPairRow {
  return {
    chainId: raw.chainId,
    lenderKey: raw.lender,
    marketLongUid: raw.marketLongUid,
    marketShortUid: raw.marketShortUid,
    eModeConfigId: raw.eModeConfigId != null ? String(raw.eModeConfigId) : undefined,
    collateral: asAssetRef(raw.underlyingInfoLong, raw.chainId),
    debt: asAssetRef(raw.underlyingInfoShort, raw.chainId),
    // APR fields are percent units in the API → convert to fractions.
    depositAprLong: numOr0(raw.depositAprLong) / 100,
    borrowAprShort: numOr0(raw.borrowAprShort) / 100,
    rewardAprLong: numOr0(raw.rewardAprLong) / 100,
    rewardAprShort: numOr0(raw.rewardAprShort) / 100,
    aprBase: numOr0(raw.aprBase) / 100,
    aprTotal: numOr0(raw.aprTotal) / 100,
    // LTV / utilizations are already fractions.
    ltv: numOr0(raw.ltv),
    maxLeverage: numOr0(raw.maxLeverage),
    utilizationLong: numOr0(raw.utilizationLong),
    utilizationShort: numOr0(raw.utilizationShort),
    totalDepositsUsdLong: numOr0(raw.totalDepositsUsdLong),
    totalDebtUsdLong: numOr0(raw.totalDebtUsdLong),
    totalLiquidityUsdLong: numOr0(raw.totalLiquidityUsdLong),
    totalDepositsUsdShort: numOr0(raw.totalDepositsUsdShort),
    totalDebtUsdShort: numOr0(raw.totalDebtUsdShort),
    totalLiquidityUsdShort: numOr0(raw.totalLiquidityUsdShort),
    borrowLiquidityShort: numOr0(raw.borrowLiquidityShort),
    maxDebtAmount: optNum(raw.maxDebtAmount ?? raw.max_debt_amount),
    maxDebtAmountUsd: optNum(raw.maxDebtAmountUsd),
    minCollateralAmount: optNum(raw.minCollateralAmount ?? raw.min_collateral_amount),
    minCollateralAmountUsd: optNum(raw.minCollateralAmountUsd),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface OptimizerFilters {
  /** Long-side filter. Token addresses (single chain) or asset groups (multi/no chain). */
  collaterals?: string[]
  /** Short-side filter. Same dual semantics. */
  debts?: string[]
  /** Force group semantics regardless of chain mode. */
  collateralGroups?: string[]
  debtGroups?: string[]

  // At most one of these four. Token-unit forms require exactly one asset
  // on that side; USD forms work with multi-asset selections.
  collateralAmount?: number
  collateralAmountUsd?: number
  debtAmount?: number
  debtAmountUsd?: number

  chainId?: string
  chainIds?: string[]

  lender?: string
  /** CSV of lender keys (prefix-expanded server-side). */
  lenders?: string[]
  excludeLenders?: string[]

  minApr?: number
  maxApr?: number
  minLeverage?: number
  minDepositApr?: number
  maxBorrowRate?: number
  minLtv?: number
  maxUtilizationLong?: number
  maxUtilizationShort?: number
  minLiquidityUsdLong?: number
  minBorrowLiquidityUsd?: number
  minDepositsUsdLong?: number
  minDebtUsdShort?: number

  maxRiskScore?: number
  maxConfigRiskScore?: number
  maxTokenRiskScore?: number
  maxChainRiskScore?: number
  maxLenderRiskScore?: number

  start?: number
  count?: number
  sortBy?: OptimizerSortKey
  sortDir?: 'ASC' | 'DESC'
}

function buildUrl(filters: OptimizerFilters): string {
  const params = new URLSearchParams()

  const csv = (key: string, v: string[] | undefined) => {
    if (!v?.length) return
    params.set(key, v.join(','))
  }
  csv('collaterals', filters.collaterals)
  csv('debts', filters.debts)
  csv('collateralGroups', filters.collateralGroups)
  csv('debtGroups', filters.debtGroups)
  csv('lenders', filters.lenders)
  csv('excludeLenders', filters.excludeLenders)

  const maybe = <T>(key: string, v: T | undefined) => {
    if (v === undefined || v === null || v === '' || (typeof v === 'number' && Number.isNaN(v)))
      return
    params.set(key, String(v))
  }

  if (filters.chainIds?.length) {
    params.set('chainIds', filters.chainIds.join(','))
  } else {
    maybe('chainId', filters.chainId)
  }
  maybe('lender', filters.lender)
  maybe('collateralAmount', filters.collateralAmount)
  maybe('collateralAmountUsd', filters.collateralAmountUsd)
  maybe('debtAmount', filters.debtAmount)
  maybe('debtAmountUsd', filters.debtAmountUsd)
  maybe('minApr', filters.minApr)
  maybe('maxApr', filters.maxApr)
  maybe('minLeverage', filters.minLeverage)
  maybe('minDepositApr', filters.minDepositApr)
  maybe('maxBorrowRate', filters.maxBorrowRate)
  maybe('minLtv', filters.minLtv)
  maybe('maxUtilizationLong', filters.maxUtilizationLong)
  maybe('maxUtilizationShort', filters.maxUtilizationShort)
  maybe('minLiquidityUsdLong', filters.minLiquidityUsdLong)
  maybe('minBorrowLiquidityUsd', filters.minBorrowLiquidityUsd)
  maybe('minDepositsUsdLong', filters.minDepositsUsdLong)
  maybe('minDebtUsdShort', filters.minDebtUsdShort)
  maybe('maxRiskScore', filters.maxRiskScore)
  maybe('maxConfigRiskScore', filters.maxConfigRiskScore)
  maybe('maxTokenRiskScore', filters.maxTokenRiskScore)
  maybe('maxChainRiskScore', filters.maxChainRiskScore)
  maybe('maxLenderRiskScore', filters.maxLenderRiskScore)
  maybe('start', filters.start)
  maybe('count', filters.count)
  maybe('sortBy', filters.sortBy)
  maybe('sortDir', filters.sortDir)

  return `${BACKEND_BASE_URL}/v1/data/lending/pairs/optimize?${params.toString()}`
}

export function useOptimizerPairs(filters: OptimizerFilters, enabled = true) {
  const hasAnyAssetFilter =
    !!filters.collaterals?.length ||
    !!filters.debts?.length ||
    !!filters.collateralGroups?.length ||
    !!filters.debtGroups?.length
  const canQuery = enabled && hasAnyAssetFilter
  const url = canQuery ? buildUrl(filters) : ''

  const query = useQuery<{ total: number; rows: OptimizerPairRow[] }>({
    queryKey: ['optimizerPairs', url],
    enabled: canQuery,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchInterval: 2 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const r = await fetch(url)
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        throw new Error(`HTTP ${r.status}: ${text || r.statusText}`)
      }
      const json = (await r.json()) as OptimizerApiResponse
      const ok = json.ok ?? json.success
      if (ok === false) {
        const errMsg =
          typeof json.error === 'string'
            ? json.error
            : (json.error?.message ?? 'API returned ok: false')
        throw new Error(errMsg)
      }
      // The envelope body may live at the top level *or* under `data`
      // depending on deployment. Merge them, preferring whichever side has
      // the row list populated.
      const body: EnvelopeBody = json.data ?? json
      const rawItems = body.pairs ?? body.items ?? []
      const rows = rawItems
        .map(normalisePair)
        .filter((row) => !!row.collateral.address && !!row.debt.address)
      // `total` is the post-WHERE count from a `COUNT(*) OVER ()` window.
      // Fall back to the legacy per-page `count` and then to the row length
      // so pagination still renders something sensible against older backends.
      const total = body.total ?? body.count ?? rows.length
      return { total, rows }
    },
  })

  return {
    rows: query.data?.rows ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}
