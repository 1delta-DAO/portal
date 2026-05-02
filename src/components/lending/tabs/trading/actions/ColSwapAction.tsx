import React, { useMemo, useState, useEffect } from 'react'
import { LendingMode } from '../../../../../lib/lib-utils'
import { parseUnits } from 'viem'
import type { PoolDataItem } from '../../../../../hooks/lending/usePoolData'
import type { TradingActionProps, SelectedPool } from '../types'
import type { UserSubAccount } from '../../../../../hooks/lending/useUserData'
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

export const ColSwapAction: React.FC<TradingActionProps> = ({
  collateralPools,
  preferredCollateralUids,
  userPositions,
  subAccounts,
  selectedLender,
  chainId,
  account,
  accountId,
  onAccountIdChange,
  onPoolSelectionChange,
}) => {
  const [colInPool, setColInPool] = useState<PoolDataItem | null>(null)
  const [colOutPool, setColOutPool] = useState<PoolDataItem | null>(null)

  const [inputAmount, setInputAmount] = useState('')
  const [outputAmount, setOutputAmount] = useState('')
  const [activeField, setActiveField] = useState<'input' | 'output'>('input')
  const [isAll, setIsMaxIn] = useState(false)
  const [slippage, setSlippage] = useState('0.3')

  const {
    quotes, permissions, transactions, rateImpact, simulation, selectedIndex, loading,
    executingQuote, txSuccess, error,
    fetchQuotes, selectQuote, executeNextPermission, executeNextTransaction, executeQuote, dismissSuccess, reset,
  } = useTradingQuotes({ chainId, account })

  // Notify parent
  useEffect(() => {
    const selections: SelectedPool[] = []
    if (colInPool) selections.push({ pool: colInPool, role: 'input' })
    if (colOutPool) selections.push({ pool: colOutPool, role: 'output' })
    onPoolSelectionChange(selections)
  }, [colInPool, colOutPool, onPoolSelectionChange])

  // Swap range (flash-loan aware max)
  const [swapRange, setSwapRange] = useState<LoopRangeEntry | null>(null)
  const [swapRangeLoading, setSwapRangeLoading] = useState(false)

  const activeSubAccount = useMemo<UserSubAccount | null>(
    () => subAccounts.find((s) => s.accountId === accountId) ?? null,
    [subAccounts, accountId]
  )

  useEffect(() => {
    if (!colInPool || !colOutPool || !selectedLender || !chainId) {
      setSwapRange(null)
      return
    }

    let cancelled = false
    setSwapRangeLoading(true)

    const run = async () => {
      const filterParams = {
        lender: selectedLender,
        chainId,
        marketUidIn: colInPool.marketUid,
        marketUidOut: colOutPool.marketUid,
        operation: 'collateral-swap' as const,
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
      setSwapRange(result.success && result.data?.length ? result.data[0] : null)
      setSwapRangeLoading(false)
    }

    run()
    return () => {
      cancelled = true
    }
  }, [
    colInPool?.marketUid,
    colOutPool?.marketUid,
    selectedLender,
    chainId,
    account,
    activeSubAccount,
  ])

  const maxSwapStr = swapRange?.amountInStr ?? '0'

  const tradeType = activeField === 'input' ? 0 : 1
  const exactAmount = activeField === 'input' ? inputAmount : outputAmount
  const exactPool = activeField === 'input' ? colInPool : colOutPool

  // Quote-derived amounts for the inactive field
  const selectedQuote = selectedIndex !== null ? quotes[selectedIndex] : null
  const quotedInputAmount = selectedQuote ? formatTokenForInput(selectedQuote.tradeAmountIn) : ''
  const quotedOutputAmount = selectedQuote ? formatTokenForInput(selectedQuote.tradeAmountOut) : ''

  const handleFetchQuotes = () => {
    if (!colInPool || !colOutPool || !exactPool) return
    fetchQuotes('ColSwap', {
      marketUidIn: colInPool.marketUid,
      marketUidOut: colOutPool.marketUid,
      amount: parseUnits(exactAmount || '0', exactPool.asset.decimals).toString(),
      slippage: (parseFloat(slippage) || 0.3) * 100,
      irModeIn: LendingMode.NONE,
      irModeOut: LendingMode.NONE,
      tradeType,
      ...(activeField === 'input' && isAll ? { isAll: true } : {}),
      usePendleMintRedeem: false,
      ...(accountId ? { accountId } : {}),
    }, account, activeSubAccount ? buildSimulationBody(activeSubAccount) : undefined)
  }

  const canFetch = !!colInPool && !!colOutPool && !!exactAmount

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

      {/* Collateral In + Input amount */}
      <div className={`rounded-lg p-2 transition-colors ${activeField === 'input' ? 'ring-1 ring-primary bg-primary/5' : 'bg-base-200/30'}`}>
        <PoolSelectorDropdown
          pools={collateralPools}
          value={colInPool}
          onChange={setColInPool}
          userPositions={userPositions}
          label="Collateral In (Withdraw)"
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
                maxAmount={maxSwapStr}
                onSelect={(v) => { setInputAmount(v); setIsMaxIn(false); reset() }}
                onMax={() => { setInputAmount(maxSwapStr); setIsMaxIn(true); reset() }}
                decimals={colInPool?.asset?.decimals}
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
                setIsMaxIn(false)
                reset()
              }
            }}
            onChange={(e) => {
              const v = sanitizeAmountInput(e.target.value)
              if (v === null) return
              setInputAmount(v)
              setIsMaxIn(false)
              reset()
            }}
          />
          {activeField === 'input' && swapRangeLoading && (
            <span className="text-[10px] text-base-content/50 mt-0.5 flex items-center gap-1">
              <span className="loading loading-spinner loading-xs" /> Loading max...
            </span>
          )}
          {activeField === 'input' && !swapRangeLoading && parseFloat(maxSwapStr) > 0 && (
            <span className="text-[10px] text-base-content/50 mt-0.5">
              Max swap: {formatTokenForInput(maxSwapStr)} {colInPool?.asset.symbol}
              {swapRange?.amountUSD ? ` ($${formatUsd(swapRange.amountUSD)})` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Collateral Out + Output amount */}
      <div className={`rounded-lg p-2 transition-colors ${activeField === 'output' ? 'ring-1 ring-primary bg-primary/5' : 'bg-base-200/30'}`}>
        <PoolSelectorDropdown
          pools={collateralPools}
          value={colOutPool}
          onChange={setColOutPool}
          userPositions={userPositions}
          label="Collateral Out (Deposit)"
          positionType="deposits"
          preferredUids={preferredCollateralUids}
        />
        <div className="form-control mt-1.5">
          <div className="flex items-center justify-between mb-0.5">
            <label className="label-text text-xs">
              Amount
              {activeField === 'output' && <span className="text-primary ml-1 text-[10px] font-medium">(exact)</span>}
            </label>
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
                setIsMaxIn(false)
                reset()
              }
            }}
            onChange={(e) => {
              const v = sanitizeAmountInput(e.target.value)
              if (v === null) return
              setOutputAmount(v)
              reset()
            }}
          />
        </div>
      </div>

      <SlippageInput value={slippage} onChange={setSlippage} />

      <button
        type="button"
        className="btn btn-primary btn-sm w-full"
        disabled={!canFetch || loading}
        onClick={handleFetchQuotes}
      >
        {loading ? 'Fetching quotes...' : 'Get Collateral Swap Quotes'}
      </button>

      {error && <ErrorDisplay error={error} />}

      {quotes.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium">Quotes</span>
          {quotes.map((q, i) => (
            <QuoteCard key={i} quote={q} index={i} isSelected={selectedIndex === i} onClick={() => selectQuote(i)} operation="ColSwap" inSymbol={colInPool?.asset.symbol} outSymbol={colOutPool?.asset.symbol} />
          ))}
        </div>
      )}

      {/* Rate impact */}
      <RateImpactIndicator
        rateImpact={rateImpact}
        marketLabels={{
          ...(colInPool ? { [colInPool.marketUid]: `${colInPool.asset.symbol} (Swap From)` } : {}),
          ...(colOutPool ? { [colOutPool.marketUid]: `${colOutPool.asset.symbol} (Swap Into)` } : {}),
        }}
      />

      {/* Position impact (health factor / borrow capacity) */}
      <SimulationIndicator simulation={simulation} />

      {selectedIndex !== null && (
        <div className="space-y-1.5">
          {permissions.map((tx, i) => (
            <button key={`perm-${i}`} type="button" className="btn btn-outline btn-sm w-full h-auto min-h-8 py-1 whitespace-normal text-xs" title={tx.description || 'Approve'} onClick={() => executeNextPermission()}>
              {tx.description || 'Approve'}
            </button>
          ))}
          {transactions.map((tx, i) => (
            <button key={`tx-${i}`} type="button" className="btn btn-outline btn-sm w-full h-auto min-h-8 py-1 whitespace-normal text-xs" title={tx.description || 'Execute Setup Transaction'} onClick={() => executeNextTransaction()}>
              {tx.description || 'Execute Setup Transaction'}
            </button>
          ))}
          <button type="button" className="btn btn-success btn-sm w-full" disabled={executingQuote} onClick={() => executeQuote('ColSwap')}>
            {executingQuote ? <span className="loading loading-spinner loading-xs" /> : 'Execute Collateral Swap'}
          </button>
        </div>
      )}
    </div>
  )
}
