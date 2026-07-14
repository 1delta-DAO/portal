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

/**
 * Absolute maturity of a fixed-term product, as an epoch-ms timestamp, derived
 * from its (fractional) days-to-maturity. Midnight markets carry a single fixed
 * calendar maturity; Lista terms are rolling durations, so only surface this for
 * markets with a real fixed maturity (Midnight).
 */
export function maturityFromDurationDays(
  durationDays: number,
  nowMs: number = Date.now(),
): number {
  return nowMs + durationDays * 86_400_000
}
