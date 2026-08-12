import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { apiFetchLoose } from '../../sdk/http'

/**
 * Client for the comparable-rates endpoint:
 *
 *   GET /v1/data/lending/comparables?chainId=…&debt=…&collateral=…&amount=…&horizonDays=…
 *
 * The N best rates for the SAME trade across every venue we index, priced at the
 * user's size and holding period. Backs the rate pill next to a borrow input.
 *
 * Three rates come back per venue and mean different things — don't collapse
 * them:
 *   `aprPct`          what the venue advertises (0 notional / top of book)
 *   `aprAtAmountPct`  that rate at the entered size
 *   `effectiveAprPct` the size-priced rate normalized to the horizon — the one
 *                     the server ranks on, and the only one comparable across a
 *                     fixed term and a floating pool
 *
 * All three are PERCENT (4.04 = 4.04%), unlike the optimizer rows, which carry
 * fractions. Convert at the boundary, not in here.
 */

export type ComparableRateType = 'fixed' | 'float'

export type ComparableRateModel =
  | 'variable'
  | 'lista'
  | 'midnight'
  | 'term'
  | 'exactly'
  | 'teller'
  | 'fixedTerm'
  | 'userSet'
  | 'zeroInterest'

export interface ComparableHorizon {
  /**
   * How the effective rate was reached — decides the caveat the UI shows:
   * `flat-forward` (floating rate assumed to hold), `early-exit` (the venue's
   * exit rule applied), `held-to-maturity` (clean), `rolled` (a roll assumed).
   */
  basis: 'flat-forward' | 'early-exit' | 'held-to-maturity' | 'rolled'
  /** Rate contractually fixed for the WHOLE horizon? */
  locked: boolean
  /** Early exit unwinds on a book at the then-current price (Midnight/Term). */
  priceRisk: boolean
  /** Display-ready caveats, most important first. */
  assumptions: string[]
}

export interface ComparableAsset {
  address: string
  assetGroup?: string
  symbol?: string
  decimals?: number
  logoUri?: string | null
  marketUid?: string
}

export interface ComparableRate {
  rank: number
  chainId: string
  /** Raw key — use for deeplinks/keying, never for display. */
  lender: string
  /**
   * Display name from the server's lender registry. Per-market lenders (Morpho
   * Blue, Silo, Euler) key by a hashed market id, so the raw key is unreadable;
   * the server falls back to the key when no name is registered.
   */
  lenderName: string
  lenderLogoUri: string | null
  marketUid: string
  marketName?: string | null
  curatorName?: string | null
  eMode?: string | null

  rateType: ComparableRateType
  rateModel: ComparableRateModel
  /** Sticker rate, APR %. */
  aprPct: number
  /** Rate at the requested size, APR %. Null when no amount was sent. */
  aprAtAmountPct: number | null
  /** Reward APR folded into the headline (positive = subsidising the borrow). */
  rewardAprPct: number | null
  /**
   * The rate without reward emissions. A borrow rate can go NEGATIVE on
   * incentives, which reads as a spectacular deal — show this next to it so the
   * structural cost is visible.
   */
  aprExRewardsPct: number | null
  /** Horizon-normalized rate, APR %. The ranking number. */
  effectiveAprPct: number | null
  /** Total cost over the horizon, % of principal. */
  costPct: number | null
  horizon: ComparableHorizon | null

  termId: string | null
  durationDays: number | null
  maturity: number | null
  /** Remaining term in days for a position opened now. */
  termDays: number | null

  /**
   * Can this rate be taken right now? False for a Term repo between auction
   * rounds — its card still quotes the last round's clearing rate.
   */
  obtainable: boolean
  obtainableReason: string | null
  quoteBasis: 'live' | 'last-clearing'
  depth: {
    fillable: number | null
    /** Requested size exceeds this venue's depth — it cannot fund the position. */
    capped: boolean
    liquidityUsd: number | null
    utilization: number | null
  }

  collateral: ComparableAsset
  debt: ComparableAsset
  maxLeverage: number | null
  ltv: number | null
  risk: { configScore: number | null; maxTokenScore: number | null }
}

export interface ComparableRatesResult {
  side: 'borrow' | 'supply'
  horizonDays: number
  /** Distinct comparables that existed before `limit`. */
  available: number
  /** True ⇒ the server's candidate cap bound; the ranking saw only the deepest rows. */
  truncated: boolean
  /** Venues below this USD depth were dropped as not comparable (0 = no floor). */
  liquidityFloorUsd: number
  /** How many were dropped by that floor — the filter is never silent. */
  droppedIlliquid: number
  /**
   * Venues hidden because their market data is stale (an ingest lag, not an
   * absent lender). **Diagnostic only — do not render it.** It tells a developer
   * why a comparison looks thin, but a borrower can't act on our pipeline
   * freshness and surfacing it just advertises the gap. Read it in devtools.
   */
  droppedStale: number
  staleMaxHours: number
  /**
   * The single collateral each chain's rows were compared against when the
   * caller pinned none, e.g. `{ '1': 'ETH' }`. Empty when a collateral was given.
   */
  collateralBasis: Record<string, string>
  /** The venue the caller is already on, pulled out of `items`. */
  reference: ComparableRate | null
  items: ComparableRate[]
}

export interface ComparableRatesParams {
  chainId?: string
  /** Debt asset address — required for `side: 'borrow'`. */
  debt?: string
  /** Collateral asset address. Omit and the comparison ignores collateral eligibility. */
  collateral?: string
  side?: 'borrow' | 'supply'
  /** Notional in TOKEN units of the priced leg. */
  amount?: number
  /** Holding period the venues are repriced to. */
  horizonDays?: number
  rateType?: 'all' | 'fixed' | 'float'
  limit?: number
  /** The market the user is already looking at — returned as `reference`. */
  referenceMarketUid?: string
  referenceTermId?: string
  includeUnobtainable?: boolean
}

const EMPTY: ComparableRatesResult = {
  side: 'borrow',
  horizonDays: 365,
  available: 0,
  truncated: false,
  liquidityFloorUsd: 0,
  droppedIlliquid: 0,
  droppedStale: 0,
  staleMaxHours: 48,
  collateralBasis: {},
  reference: null,
  items: [],
}

async function fetchComparables(p: ComparableRatesParams): Promise<ComparableRatesResult> {
  const d = await apiFetchLoose<Partial<ComparableRatesResult>>('/v1/data/lending/comparables', {
    params: {
      chainId: p.chainId,
      debt: p.debt,
      collateral: p.collateral,
      side: p.side,
      amount: p.amount != null && p.amount > 0 ? p.amount : undefined,
      horizonDays: p.horizonDays,
      rateType: p.rateType && p.rateType !== 'all' ? p.rateType : undefined,
      limit: p.limit,
      referenceMarketUid: p.referenceMarketUid,
      referenceTermId: p.referenceTermId,
      includeUnobtainable: p.includeUnobtainable ? 'true' : undefined,
    },
  })
  return {
    side: d.side ?? 'borrow',
    horizonDays: d.horizonDays ?? 365,
    available: d.available ?? 0,
    truncated: d.truncated ?? false,
    liquidityFloorUsd: d.liquidityFloorUsd ?? 0,
    droppedIlliquid: d.droppedIlliquid ?? 0,
    droppedStale: d.droppedStale ?? 0,
    staleMaxHours: d.staleMaxHours ?? 48,
    collateralBasis: d.collateralBasis ?? {},
    reference: d.reference ?? null,
    items: d.items ?? [],
  }
}

/**
 * Fetch comparable rates for one pair. Disabled (no request) until the priced
 * leg is known, so callers can pass a half-filled form straight through.
 *
 * The amount is deliberately NOT in the query key at full precision — it is
 * bucketed, so typing a number doesn't fire a request per keystroke while still
 * re-pricing once the size changes materially.
 */
export function useComparableRates(params: ComparableRatesParams, enabled = true) {
  const pricedLeg = params.side === 'supply' ? params.collateral : params.debt
  const amountBucket = bucketAmount(params.amount)
  return useQuery({
    queryKey: [
      'comparable-rates',
      params.chainId,
      params.side ?? 'borrow',
      params.debt,
      params.collateral,
      amountBucket,
      params.horizonDays,
      params.rateType,
      params.limit,
      params.referenceMarketUid,
      params.referenceTermId,
      params.includeUnobtainable,
    ],
    queryFn: () => fetchComparables({ ...params, amount: amountBucket }),
    enabled: enabled && !!pricedLeg,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

/**
 * Round an amount to 2 significant figures. Depth curves are smooth, so pricing
 * 51,234 as 51,000 moves the rate by nothing a UI can render — while collapsing
 * a whole keystroke sequence into one cache key.
 */
function bucketAmount(amount?: number): number | undefined {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return undefined
  const mag = Math.pow(10, Math.floor(Math.log10(amount)) - 1)
  return Math.round(amount / mag) * mag
}

export { EMPTY as EMPTY_COMPARABLES }
