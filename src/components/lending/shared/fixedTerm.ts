import type { UserPositionEntry } from '../../../hooks/lending/useUserData'
import { formatTokenAmount } from '../../../utils/format'
import { hasEarlyRepayPenalty } from './brokeredLoans'

// ---------------------------------------------------------------------------
// Unified fixed-term (Lista brokered + Morpho Midnight) fee / early-repayment
// descriptors. Both lenders are fixed-rate/fixed-maturity but model early exit
// differently — Lista charges a per-loan penalty amount; Midnight charges none
// (you buy your debt units back on the order book at the market price). This
// module gives both a single shape + labelling so the UI renders them the same.
// ---------------------------------------------------------------------------

/** Early-repayment policy for a fixed-term position. */
export type EarlyRepay =
  | { hasPenalty: false }
  /** `amount` is in loan-token units (present for a concrete Lista loan). */
  | { hasPenalty: true; amount?: string; symbol?: string }

/** One consistent human label for an early-repay policy across lenders. */
export function earlyRepayLabel(e: EarlyRepay): string {
  if (!e.hasPenalty) return 'No penalty'
  if (e.amount != null && Number(e.amount) > 0) {
    return `Penalty ${formatTokenAmount(e.amount)}${e.symbol ? ` ${e.symbol}` : ''}`
  }
  return 'Penalty applies'
}

/** Tailwind tone for the early-repay label — muted for "none", warn otherwise. */
export function earlyRepayTone(e: EarlyRepay): string {
  return e.hasPenalty ? 'text-warning' : 'text-base-content/60'
}

/** Early-repay policy for a concrete Lista brokered loan (per-loan penalty). */
export function listaEarlyRepay(
  loan: UserPositionEntry,
  symbol?: string,
): EarlyRepay {
  if (!hasEarlyRepayPenalty(loan)) return { hasPenalty: false }
  return {
    hasPenalty: true,
    amount: loan.term?.earlyRepayPenalty,
    symbol,
  }
}

/**
 * Unified fixed-term market detail shape. Fee fields are optional: a lender that
 * doesn't have a given fee (Lista has no continuous/settlement fee; the API may
 * not carry them pre-publish) simply leaves it `undefined`, and the row is
 * hidden. A present value of 0 IS rendered (so "no fee" reads explicitly).
 */
export interface FixedTermDetails {
  /** Absolute settlement date (epoch ms). */
  maturityMs?: number | null
  /** Depth fillable at the fixed rate (loan-token units + USD). */
  availableAmount?: number
  availableAmountUsd?: number
  /** Continuous fee, %/yr — ongoing lender-side haircut (Midnight only). */
  continuousFeeAprPct?: number
  /** Settlement fee %, at the current time-to-maturity (Midnight only). */
  settlementFeePct?: number
  /** Early-repayment policy. */
  earlyRepay: EarlyRepay
}
