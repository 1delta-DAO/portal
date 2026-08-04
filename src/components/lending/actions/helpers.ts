import type { FixedTermDetails } from '../shared/fixedTerm'

/** Lenders that support multiple sub-accounts per user */
const MULTI_ACCOUNT_LENDERS = new Set(['INIT', 'EULER_V2', 'DOLOMITE'])

export function lenderSupportsSubAccounts(lender?: string): boolean {
  if (!lender) return false
  return (
    MULTI_ACCOUNT_LENDERS.has(lender) ||
    lender.startsWith('FLUID_') ||
    lender.startsWith('GEARBOX_')
  )
}

/**
 * Morpho Midnight markets (fixed-rate, fixed-maturity order-book). Detected from
 * the lender segment of a `marketUid` (`MORPHO_MIDNIGHT_<id>:<chain>:<token>`) or
 * a raw lender key. Mirrors `isMidnight` in `@1delta/lender-registry`.
 *
 * Native ETH ↔ wrapped-native routing is left enabled in the UI even though
 * Midnight has no composer path yet — the API rejects it with a 501 and the
 * error surfaces in the panel. See calldata-sdk `midnight/COMPOSER_PLAN.md`.
 */
export function isMidnightMarket(marketUidOrLender?: string | null): boolean {
  if (!marketUidOrLender) return false
  return marketUidOrLender.split(':')[0].startsWith('MORPHO_MIDNIGHT')
}

/** True for Exactly markets — the single cross-margin `EXACTLY` key, or any
 *  marketUid built on it (`EXACTLY:<chainId>:<asset>`). */
export function isExactlyMarket(marketUidOrLender?: string | null): boolean {
  if (!marketUidOrLender) return false
  return marketUidOrLender.split(':')[0].startsWith('EXACTLY')
}

/** Minimal pool shape the fixed-term detail readout needs. */
interface FixedTermPoolLike {
  /** Market id — used to recognise a Midnight market before its `fixedTerm` block is served. */
  marketUid?: string
  /** Order-book depth (loan-token units + USD) — meaningful for Midnight. */
  totalLiquidity?: number
  totalLiquidityUSD?: number
  /**
   * Canonical fixed-term descriptor. The pool item served by the data API is a
   * FLAT shape (no `params`), so this is promoted to the top level next to
   * `terms` — read it there (with a `params.market` fallback for any consumer
   * that still nests it).
   */
  fixedTerm?: ApiFixedTerm
  params?: any
}

/** The canonical fixed-term descriptor the API emits on the pool item. */
interface ApiFixedTerm {
  model?: 'lista' | 'midnight' | 'term' | 'exactly'
  maturity?: number
  fees?: {
    continuousFeeApr?: number
    settlementFee?: number
    /** Exactly: %/yr accruing per second on OVERDUE debt after maturity. */
    latePenaltyApr?: number
  }
  earlyRepay?: { kind?: 'none' | 'penalty' | 'discount' }
  provider?: {
    kind?: 'broker' | 'orderbook' | 'auction' | 'pool'
    address?: string
  }
}

/**
 * Map a pool's canonical `fixedTerm` block (emitted by the API for BOTH Lista
 * brokered and Morpho Midnight markets) into the shared {@link FixedTermDetails}
 * render shape. One code path, no per-protocol branching. Returns `null` for
 * markets that carry no fixed-term block.
 */
export function fixedTermDetails(
  pool?: FixedTermPoolLike | null,
): FixedTermDetails | null {
  const n = (v: unknown): number | undefined =>
    v == null || Number.isNaN(Number(v)) ? undefined : Number(v)
  const ft = (pool?.fixedTerm ?? pool?.params?.market?.fixedTerm) as
    | ApiFixedTerm
    | undefined
  if (!ft) {
    // Pre-publish fallback: the canonical `fixedTerm` block (maturity / fees /
    // provider) may not be served yet, but a Midnight market always carries an
    // order-book depth (the offer size / fillable amount) we can surface now —
    // plus the two facts that don't need the block: it's an order book with no
    // early-repay penalty.
    if (isMidnightMarket(pool?.marketUid)) {
      return {
        availableAmount: n(pool?.totalLiquidity),
        availableAmountUsd: n(pool?.totalLiquidityUSD),
        earlyRepay: { hasPenalty: false },
        provider: { kind: 'orderbook' },
      }
    }
    return null
  }
  const settlement = ft.fees?.settlementFee // fraction (0–1)
  return {
    maturityMs: ft.maturity != null ? ft.maturity * 1000 : undefined,
    // Fillable depth: order-book depth (Midnight/Term) or the fixed-pool
    // borrowable cap (Exactly). Lista rates are term-based — no depth there.
    availableAmount:
      ft.model === 'midnight' || ft.model === 'term' || ft.model === 'exactly'
        ? n(pool?.totalLiquidity)
        : undefined,
    availableAmountUsd:
      ft.model === 'midnight' || ft.model === 'term' || ft.model === 'exactly'
        ? n(pool?.totalLiquidityUSD)
        : undefined,
    continuousFeeAprPct: n(ft.fees?.continuousFeeApr),
    settlementFeePct: settlement != null ? Number(settlement) * 100 : undefined,
    latePenaltyAprPct: n(ft.fees?.latePenaltyApr),
    earlyRepay:
      ft.earlyRepay?.kind === 'penalty'
        ? { hasPenalty: true }
        : ft.earlyRepay?.kind === 'discount'
          ? { hasPenalty: false, discount: true }
          : { hasPenalty: false },
    provider:
      ft.provider?.kind === 'broker' ||
      ft.provider?.kind === 'orderbook' ||
      ft.provider?.kind === 'auction' ||
      ft.provider?.kind === 'pool'
        ? { kind: ft.provider.kind, address: ft.provider.address }
        : undefined,
  }
}
