import React, { useMemo, useState, useEffect } from 'react'
import { LendingMode } from '../../../../../lib/lib-utils'
import { parseUnits } from 'viem'
import type { PoolDataItem } from '../../../../../hooks/lending/usePoolData'
import type { TradingActionProps, SelectedPool } from '../types'
import { PoolSelectorDropdown } from '../PoolSelectorDropdown'
import { SlippageInput } from '../SlippageInput'
import { QuoteCard } from '../QuoteCard'
import { AmountQuickButtons } from '../../../actions/AmountQuickButtons'
import { formatTokenForInput, formatUsd, sanitizeAmountInput } from '../../../actions/format'
import { ErrorDisplay } from '../ErrorDisplay'
import { useTradingQuotes, buildSimulationBody } from '../useTradingQuotes'
import { TradingTransactionSuccess } from '../TradingTransactionSuccess'
import { RateImpactIndicator } from '../../../actions/RateImpactIndicator'
import { SimulationIndicator } from '../../../actions/SimulationIndicator'
import { SubAccountSelector } from '../../../actions/SubAccountSelector'
import { lenderSupportsSubAccounts } from '../../../actions/helpers'
import {
  fetchLoopRangeWithSimulation,
  fetchLoopRange,
  type LoopRangeEntry,
} from '../../../../../sdk/lending-helper/fetchLoopRange'
import { loansForMarket } from '../../../../../hooks/lending/useUserData'
import { termLabel, loanDebtString, maturityDisplay, loanRatePct } from '../../../shared/brokeredLoans'

export const CloseAction: React.FC<TradingActionProps> = ({
  collateralPools,
  borrowablePools,
  preferredCollateralUids,
  preferredBorrowableUids,
  userPositions,
  subAccounts,
  selectedLender,
  chainId,
  account,
  accountId,
  onAccountIdChange,
  onPoolSelectionChange,
  pendingMarketClick,
  consumeMarketClick,
}) => {
  const [collateralPool, setCollateralPool] = useState<PoolDataItem | null>(null)
  const [debtPool, setDebtPool] = useState<PoolDataItem | null>(null)

  const [inputAmount, setInputAmount] = useState('')
  const [outputAmount, setOutputAmount] = useState('')
  const [activeField, setActiveField] = useState<'input' | 'output'>('input')
  const [isAll, setIsAll] = useState(false)
  const [slippage, setSlippage] = useState('0.3')

  const {
    quotes, permissions, transactions, rateImpact, simulation, selectedIndex, loading,
    executingQuote, txSuccess, error,
    fetchQuotes, selectQuote, executeNextPermission, executeNextTransaction, executeQuote, dismissSuccess, reset,
  } = useTradingQuotes({ chainId, account })

  // Notify parent
  useEffect(() => {
    const selections: SelectedPool[] = []
    if (collateralPool) selections.push({ pool: collateralPool, role: 'input', side: 'collateral' })
    if (debtPool) selections.push({ pool: debtPool, role: 'output', side: 'borrowable' })
    onPoolSelectionChange(selections)
  }, [collateralPool, debtPool, onPoolSelectionChange])

  // Apply by-config row clicks: collateral row → collateralPool, borrowable
  // row → debtPool. Side is unambiguous for Close.
  useEffect(() => {
    if (!pendingMarketClick) return
    if (pendingMarketClick.side === 'collateral') {
      setCollateralPool(pendingMarketClick.pool)
    } else {
      setDebtPool(pendingMarketClick.pool)
    }
    consumeMarketClick?.()
  }, [pendingMarketClick, consumeMarketClick])

  // Clear stale quotes when the user picks a different pair — the old
  // routes reference the previous markets.
  useEffect(() => {
    reset()
  }, [collateralPool?.marketUid, debtPool?.marketUid])

  // Close range (flash-loan aware max)
  const [closeRange, setCloseRange] = useState<LoopRangeEntry | null>(null)
  const [closeRangeLoading, setCloseRangeLoading] = useState(false)

  const activeSubAccount = useMemo(
    () => subAccounts.find((s) => s.accountId === accountId) ?? null,
    [subAccounts, accountId]
  )

  // Brokered (Lista) debt: each fixed loan repays by its own loanId — pick which
  // one this close targets. (BROKERED_MARKETS.md §6)
  const brokeredLoans =
    activeSubAccount && debtPool ? loansForMarket(activeSubAccount.positions, debtPool.marketUid) : []
  const isDebtBrokered =
    !!debtPool && (debtPool.variableBorrowDisabled === true || brokeredLoans.length > 0)
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null)
  useEffect(() => {
    setSelectedLoanId(brokeredLoans[0]?.loanId ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debtPool?.marketUid, brokeredLoans.length])
  const selectedLoan = brokeredLoans.find((l) => l.loanId === selectedLoanId) ?? null

  useEffect(() => {
    if (!collateralPool || !debtPool || !selectedLender || !chainId) {
      setCloseRange(null)
      return
    }

    let cancelled = false
    setCloseRangeLoading(true)

    const run = async () => {
      const filterParams = {
        lender: selectedLender,
        chainId,
        marketUidIn: collateralPool.marketUid,
        marketUidOut: debtPool.marketUid,
        operation: 'close' as const,
      }

      const result = activeSubAccount
        ? await fetchLoopRangeWithSimulation({
            ...filterParams,
            body: {
              balanceData: {
                borrowDiscountedCollateral:
                  activeSubAccount.balanceData.borrowDiscountedCollateral ?? 0,
                collateral: activeSubAccount.balanceData.collateral,
                debt: activeSubAccount.balanceData.debt,
                adjustedDebt: activeSubAccount.balanceData.adjustedDebt ?? 0,
                deposits: activeSubAccount.balanceData.deposits,
                nav: activeSubAccount.balanceData.nav,
                deposits24h: activeSubAccount.balanceData.deposits24h,
                debt24h: activeSubAccount.balanceData.debt24h,
                nav24h: activeSubAccount.balanceData.nav24h,
              },
              aprData: activeSubAccount.aprData,
              modeId: String(activeSubAccount.userConfig.selectedMode),
              positions: activeSubAccount.positions.map((p) => ({
                marketUid: p.marketUid,
                deposits: String(p.deposits),
                depositsUSD: p.depositsUSD,
                debt: String(p.debt),
                debtUSD: p.debtUSD,
                debtStableUSD: p.debtStableUSD,
                collateralEnabled: p.collateralEnabled,
              })),
            },
          })
        : account
          ? await fetchLoopRange({ ...filterParams, account })
          : null

      if (cancelled || !result) return
      setCloseRange(result.success && result.data?.length ? result.data[0] : null)
      setCloseRangeLoading(false)
    }

    run()
    return () => {
      cancelled = true
    }
  }, [
    collateralPool?.marketUid,
    debtPool?.marketUid,
    selectedLender,
    chainId,
    account,
    activeSubAccount,
  ])

  // Close range: amountIn = max collateral to sell, amountOut = max debt to repay
  const maxInputStr = closeRange?.amountInStr ?? '0'
  const maxOutputStr = closeRange?.amountOutStr ?? '0'

  const tradeType = activeField === 'input' ? 0 : 1
  const exactAmount = activeField === 'input' ? inputAmount : outputAmount
  const exactPool = activeField === 'input' ? collateralPool : debtPool

  // Quote-derived amounts for the inactive field
  const selectedQuote = selectedIndex !== null ? quotes[selectedIndex] : null
  const quotedInputAmount = selectedQuote ? formatTokenForInput(selectedQuote.tradeAmountIn) : ''
  const quotedOutputAmount = selectedQuote ? formatTokenForInput(selectedQuote.tradeAmountOut) : ''

  const handleFetchQuotes = () => {
    if (!collateralPool || !debtPool || !exactPool) return
    fetchQuotes('Close', {
      marketUidIn: collateralPool.marketUid,
      marketUidOut: debtPool.marketUid,
      amount: parseUnits(exactAmount || '0', exactPool.asset.decimals).toString(),
      slippage: (parseFloat(slippage) || 0.3) * 100,
      irModeOut: LendingMode.VARIABLE,
      tradeType,
      ...(isAll ? { isAll: true } : {}),
      // Brokered debt: repay the selected fixed loan by its loanId. (Docs §6)
      ...(isDebtBrokered && selectedLoanId ? { loanId: selectedLoanId } : {}),
      usePendleMintRedeem: false,
      ...(accountId ? { accountId } : {}),
    }, account, activeSubAccount ? buildSimulationBody(activeSubAccount) : undefined)
  }

  const canFetch =
    !!collateralPool && !!debtPool && !!exactAmount && (!isDebtBrokered || selectedLoan != null)

  if (txSuccess) {
    return <TradingTransactionSuccess operation={txSuccess.operation} hash={txSuccess.hash} onDismiss={dismissSuccess} />
  }

  return (
    <div className="space-y-3">
      {(subAccounts.length > 0 || lenderSupportsSubAccounts(selectedLender)) && (
        <SubAccountSelector
          subAccounts={subAccounts}
          selectedAccountId={accountId ?? null}
          onChange={onAccountIdChange}
          allowCreate={false}
          chainId={chainId}
          lender={selectedLender}
          account={account}
        />
      )}

      {/* Collateral (Sell) + Input amount */}
      <div className={`rounded-lg p-2 transition-colors ${activeField === 'input' ? 'ring-1 ring-primary bg-primary/5' : 'bg-base-200/30'}`}>
        <PoolSelectorDropdown
          pools={collateralPools}
          value={collateralPool}
          onChange={setCollateralPool}
          userPositions={userPositions}
          label="Collateral (Sell)"
          positionType="deposits"
          preferredUids={preferredCollateralUids}
        />
        <div className="form-control mt-1.5">
          <div className="flex items-center justify-between mb-0.5">
            <label className="label-text text-xs">
              Amount
              {activeField === 'input' && <span className="text-primary ml-1 text-[10px] font-medium">(exact)</span>}
            </label>
            {activeField === 'input' && (
              <AmountQuickButtons
                maxAmount={maxInputStr}
                onSelect={(v) => { setInputAmount(v); setIsAll(false); reset() }}
                onMax={() => { setInputAmount(maxInputStr); setIsAll(true); reset() }}
                decimals={collateralPool?.asset?.decimals}
              />
            )}
          </div>
          <input
            type="text"
            inputMode="decimal"
            className={`input input-bordered input-sm w-full ${activeField !== 'input' ? 'opacity-60' : ''}`}
            placeholder="0.0"
            value={activeField === 'input' ? inputAmount : quotedInputAmount}
            readOnly={activeField !== 'input'}
            onFocus={() => {
              if (activeField !== 'input') {
                setActiveField('input')
                setInputAmount(quotedInputAmount)
                setIsAll(false)
                reset()
              }
            }}
            onChange={(e) => {
              const v = sanitizeAmountInput(e.target.value)
              if (v === null) return
              setInputAmount(v)
              setIsAll(false)
              reset()
            }}
          />
          {closeRangeLoading && (
            <span className="text-[10px] text-base-content/50 mt-0.5 flex items-center gap-1">
              <span className="loading loading-spinner loading-xs" /> Loading max...
            </span>
          )}
          {!closeRangeLoading && parseFloat(maxInputStr) > 0 && (
            <span className="text-[10px] text-base-content/50 mt-0.5">
              Max: {formatTokenForInput(maxInputStr)} {collateralPool?.asset.symbol}
              {closeRange?.amountUSD ? ` ($${formatUsd(closeRange.amountUSD)})` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Debt (Repay) + Output amount */}
      <div className={`rounded-lg p-2 transition-colors ${activeField === 'output' ? 'ring-1 ring-primary bg-primary/5' : 'bg-base-200/30'}`}>
        <PoolSelectorDropdown
          pools={borrowablePools}
          value={debtPool}
          onChange={setDebtPool}
          userPositions={userPositions}
          label="Debt (Repay)"
          positionType="debt"
          preferredUids={preferredBorrowableUids}
        />

        {/* Loan picker — brokered (Lista) debt repays per loanId. */}
        {isDebtBrokered && (
          <div className="mt-1.5 rounded-lg border border-warning/30 bg-warning/5 p-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="badge badge-xs bg-warning/15 text-warning border-0 font-medium">
                Fixed-term
              </span>
              <span className="text-[10px] text-base-content/60">Choose the loan to close</span>
            </div>
            {brokeredLoans.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {brokeredLoans.map((loan) => {
                  const active = loan.loanId === selectedLoanId
                  const mat = maturityDisplay(loan)
                  const ratePct = loanRatePct(loan)
                  return (
                    <button
                      key={loan.loanId}
                      type="button"
                      onClick={() => {
                        setSelectedLoanId(loan.loanId ?? null)
                        reset()
                      }}
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
                      <span className="text-xs font-mono tabular-nums text-error shrink-0">
                        {formatTokenForInput(loanDebtString(loan))} {debtPool?.asset.symbol}
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <span className="text-[10px] text-base-content/50">
                No fixed loans found for this market{accountId ? '' : ' — select a sub-account'}.
              </span>
            )}
          </div>
        )}

        <div className="form-control mt-1.5">
          <div className="flex items-center justify-between mb-0.5">
            <label className="label-text text-xs">
              Amount
              {activeField === 'output' && <span className="text-primary ml-1 text-[10px] font-medium">(exact)</span>}
            </label>
            {activeField === 'output' && (
              <AmountQuickButtons
                maxAmount={maxOutputStr}
                onSelect={(v) => { setOutputAmount(v); setIsAll(false); reset() }}
                onMax={() => { setOutputAmount(maxOutputStr); reset() }}
                decimals={debtPool?.asset?.decimals}
              />
            )}
          </div>
          <input
            type="text"
            inputMode="decimal"
            className={`input input-bordered input-sm w-full ${activeField !== 'output' ? 'opacity-60' : ''}`}
            placeholder="0.0"
            value={activeField === 'output' ? outputAmount : quotedOutputAmount}
            readOnly={activeField !== 'output'}
            onFocus={() => {
              if (activeField !== 'output') {
                setActiveField('output')
                setOutputAmount(quotedOutputAmount)
                setIsAll(false)
                reset()
              }
            }}
            onChange={(e) => {
              const v = sanitizeAmountInput(e.target.value)
              if (v === null) return
              setOutputAmount(v)
              setIsAll(false)
              reset()
            }}
          />
          {/* Withdraw All — when in exact output mode with max selected, withdraw all collateral + repay max debt */}
          {activeField === 'output' && outputAmount === maxOutputStr && parseFloat(maxOutputStr) > 0 && (
            <label className="flex items-center gap-1.5 cursor-pointer mt-1">
              <input
                type="checkbox"
                className="checkbox checkbox-xs checkbox-primary"
                checked={isAll}
                onChange={(e) => { setIsAll(e.target.checked); reset() }}
              />
              <span className="text-[10px] text-base-content/70">Withdraw all collateral (repay debt, refund residual)</span>
            </label>
          )}
          {closeRangeLoading && (
            <span className="text-[10px] text-base-content/50 mt-0.5 flex items-center gap-1">
              <span className="loading loading-spinner loading-xs" /> Loading max...
            </span>
          )}
          {!closeRangeLoading && parseFloat(maxOutputStr) > 0 && (
            <span className="text-[10px] text-base-content/50 mt-0.5">
              Max: {formatTokenForInput(maxOutputStr)} {debtPool?.asset.symbol}
              {closeRange?.amountUSD ? ` ($${formatUsd(closeRange.amountUSD)})` : ''}
            </span>
          )}
        </div>
      </div>

      <SlippageInput value={slippage} onChange={setSlippage} />

      <button
        type="button"
        className="btn btn-primary btn-sm w-full"
        disabled={!canFetch || loading}
        onClick={handleFetchQuotes}
      >
        {loading ? 'Fetching quotes...' : 'Get Close Quotes'}
      </button>

      {error && <ErrorDisplay error={error} />}

      {quotes.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium">Quotes</span>
          {(() => {
            const impacts = quotes
              .map((q) => q.priceImpactUSD)
              .filter((v): v is number => v != null)
            const bestImpact = impacts.length > 0 ? Math.max(...impacts) : undefined
            return quotes.map((q, i) => (
              <QuoteCard
                key={i}
                quote={q}
                index={i}
                isSelected={selectedIndex === i}
                onClick={() => selectQuote(i)}
                operation="Close"
                inSymbol={collateralPool?.asset.symbol}
                outSymbol={debtPool?.asset.symbol}
                bestPriceImpactUSD={bestImpact}
              />
            ))
          })()}
        </div>
      )}

      {/* Rate impact */}
      <RateImpactIndicator
        rateImpact={rateImpact}
        marketLabels={{
          ...(collateralPool ? { [collateralPool.marketUid]: `${collateralPool.asset.symbol} (Collateral)` } : {}),
          ...(debtPool ? { [debtPool.marketUid]: `${debtPool.asset.symbol} (Debt)` } : {}),
        }}
      />

      {/* Position impact (health factor / borrow capacity) */}
      <SimulationIndicator simulation={simulation} />

      {selectedIndex !== null && (
        <div className="space-y-1.5">
          {permissions.map((tx, i) => (
            <button key={`perm-${i}`} type="button" className="btn btn-outline btn-sm w-full h-auto min-h-8 py-1 text-xs" title={tx.description || 'Approve'} onClick={() => executeNextPermission(i)}>
              <span className="block truncate max-w-full">{tx.description || 'Approve'}</span>
            </button>
          ))}
          {transactions.map((tx, i) => (
            <button key={`tx-${i}`} type="button" className="btn btn-outline btn-sm w-full h-auto min-h-8 py-1 text-xs" title={tx.description || 'Execute Setup Transaction'} onClick={() => executeNextTransaction(i)}>
              <span className="block truncate max-w-full">{tx.description || 'Execute Setup Transaction'}</span>
            </button>
          ))}
          <button type="button" className="btn btn-success btn-sm w-full" disabled={executingQuote} onClick={() => executeQuote('Close')}>
            {executingQuote ? <span className="loading loading-spinner loading-xs" /> : 'Execute Close'}
          </button>
        </div>
      )}
    </div>
  )
}
