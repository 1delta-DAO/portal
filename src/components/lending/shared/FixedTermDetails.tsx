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
  onSelectOfferAmount,
}: {
  details: FixedTermDetails
  symbol?: string
  /** `MORPHO_MIDNIGHT_<id>:chain:asset` marketUid (or lender key) — enables the
   *  live order-book ladder in place of the single "Available at this rate" row. */
  lender?: string
  /** Tap-a-tile-to-fill for order-book markets — receives the cumulative depth
   *  (loan-token units). Omit to render the ladder read-only. */
  onSelectOfferAmount?: (tokens: number) => void
}) {
  const chainId = lender?.split(':')[1]
  return (
    <>
      {details.maturityMs != null && (
        <div className="flex justify-between gap-2">
          <span>Fixed maturity</span>
          <span className="tabular-nums">
            {new Date(details.maturityMs).toLocaleDateString()}
          </span>
        </div>
      )}
      {providerLabel(details.provider) != null && (
        <div className="flex justify-between gap-2">
          <span title="Who offers this fixed term: Lista terms come from a single market broker; Midnight terms are filled from an order book of maker offers.">
            Offered by
          </span>
          <span
            className="tabular-nums"
            title={details.provider?.address ?? undefined}
          >
            {providerLabel(details.provider)}
          </span>
        </div>
      )}
      {details.provider?.kind === 'orderbook' && lender ? (
        // Order-book markets (Midnight today) get the full live offer ladder
        // (best-first, scrollable) instead of the single top-of-book depth line;
        // brokers (Lista) keep the single line. Falls back to it while loading /
        // if the live fetch is empty.
        <OfferLadder
          chainId={chainId}
          lender={lender.split(':')[0]}
          symbol={symbol}
          fallbackAmount={details.availableAmount}
          fallbackAmountUsd={details.availableAmountUsd}
          onSelectAmount={onSelectOfferAmount}
        />
      ) : (
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
      {details.continuousFeeAprPct != null && (
        <div className="flex justify-between gap-2">
          <span title="Ongoing fee accrued to lenders while the position is open. Deducted continuously from the lender's redeemable balance.">
            Continuous fee
          </span>
          <span className="tabular-nums">
            {details.continuousFeeAprPct.toFixed(2)}%/yr
          </span>
        </div>
      )}
      {details.settlementFeePct != null && (
        <div className="flex justify-between gap-2">
          <span title="One-off fee taken at settlement, scaled by time to maturity.">
            Settlement fee
          </span>
          <span className="tabular-nums">
            {details.settlementFeePct.toFixed(2)}%
          </span>
        </div>
      )}
      <div className="flex justify-between gap-2">
        <span title="Repaying before maturity: Lista charges a per-loan penalty; Midnight has none (buy your debt units back on the order book at the current market price).">
          Early repayment
        </span>
        <span className={`tabular-nums ${earlyRepayTone(details.earlyRepay)}`}>
          {earlyRepayLabel(details.earlyRepay)}
        </span>
      </div>
    </>
  )
}
