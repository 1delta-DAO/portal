/**
 * Helpers for rendering and acting on brokered (fixed-term) loans — Lista DAO.
 * See BROKERED_MARKETS.md and the brokered user-positions UI spec.
 *
 * A brokered market's `positions[]` carries per-loan rows (`term != null`)
 * alongside the aggregate-debt and collateral rows. These helpers operate on a
 * single per-loan `UserPositionEntry`.
 */
import { parseUnits, formatUnits } from 'viem'
import type { UserPositionEntry } from '../../../hooks/lending/useUserData'
import { addAmountStrings } from '../actions/format'

/**
 * The loan's debt in token units. Fixed loans carry it in the stable slot;
 * the flex/dynamic loan carries it in the variable slot. (Spec §2.)
 */
export function loanDebtString(pos: UserPositionEntry): string {
  return pos.term?.isDynamic
    ? String(pos.debt ?? '0')
    : String(pos.debtStable ?? '0')
}

/**
 * Amount needed to fully close the loan now, token units. The displayed debt
 * already includes accrued interest (spec §2: "included in debt already"), so
 * the full-close amount is simply debt + earlyRepayPenalty. The broker refunds
 * any excess, so a slight overshoot from rounding is safe. (Spec §3-4.)
 *
 * After maturity `earlyRepayPenalty` is 0, so this collapses to the debt.
 */
export function closeNowAmountString(pos: UserPositionEntry): string {
  const penalty = pos.term?.earlyRepayPenalty ?? '0'
  return addAmountStrings(loanDebtString(pos), penalty)
}

/** Human label for a loan's term: "Flexible" for flex, else "7-day". (Spec §2.) */
export function termLabel(pos: UserPositionEntry): string {
  const t = pos.term
  if (!t || t.isDynamic) return 'Flexible'
  return t.termDays != null ? `${t.termDays}-day` : 'Fixed'
}

/** True when the fixed loan has an early-repay penalty to surface (not matured, has a fee). */
export function hasEarlyRepayPenalty(pos: UserPositionEntry): boolean {
  const t = pos.term
  if (!t || t.isDynamic || t.isMatured) return false
  return !!t.earlyRepayPenalty && Number(t.earlyRepayPenalty) > 0
}

export interface MaturityDisplay {
  /** Short human string: a countdown ("6d 4h"), "Matured", or "—" for flex. */
  label: string
  /** True once the maturity timestamp has passed. */
  isPast: boolean
  /** True for the flex loan (no maturity). */
  isFlex: boolean
}

/**
 * Format a loan's maturity for display. `nowSec` defaults to the current time;
 * pass it explicitly from a ticking state to drive a live countdown.
 */
export function maturityDisplay(
  pos: UserPositionEntry,
  nowSec: number = Math.floor(Date.now() / 1000)
): MaturityDisplay {
  const t = pos.term
  if (!t || t.isDynamic || t.maturity == null) {
    return { label: '—', isPast: false, isFlex: true }
  }
  // Trust the backend's `isMatured` flag, falling back to a timestamp compare.
  const isPast = t.isMatured === true || t.maturity <= nowSec
  if (isPast) return { label: 'Matured', isPast: true, isFlex: false }

  const remaining = t.maturity - nowSec
  const days = Math.floor(remaining / 86400)
  const hours = Math.floor((remaining % 86400) / 3600)
  const mins = Math.floor((remaining % 3600) / 60)
  const label = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  return { label, isPast: false, isFlex: false }
}

/**
 * Default amount to pre-fill a refinance / roll-over with: the full close
 * amount (debt + early-repay penalty) plus a small over-fund buffer.
 *
 * A full close repays the source loan to zero — but the displayed debt is a
 * snapshot, so a sliver more interest accrues before the tx lands. Without a
 * buffer the repay can leave sub-`minLoan` interest dust on the source and
 * revert `REMAIN_BORROW_TOO_LOW`. The broker refunds any excess (swept back),
 * so over-funding by a hair is free. See loop-refinance OpenAPI sizing notes.
 */
export function defaultRefinanceAmountString(
  pos: UserPositionEntry,
  decimals: number
): string {
  const close = closeNowAmountString(pos)
  try {
    const wei = parseUnits(close as `${number}`, decimals)
    // +0.1% buffer to cover in-flight interest on a full close.
    const buffered = wei + wei / 1000n
    return formatUnits(buffered, decimals)
  } catch {
    return close
  }
}

/** Borrow rate to show for a loan: the fixed `apr`, or null for flex (use market rate). */
export function loanRatePct(pos: UserPositionEntry): number | null {
  const t = pos.term
  if (!t || t.isDynamic) return null
  return t.apr ?? null
}
