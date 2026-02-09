import React, { useState, useEffect } from 'react'
import { LendingMode } from '@1delta/lib-utils'
import { parseUnits } from 'viem'
import type { PoolDataItem } from '../../../../hooks/lending/usePoolData'
import type { TradingActionProps, SelectedPool } from '../types'
import { PoolSelectorDropdown } from '../PoolSelectorDropdown'
import { SlippageInput } from '../SlippageInput'
import { QuoteCard } from '../QuoteCard'
import { AmountQuickButtons } from '../../DashboardActions/AmountQuickButtons'
import { ErrorDisplay } from '../ErrorDisplay'
import { useTradingQuotes } from '../useTradingQuotes'

export const DebtSwapAction: React.FC<TradingActionProps> = ({
  allPools,
  userPositions,
  selectedLender,
  chainId,
  account,
  accountId,
  onPoolSelectionChange,
}) => {
  const [debtInPool, setDebtInPool] = useState<PoolDataItem | null>(null)
  const [debtOutPool, setDebtOutPool] = useState<PoolDataItem | null>(null)

  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState('0.3')
  const [tradeType, setTradeType] = useState(0)
  const [isMaxOut, setIsMaxOut] = useState(false)

  const {
    quotes, permissions, selectedIndex, loading, executing, error,
    fetchQuotes, selectQuote, executePermission, executeQuote, reset,
  } = useTradingQuotes()

  // Notify parent
  useEffect(() => {
    const selections: SelectedPool[] = []
    if (debtInPool) selections.push({ pool: debtInPool, role: 'input' })
    if (debtOutPool) selections.push({ pool: debtOutPool, role: 'output' })
    onPoolSelectionChange(selections)
  }, [debtInPool, debtOutPool, onPoolSelectionChange])

  // Max = existing debt balance of the asset being repaid (debt out)
  const debtOutPos = debtOutPool ? userPositions.get(debtOutPool.marketUid) : null
  const maxDebt = debtOutPos ? Number(debtOutPos.debt) + Number(debtOutPos.debtStable) : 0

  const handleFetchQuotes = () => {
    if (!debtInPool || !debtOutPool) return
    fetchQuotes('DebtSwap', {
      chainId,
      lender: selectedLender,
      debtAssetIn: debtInPool.asset.address,
      debtAssetOut: debtOutPool.asset.address,
      amount: parseUnits(amount || '0', debtOutPool.asset.decimals).toString(),
      slippage: parseFloat(slippage) || 0.3,
      irModeIn: LendingMode.VARIABLE,
      irModeOut: LendingMode.VARIABLE,
      tradeType,
      isMaxOut,
      usePendleMintRedeem: false,
      ...(accountId ? { accountId } : {}),
    }, account)
  }

  const canFetch = !!debtInPool && !!debtOutPool && !!amount

  return (
    <div className="space-y-3">
      <PoolSelectorDropdown
        pools={allPools}
        value={debtInPool}
        onChange={setDebtInPool}
        userPositions={userPositions}
        label="Borrow (New Debt)"
        positionType="debt"
      />

      <PoolSelectorDropdown
        pools={allPools}
        value={debtOutPool}
        onChange={setDebtOutPool}
        userPositions={userPositions}
        label="Repay (Existing Debt)"
        positionType="debt"
      />

      {/* Amount */}
      <div className="form-control">
        <div className="flex items-center justify-between mb-0.5">
          <label className="label-text text-xs">Amount</label>
          <AmountQuickButtons maxAmount={maxDebt} onSelect={setAmount} />
        </div>
        <input
          type="text"
          inputMode="decimal"
          className="input input-bordered input-sm w-full"
          placeholder="0.0"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); reset() }}
        />
        {debtOutPos && maxDebt > 0 && (
          <span className="text-[10px] text-base-content/50 mt-0.5">
            Existing Debt: {maxDebt.toFixed(4)} {debtOutPool?.asset.symbol}
          </span>
        )}
      </div>

      {/* Trade type + Max Out */}
      <div className="flex items-center gap-3 text-xs">
        <select
          className="select select-bordered select-xs flex-1"
          value={tradeType}
          onChange={(e) => setTradeType(Number(e.target.value))}
        >
          <option value={0}>Exact Input</option>
          <option value={1}>Exact Output</option>
        </select>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            className="checkbox checkbox-xs checkbox-primary"
            checked={isMaxOut}
            onChange={(e) => setIsMaxOut(e.target.checked)}
          />
          <span>Max Out</span>
        </label>
      </div>

      <SlippageInput value={slippage} onChange={setSlippage} />

      <button
        type="button"
        className="btn btn-primary btn-sm w-full"
        disabled={!canFetch || loading}
        onClick={handleFetchQuotes}
      >
        {loading ? 'Fetching quotes...' : 'Get Debt Swap Quotes'}
      </button>

      {error && <ErrorDisplay error={error} />}

      {permissions.map((tx, i) => (
        <button key={i} type="button" className="btn btn-outline btn-sm w-full" onClick={() => executePermission(tx)}>
          {tx.info || 'Approve'}
        </button>
      ))}

      {quotes.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium">Quotes</span>
          {quotes.map((q, i) => (
            <QuoteCard key={i} quote={q} index={i} isSelected={selectedIndex === i} onClick={() => selectQuote(i)} operation="DebtSwap" inSymbol={debtInPool?.asset.symbol} outSymbol={debtOutPool?.asset.symbol} />
          ))}
        </div>
      )}

      {selectedIndex !== null && (
        <button type="button" className="btn btn-success btn-sm w-full" disabled={executing} onClick={executeQuote}>
          {executing ? 'Executing...' : 'Execute Debt Swap'}
        </button>
      )}
    </div>
  )
}
