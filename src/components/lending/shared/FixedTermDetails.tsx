import type { FixedTermDetails } from './fixedTerm'
import { earlyRepayLabel, earlyRepayTone, providerLabel } from './fixedTerm'
import { formatUsd, formatTokenAmount } from '../../../utils/format'
import { OfferLadder } from './OfferLadder'

/**
 * Renders the fixed-term (Lista / Morpho Midnight) market facts as a stack of
 * label→value rows: settlement date, fillable depth, the continuous + settlement
 * fees (Midnight), and the early-repayment policy — the last of which is unified
 * across both lenders via {@link earlyRepayLabel}.
 *
 * Fee rows are shown WHEN PRESENT (even at 0.00%), not only when non-zero — so
 * "no fee" is stated explicitly rather than looking like missing data. A fee is
 * `undefined` only when the lender doesn't have it (Lista) or the API doesn't
 * carry it yet (pre-publish), in which case the row stays hidden.
 */
export function FixedTermDetailsRows({
  details,
  symbol,
  lender,
  side = 'borrow',
  onSelectOfferAmount,
  amountTokens,
  hideLadder = false,
  termId,
  hideRows = false,
}: {
  details: FixedTermDetails
  symbol?: string
  /** `MORPHO_MIDNIGHT_<id>:chain:asset` marketUid (or lender key) — enables the
   *  live order-book ladder in place of the single "Available at this rate" row. */
  lender?: string
  /** Which side of the order book to show: `borrow` (bids) or `lend` (asks). */
  side?: 'borrow' | 'lend'
  /** Tap-a-tile-to-fill for order-book markets — receives the cumulative depth
   *  (loan-token units). Omit to render the ladder read-only. */
  onSelectOfferAmount?: (tokens: number) => void
  /** Current borrow/lend amount (loan-token units) — highlights the offers it fills. */
  amountTokens?: number
  /** Suppress the embedded offer ladder / "available" line — used when a fuller
   *  order-book view (e.g. {@link MidnightOrderBook}) is rendered alongside. */
  hideLadder?: boolean
  /** Exactly: fixed-pool maturity to ladder (defaults to the nearest live pool). */
  termId?: number
  /**
   * Suppress the label→value term rows and render ONLY the depth ladder.
   *
   * These rows are superseded by `<TermsSummary>`, which derives the same
   * facts from the market's `termSheet` for EVERY lender rather than the
   * fixed-term subset. The ladder has no term-sheet equivalent (it is live
   * order-book depth with tap-to-fill), so it stays here as a specialist
   * slot — see `terms/README.md`.
   */
  hideRows?: boolean
}) {
  const chainId = lender?.split(':')[1]
  return (
    <>
      {!hideRows && details.maturityMs != null && (
        <div className="flex justify-between gap-2">
          <span>Fixed maturity</span>
          <span className="tabular-nums">{new Date(details.maturityMs).toLocaleDateString()}</span>
        </div>
      )}
      {!hideRows && providerLabel(details.provider) != null && (
        <div className="flex justify-between gap-2">
          <span title="Who offers this fixed term: Lista terms come from a single market broker; Midnight terms are filled from an order book of maker offers.">
            Offered by
          </span>
          <span className="tabular-nums" title={details.provider?.address ?? undefined}>
            {providerLabel(details.provider)}
          </span>
        </div>
      )}
      {hideLadder ? null : (details.provider?.kind === 'orderbook' ||
          details.provider?.kind === 'auction' ||
          details.provider?.kind === 'pool') &&
        lender ? (
        // Order-book markets (Midnight today) get the full live offer ladder
        // (best-first, scrollable) instead of the single top-of-book depth line;
        // brokers (Lista) keep the single line. Falls back to it while loading /
        // if the live fetch is empty.
        <OfferLadder
          chainId={chainId}
          lender={lender.split(':')[0]}
          marketUid={lender}
          symbol={symbol}
          side={side}
          fallbackAmount={details.availableAmount}
          fallbackAmountUsd={details.availableAmountUsd}
          onSelectAmount={onSelectOfferAmount}
          amountTokens={amountTokens}
          termId={termId}
        />
      ) : (
        !hideRows &&
        details.availableAmount != null &&
        details.availableAmount > 0 && (
          <div className="flex justify-between gap-2">
            <span>Available at this rate</span>
            <span className="tabular-nums">
              {formatTokenAmount(details.availableAmount)}
              {symbol ? ` ${symbol}` : ''}
              {details.availableAmountUsd != null
                ? ` ($${formatUsd(details.availableAmountUsd)})`
                : ''}
            </span>
          </div>
        )
      )}
      {!hideRows && details.continuousFeeAprPct != null && (
        <div className="flex justify-between gap-2">
          <span title="Ongoing fee accrued to lenders while the position is open. Deducted continuously from the lender's redeemable balance.">
            Continuous fee
          </span>
          <span className="tabular-nums">{details.continuousFeeAprPct.toFixed(2)}%/yr</span>
        </div>
      )}
      {!hideRows && details.settlementFeePct != null && (
        <div className="flex justify-between gap-2">
          <span title="One-off fee taken at settlement, scaled by time to maturity.">
            Settlement fee
          </span>
          <span className="tabular-nums">{details.settlementFeePct.toFixed(2)}%</span>
        </div>
      )}
      {!hideRows && details.latePenaltyAprPct != null && details.latePenaltyAprPct > 0 && (
        <div className="flex justify-between gap-2">
          <span
            className="text-warning"
            title="Repaying AFTER maturity: the amount owed grows per second at this annualized rate until repaid — and the growing debt erodes your health factor toward liquidation."
          >
            Late repay penalty
          </span>
          <span className="tabular-nums text-warning">
            {details.latePenaltyAprPct.toFixed(0)}%/yr
          </span>
        </div>
      )}
      {hideRows ? null : (
        <div className="flex justify-between gap-2">
          <span title="Repaying before maturity: Lista charges a per-loan penalty; Midnight has none (buy debt units back at the market price); Exactly rebates unassigned earnings (a discount below face value).">
            Early repayment
          </span>
          <span className={`tabular-nums ${earlyRepayTone(details.earlyRepay)}`}>
            {earlyRepayLabel(details.earlyRepay)}
          </span>
        </div>
      )}
    </>
  )
}
