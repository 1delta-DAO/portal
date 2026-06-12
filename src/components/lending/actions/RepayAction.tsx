import React, { useEffect, useState } from 'react'
import { isWNative } from '../../../lib/lib-utils'
import { zeroAddress } from 'viem'
import type { ActionPanelProps } from './types'
import { useActionExecution } from './useActionExecution'
import { formatTokenAmount, formatUsd, parseAmount, addAmountStrings, minAmountString, compareAmountStrings } from './format'
import { AmountInput } from '../../common/AmountInput'
import { NativeCurrencySelector } from './NativeCurrencySelector'
import { SubAccountSelector } from './SubAccountSelector'
import { lenderSupportsSubAccounts } from './helpers'
import { HealthFactorProjection } from './HealthFactorProjection'
import { RateImpactIndicator } from './RateImpactIndicator'
import { TransactionSuccess } from './TransactionSuccess'
import { loansForMarket } from '../../../hooks/lending/useUserData'
import {
  loanDebtString,
  closeNowAmountString,
  termLabel,
  hasEarlyRepayPenalty,
  maturityDisplay,
  loanRatePct,
} from '../shared/brokeredLoans'

export const RepayAction: React.FC<ActionPanelProps> = ({
  pool,
  userPosition,
  walletBalance,
  account,
  chainId,
  accountId,
  subAccounts,
  lenderKey,
  nativeToken,
  nativeBalance,
  subAccount,
  isBalancesFetching,
  refetchBalances,
  priceUsd,
}) => {
  const [amount, setAmount] = useState('')
  const [isAll, setIsAll] = useState(false)
  const [useNative, setUseNative] = useState(false)

  const hasSubAccounts = lenderSupportsSubAccounts(lenderKey)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(accountId ?? null)

  useEffect(() => {
    setSelectedAccountId(accountId ?? null)
  }, [accountId])

  // Brokered (Lista) markets carry per-loan rows that must each be repaid by
  // their own `loanId` — no aggregate repay. Pick the loan to close. (Spec §3.)
  const brokeredLoans = pool && subAccount ? loansForMarket(subAccount.positions, pool.marketUid) : []
  const isBrokered = brokeredLoans.length > 0
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null)

  useEffect(() => {
    setSelectedLoanId(brokeredLoans[0]?.loanId ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool?.marketUid, brokeredLoans.length])

  const selectedLoan = brokeredLoans.find((l) => l.loanId === selectedLoanId) ?? null

  const canUseNative = !!pool && isWNative(pool.asset) && !!nativeToken

  const {
    result,
    simulation,
    rateImpact,
    loading,
    executingPermission,
    executingMain,
    permissions,
    hasPermissions,
    permissionsCompleted,
    allPermissionsDone,
    error,
    txSuccess,
    executeNextPermission,
    executeMain,
    resetState,
    dismissSuccess,
  } = useActionExecution({
    actionType: 'Repay',
    pool,
    account,
    amount,
    // Brokered repay is always amount-based (close = debt + penalty, excess
    // refunded) and targets a specific loanId — never the aggregate isAll path.
    isAll: isBrokered ? false : isAll,
    payAsset: canUseNative && useNative ? zeroAddress : undefined,
    accountId: hasSubAccounts ? (selectedAccountId ?? undefined) : undefined,
    loanId: isBrokered ? (selectedLoanId ?? undefined) : undefined,
    chainId,
    subAccount,
  })

  // Reset when pool *or* the selected loan changes.
  useEffect(() => {
    setAmount('')
    setIsAll(false)
    setUseNative(false)
    resetState()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool?.marketUid, selectedLoanId])

  // Outstanding debt: the selected loan's debt for brokered markets, else the
  // market aggregate. `closeNowStr` adds the early-repay penalty (0 once matured).
  const debtStr = isBrokered
    ? selectedLoan
      ? loanDebtString(selectedLoan)
      : '0'
    : userPosition
      ? addAmountStrings(String(userPosition.debt ?? '0'), String(userPosition.debtStable ?? '0'))
      : '0'
  const closeNowStr = isBrokered && selectedLoan ? closeNowAmountString(selectedLoan) : debtStr
  const debtTotal = parseAmount(debtStr) // only for display

  const activeBal = canUseNative && useNative ? nativeBalance : walletBalance
  const activeBalStr = activeBal?.balance ?? '0'
  const hasDebt = compareAmountStrings(debtStr, '0') > 0
  const hasBal = compareAmountStrings(activeBalStr, '0') > 0
  // "Max" closes the loan fully — for brokered that's debt + penalty (capped by
  // wallet); the broker refunds any excess.
  const repayTargetStr = isBrokered ? closeNowStr : debtStr
  const repayMaxStr = hasDebt && hasBal ? minAmountString(repayTargetStr, activeBalStr) : '0'

  const overWallet = !isAll && hasBal && compareAmountStrings(amount || '0', activeBalStr) > 0
  // For brokered loans the ceiling is the full-close amount (debt + penalty).
  const overDebt = !isAll && hasDebt && compareAmountStrings(amount || '0', repayTargetStr) > 0
  const overMax = overWallet || overDebt

  // Estimated monthly interest saved by this repayment. variableBorrowRate
  // is in percent units. Prefer the simulation's projected borrow rate
  // (post-tx) when available — repaying lowers utilization and therefore
  // the rate. Fall back to the pool's current rate and to oraclePriceUSD.
  const effectivePriceUsd = priceUsd ?? pool?.oraclePriceUSD ?? 0
  const projectedBorrowAprPct = rateImpact?.find((e) => e.marketUid === pool?.marketUid)
    ?.borrowRate?.projected
  const borrowAprPct = projectedBorrowAprPct ?? pool?.variableBorrowRate ?? 0
  const amountNum = parseAmount(amount)
  const monthlySavedUsd =
    amountNum > 0 && effectivePriceUsd > 0 && borrowAprPct > 0
      ? (amountNum * effectivePriceUsd * (borrowAprPct / 100)) / 12
      : 0

  // Any user input (typing or 25/50/75 presets) clears the isAll flag.
  const handleAmountChange = (val: string) => {
    setIsAll(false)
    setAmount(val)
  }

  // The "Max" preset flips isAll=true so the backend repays the full debt
  // via the dedicated isAll flag instead of a snapshot amount. Brokered loans
  // close by explicit amount (debt + penalty), so keep isAll off there.
  const handleMaxClick = () => {
    setIsAll(!isBrokered)
    if (compareAmountStrings(repayMaxStr, '0') > 0) setAmount(repayMaxStr)
  }

  // Repay shows two mutually-exclusive errors: wallet-overflow takes
  // precedence over debt-overflow. Pick whichever is active for AmountInput.
  const amountErrorMessage = (() => {
    if (isAll) return null
    if (overWallet) return `Exceeds wallet balance (${formatTokenAmount(activeBalStr)}).`
    if (overDebt) return `Exceeds outstanding debt (${formatTokenAmount(debtTotal)}).`
    return null
  })()

  if (txSuccess) {
    return (
      <TransactionSuccess
        actionType={txSuccess.actionType}
        amount={txSuccess.amount}
        symbol={txSuccess.symbol}
        hash={txSuccess.hash}
        onDismiss={() => {
          dismissSuccess()
          setAmount('')
          setIsAll(false)
        }}
      />
    )
  }

  return (
    <div className="space-y-3">
      {/* Sub-account selector */}
      {hasSubAccounts && (
        <SubAccountSelector
          subAccounts={subAccounts ?? []}
          selectedAccountId={selectedAccountId}
          onChange={setSelectedAccountId}
          allowCreate={false}
        />
      )}

      {/* Loan picker (brokered markets) — each fixed loan repays separately. */}
      {isBrokered && (
        <div className="space-y-1.5">
          <span className="text-xs text-base-content/60 px-1">Loan to repay</span>
          <div className="flex flex-col gap-1.5">
            {brokeredLoans.map((loan) => {
              const active = loan.loanId === selectedLoanId
              const mat = maturityDisplay(loan)
              const ratePct = loanRatePct(loan)
              return (
                <button
                  key={loan.loanId}
                  type="button"
                  onClick={() => setSelectedLoanId(loan.loanId ?? null)}
                  className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    active
                      ? 'border-primary bg-primary/10 ring-1 ring-primary'
                      : 'border-base-300 bg-base-200/50 hover:bg-base-200'
                  }`}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-semibold">{termLabel(loan)}</span>
                    {ratePct != null && (
                      <span className="text-[10px] font-mono tabular-nums text-warning">
                        {ratePct.toFixed(2)}%
                      </span>
                    )}
                    {mat.isPast && (
                      <span className="badge badge-xs bg-warning/15 text-warning border-0">
                        Matured
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono tabular-nums text-error">
                      {formatTokenAmount(loanDebtString(loan))}
                    </span>
                    {!mat.isFlex && (
                      <span className="text-[10px] text-base-content/45 w-14 text-right">
                        {mat.isPast ? 'frozen' : mat.label}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Native/wrapped selector */}
      {canUseNative && nativeToken && (
        <NativeCurrencySelector
          wrappedSymbol={pool!.asset.symbol}
          nativeToken={nativeToken}
          useNative={useNative}
          onChange={setUseNative}
          label="Pay with"
        />
      )}

      {/* Wallet balance */}
      {activeBal && (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60 flex items-center gap-1">
            Wallet balance:
            {refetchBalances && (
              <button type="button" className="text-base-content/30 hover:text-base-content/60 transition-colors" onClick={refetchBalances} title="Refresh balance">
                {isBalancesFetching ? <span className="loading loading-spinner w-2.5 h-2.5" /> : (
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
                )}
              </button>
            )}
          </span>
          <span className={`font-medium ${!hasBal ? 'text-base-content/40' : ''}`}>
            {formatTokenAmount(activeBal.balance)} (${formatUsd(activeBal.balanceUSD)})
          </span>
        </div>
      )}

      {/* Outstanding debt — aggregate (standard) or selected loan (brokered). */}
      {!isBrokered && userPosition && debtTotal > 0 && (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60">Outstanding debt:</span>
          <span className="text-error font-medium">
            {formatTokenAmount(debtTotal)} ($
            {formatUsd(userPosition.debtUSD + userPosition.debtStableUSD)})
          </span>
        </div>
      )}
      {isBrokered && selectedLoan && debtTotal > 0 && (
        <div className="space-y-1">
          <div className="text-xs flex justify-between px-1">
            <span className="text-base-content/60">Loan debt:</span>
            <span className="text-error font-medium">
              {formatTokenAmount(debtTotal)} {pool?.asset.symbol}
            </span>
          </div>
          {hasEarlyRepayPenalty(selectedLoan) ? (
            <>
              <div className="text-xs flex justify-between px-1">
                <span className="text-base-content/60">Early-repay penalty:</span>
                <span className="text-warning font-medium">
                  +{formatTokenAmount(selectedLoan.term?.earlyRepayPenalty ?? '0')} {pool?.asset.symbol}
                </span>
              </div>
              <div className="text-xs flex justify-between px-1">
                <span className="text-base-content/60">Close now:</span>
                <span className="font-semibold">
                  {formatTokenAmount(closeNowStr)} {pool?.asset.symbol}
                </span>
              </div>
            </>
          ) : (
            <div className="text-[11px] text-base-content/50 px-1">
              {maturityDisplay(selectedLoan).isPast
                ? 'Matured — no early-repay penalty. Interest is frozen.'
                : 'No early-repay penalty.'}
            </div>
          )}
        </div>
      )}

      {/* Amount input with quick buttons */}
      <AmountInput
        value={amount}
        onChange={handleAmountChange}
        maxAmount={repayMaxStr}
        decimals={pool?.asset?.decimals}
        onMaxClick={handleMaxClick}
        disabled={!pool}
        error={amountErrorMessage}
      />

      {/* Estimated monthly interest saved by this repayment. */}
      {monthlySavedUsd > 0 && (
        <div className="text-xs flex items-center justify-between gap-2 px-1">
          <span className="text-base-content/60 whitespace-nowrap">Saved / month</span>
          <span className="text-success font-medium whitespace-nowrap">
            ~${formatUsd(monthlySavedUsd)}
            <span className="text-base-content/40 font-normal ml-1">({borrowAprPct.toFixed(2)}%)</span>
          </span>
        </div>
      )}

      {error && <div className="text-error text-xs wrap-break-word">{error}</div>}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-1 text-xs text-base-content/60">
          <span className="loading loading-spinner loading-xs" />
          <span>Simulating...</span>
        </div>
      )}

      {/* Projected health factor */}
      <HealthFactorProjection simulation={simulation} />

      {/* Rate impact */}
      <RateImpactIndicator rateImpact={rateImpact} />

      {result && !overMax && hasPermissions && !allPermissionsDone && (
        <div className="space-y-1">
          <span className="text-xs text-base-content/60">
            Approvals ({permissionsCompleted}/{permissions.length})
          </span>
          {permissions.map((perm, i) => {
            const done = i < permissionsCompleted
            const isCurrent = i === permissionsCompleted
            return (
              <button
                key={i}
                type="button"
                className={`btn btn-sm w-full ${done ? 'btn-disabled btn-outline btn-success' : isCurrent ? 'btn-warning' : 'btn-outline btn-ghost'}`}
                disabled={!isCurrent || executingPermission}
                onClick={isCurrent ? executeNextPermission : undefined}
                title={perm.description || `Approval ${i + 1}`}
              >
                <span className="truncate max-w-full">
                  {done ? (
                    `\u2713 ${perm.description || `Approval ${i + 1}`}`
                  ) : isCurrent && executingPermission ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    perm.description || `Approval ${i + 1}`
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {result && !overMax && (!hasPermissions || allPermissionsDone) && (
        <button
          type="button"
          className="btn btn-success btn-sm w-full"
          disabled={executingMain}
          onClick={executeMain}
        >
          {executingMain ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            'Execute Repay'
          )}
        </button>
      )}
    </div>
  )
}
