import React, { useMemo, useState } from 'react'
import type { TradingActionProps } from '../types'
import type { PoolDataItem } from '../../../../../sdk/lending-helper/marketTypes'
import type { UserPositionEntry } from '../../../../../sdk/lending-helper/userPositionTypes'
import { isLoanPosition } from '../../../../../sdk/lending-helper/userPositionTypes'
import { hasCapability } from '../../../../../sdk/lending-helper/poolTypes'
import { SubAccountSelector } from '../../../actions/SubAccountSelector'
import { lenderSupportsSubAccounts } from '../../../actions/helpers'
import { EmptyState } from '../../../../common/EmptyState'
import { RefinanceModal } from '../../../shared/RefinanceModal'
import {
  termLabel,
  loanDebtString,
  loanRatePct,
  maturityDisplay,
  hasEarlyRepayPenalty,
} from '../../../shared/brokeredLoans'
import { formatTokenAmount } from '../../../../../utils/format'

/**
 * Refinance / roll-over as a FIRST-CLASS operation.
 *
 * The action already existed, reachable only from a ↻ button inside the
 * per-loan breakdown of a position row — which is where it stayed invisible.
 * This panel is the discoverable entry point: pick the loan, pick the term.
 *
 * Which loans qualify is NOT decided here. A market row declares `refinance`
 * in its API-served `capabilities[]`, and this panel shows the loans on those
 * markets — so a newly-wired fixed-term lender appears with no change to this
 * file. The one thing worth stating in the UI, and the reason the empty state
 * is wordy, is that "nothing to refinance" has three quite different causes.
 */
export const RefinanceAction: React.FC<TradingActionProps> = ({
  allPools,
  subAccounts,
  selectedLender,
  chainId,
  account,
  accountId,
  onAccountIdChange,
}) => {
  const [refinancing, setRefinancing] = useState<{
    loan: UserPositionEntry
    pool: PoolDataItem
  } | null>(null)

  /** Markets of this lender the API says can be refinanced. */
  const capableByUid = useMemo(() => {
    const m = new Map<string, PoolDataItem>()
    for (const p of allPools) {
      if (hasCapability(p, 'refinance')) m.set(p.marketUid, p)
    }
    return m
  }, [allPools])

  const activeSubAccount = useMemo(
    () => subAccounts.find((s) => s.accountId === accountId) ?? subAccounts[0] ?? null,
    [subAccounts, accountId]
  )

  /**
   * Every per-loan row of the active sub-account that sits on a capable market.
   * Both the fixed loans and the float/dynamic one qualify: rolling a fixed
   * loan is a roll-over, moving the float into a term is the refinance.
   */
  const loans = useMemo(() => {
    if (!activeSubAccount) return []
    const out: { loan: UserPositionEntry; pool: PoolDataItem }[] = []
    for (const pos of activeSubAccount.positions) {
      if (!isLoanPosition(pos)) continue
      const pool = capableByUid.get(pos.marketUid)
      if (pool) out.push({ loan: pos, pool })
    }
    return out
  }, [activeSubAccount, capableByUid])

  const lenderHasCapableMarket = capableByUid.size > 0

  return (
    <div className="space-y-3">
      {lenderSupportsSubAccounts(selectedLender) && subAccounts.length > 0 && (
        <SubAccountSelector
          subAccounts={subAccounts}
          selectedAccountId={accountId ?? null}
          onChange={onAccountIdChange}
          // Refinancing acts on an EXISTING loan, so a fresh empty sub-account
          // is never a useful target here.
          allowCreate={false}
          chainId={chainId}
          lender={selectedLender}
          account={account}
        />
      )}

      {loans.length === 0 ? (
        <EmptyState
          title={lenderHasCapableMarket ? 'No loan to refinance' : 'Not available on this lender'}
          description={
            lenderHasCapableMarket
              ? 'Refinancing moves an existing loan into a different term — the assets and the size stay the same. Borrow on one of this lender’s fixed terms first, then roll it here.'
              : 'This lender has no term to move debt between. Refinancing is offered on fixed-term markets (Lista brokered markets, Exactly) — the server declares which markets support it, so the option appears here automatically when one does.'
          }
        />
      ) : (
        <>
          <p className="text-[11px] text-base-content/60">
            Move a loan into a different term. Same collateral, same principal — only the rate
            bracket changes. Rolling a fixed loan before maturity repays it early, so its accrued
            interest and early-repayment penalty are included.
          </p>
          <div className="space-y-1.5">
            {loans.map(({ loan, pool }) => {
              const mat = maturityDisplay(loan)
              const ratePct = loanRatePct(loan)
              const symbol = pool.asset?.symbol ?? ''
              return (
                <button
                  key={`${loan.marketUid}|${loan.loanId}`}
                  type="button"
                  className="w-full flex items-center justify-between gap-2 rounded-lg border border-base-300 bg-base-200/40 px-3 py-2 text-left hover:bg-base-200 transition-colors"
                  onClick={() => setRefinancing({ loan, pool })}
                >
                  <span className="flex flex-col min-w-0">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      {termLabel(loan)}
                      {ratePct != null && (
                        <span className="font-mono tabular-nums text-warning">
                          {ratePct.toFixed(2)}%
                        </span>
                      )}
                      {mat.isPast && (
                        <span className="badge badge-xs bg-warning/15 text-warning border-0">
                          Matured
                        </span>
                      )}
                      {hasEarlyRepayPenalty(loan) && (
                        <span className="text-[10px] text-warning/70">⚠ penalty</span>
                      )}
                    </span>
                    <span className="text-[10px] text-base-content/50">
                      {formatTokenAmount(loanDebtString(loan))} {symbol}
                      {mat.isFlex ? ' · flexible' : mat.isPast ? ' · frozen' : ` · in ${mat.label}`}
                    </span>
                  </span>
                  <span className="text-primary text-xs shrink-0">
                    ↻ {loan.term?.isDynamic ? 'Refinance' : 'Roll'}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {refinancing && account && (
        <RefinanceModal
          pool={refinancing.pool}
          loan={refinancing.loan}
          account={account}
          chainId={chainId}
          onClose={() => setRefinancing(null)}
        />
      )}
    </div>
  )
}
