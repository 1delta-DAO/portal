import React from 'react'

/**
 * Shown on the Borrow panel when the user has NO TermMax position (GT) on this
 * market.
 *
 * This screen builds the standalone borrow, which raises the debt on an
 * EXISTING GT (`issueFtByExistedGt`) — the server requires the gtId and 400s
 * without one:
 *
 *   "TermMax borrow: posId (the gtId) is required. To open a NEW position use
 *    deposit-and-borrow — there is no router path to borrow against an
 *    existing GT."
 *
 * So this exists to say that BEFORE the user fills in an amount and hits the
 * failure. Opening a position takes collateral and debt together in one router
 * transaction (`borrowTokenFromCollateral`), which the Optimizer's
 * deposit-and-borrow flow builds.
 *
 * Same pattern as {@link LlamaLendOpenNotice} / the Liquity open panel:
 * deliberately not a panel with its own inputs — the flows that can open a
 * TermMax position already exist and are better at it.
 */
export const TermMaxOpenNotice: React.FC<{ symbol?: string }> = ({ symbol }) => (
  <div className="space-y-2 rounded-lg border border-info/30 bg-info/5 p-3">
    <div className="text-sm font-medium">No position on this market</div>
    <p className="text-xs leading-relaxed text-base-content/70">
      Borrowing {symbol ? `${symbol} ` : ''}here raises the debt on a fixed-term
      position you already hold. Opening a new one takes the collateral and the
      borrow together in a single transaction, so it starts from a different
      screen.
    </p>
    <ul className="ml-4 list-disc space-y-1 text-xs text-base-content/70">
      <li>
        <span className="font-medium text-base-content">Optimizer</span> — deposit
        collateral and borrow in one step.
      </li>
    </ul>
    <p className="text-[10px] leading-tight text-base-content/50">
      TermMax debt is a fixed face value due at the market&apos;s maturity — the
      rate is locked at open and does not accrue.
    </p>
  </div>
)
