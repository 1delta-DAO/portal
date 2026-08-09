import React from 'react'

/**
 * Shown on the Borrow panel when the user has NO LlamaLend loan on this market.
 *
 * This screen builds `borrow_more`, which the protocol only accepts against an
 * existing loan. Opening one is `create_loan`, and that needs the collateral
 * AND the band count in the same transaction — a borrow-only form structurally
 * cannot produce it. The server says as much when asked:
 *
 *   "no open loan for <account> on market <controller> — opening one needs a
 *    band count and collateral together, so use deposit-and-borrow"
 *
 * So this exists to say that BEFORE the user fills in an amount and hits a
 * failure. It replaces a worse previous state: a disabled band-count control
 * captioned "fixed for the life of this loan", shown to someone with no loan.
 *
 * Deliberately not a panel with its own inputs. The two flows that can open a
 * LlamaLend loan already exist and are better at it — Optimizer's
 * deposit-and-borrow, and Looping for a levered open — and duplicating either
 * here would mean a third code path sending `bands`.
 */
export const LlamaLendOpenNotice: React.FC<{ symbol?: string }> = ({ symbol }) => (
  <div className="space-y-2 rounded-lg border border-info/30 bg-info/5 p-3">
    <div className="text-sm font-medium">No open loan on this market</div>
    <p className="text-xs leading-relaxed text-base-content/70">
      Borrowing {symbol ? `${symbol} ` : ''}here increases the debt on a loan you already have.
      Opening a new one takes the collateral and the band count together in a single transaction, so
      it starts from a different screen.
    </p>
    <ul className="ml-4 list-disc space-y-1 text-xs text-base-content/70">
      <li>
        <span className="font-medium text-base-content">Optimizer</span> — deposit collateral and
        borrow in one step.
      </li>
      <li>
        <span className="font-medium text-base-content">Looping</span> — open with leverage in one
        step.
      </li>
    </ul>
    <p className="text-[10px] leading-tight text-base-content/50">
      Both let you choose the band count (N), which sets your maximum LTV and cannot be changed once
      the loan is open.
    </p>
  </div>
)
