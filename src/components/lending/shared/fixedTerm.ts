import type { UserPositionEntry } from '../../../sdk/lending-helper/userPositionTypes'
import { formatTokenAmount } from '../../../utils/format'
import { hasEarlyRepayPenalty } from './brokeredLoans'

// ---------------------------------------------------------------------------
// Unified fixed-term (Lista brokered + Morpho Midnight) fee / early-repayment
// descriptors. Both lenders are fixed-rate/fixed-maturity but model early exit
// differently — Lista charges a per-loan penalty amount; Midnight charges none
// (you buy your debt units back on the order book at the market price). This
// module gives both a single shape + labelling so the UI renders them the same.
// ---------------------------------------------------------------------------

/** Early-repayment policy for a fixed-term position. `discount` = repaying
 *  early costs LESS than face value (Exactly rebates the pool's unassigned
 *  earnings) — the opposite of a penalty. */
export type EarlyRepay =
  | { hasPenalty: false; discount?: boolean }
  /** `amount` is in loan-token units (present for a concrete Lista loan). */
  | { hasPenalty: true; amount?: string; symbol?: string }

/** One consistent human label for an early-repay policy across lenders. */
export function earlyRepayLabel(e: EarlyRepay): string {
  if (!e.hasPenalty) return e.discount ? 'Discount — repay below face value' : 'No penalty'
  if (e.amount != null && Number(e.amount) > 0) {
    return `Penalty ${formatTokenAmount(e.amount)}${e.symbol ? ` ${e.symbol}` : ''}`
  }
  return 'Penalty applies'
}

/** Tailwind tone: warn for a penalty, success for a discount, muted for none. */
export function earlyRepayTone(e: EarlyRepay): string {
  if (e.hasPenalty) return 'text-warning'
  return e.discount ? 'text-success' : 'text-base-content/60'
}

/**
 * Who fronts the fixed term. Consistent across lenders: Lista terms are offered
 * by a single market broker contract (`broker`, with its address); Midnight
 * terms are an aggregate of many signed maker offers (`orderbook`, no single
 * provider — the concrete maker(s) are per-offer, known at borrow/quote time).
 */
export type FixedTermProvider = {
  kind: 'broker' | 'orderbook' | 'auction' | 'pool'
  address?: string
}

/** Short `0x1234…abcd` form for a provider contract address. */
export function shortAddress(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

/** One consistent human label for a term provider across lenders. */
export function providerLabel(p?: FixedTermProvider): string | null {
  if (!p) return null
  if (p.kind === 'orderbook') return 'Order book'
  // Term: primary sealed-bid auctions + continuous secondary listings.
  if (p.kind === 'auction') return 'Auction + listings'
  // Exactly: passive fixed pool priced by a utilization curve.
  if (p.kind === 'pool') return 'Rate curve'
  return p.address ? shortAddress(p.address) : 'Broker'
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
  /** LATE-repay penalty, %/yr, accruing per second on overdue debt after
   *  maturity until repaid (Exactly only). */
  latePenaltyAprPct?: number
  /** Early-repayment policy. */
  earlyRepay: EarlyRepay
  /** Who offers the term (Lista broker contract vs Midnight order book). */
  provider?: FixedTermProvider
}
