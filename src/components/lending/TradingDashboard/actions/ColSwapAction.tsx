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

export const ColSwapAction: React.FC<TradingActionProps> = ({
  allPools,
  userPositions,
  chainId,
  account,
  accountId,
  onPoolSelectionChange,
}) => {
  const [colInPool, setColInPool] = useState<PoolDataItem | null>(null)
  const [colOutPool, setColOutPool] = useState<PoolDataItem | null>(null)

  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState('0.3')
  const [tradeType, setTradeType] = useState(0) // 0=EXACT_INPUT, 1=EXACT_OUTPUT
  const [isMaxIn, setIsMaxIn] = useState(false)

  const {
    quotes, permissions, selectedIndex, loading, executing, error,
    fetchQuotes, selectQuote, executePermission, executeQuote, reset,
  } = useTradingQuotes({ chainId, account })

  // Notify parent
  useEffect(() => {
    const selections: SelectedPool[] = []
    if (colInPool) selections.push({ pool: colInPool, role: 'input' })
    if (colOutPool) selections.push({ pool: colOutPool, role: 'output' })
    onPoolSelectionChange(selections)
  }, [colInPool, colOutPool, onPoolSelectionChange])

  // Max = withdrawable of collateral in
  const colInPos = colInPool ? userPositions.get(colInPool.marketUid) : null
  const maxWithdrawable = colInPos ? Number(colInPos.withdrawable) : 0

  const handleFetchQuotes = () => {
    if (!colInPool || !colOutPool) return
    fetchQuotes('ColSwap', {
      marketUidIn: colInPool.marketUid,
      marketUidOut: colOutPool.marketUid,
      amount: parseUnits(amount || '0', colInPool.asset.decimals).toString(),
      slippage: parseFloat(slippage) || 0.3,
      irModeIn: LendingMode.NONE,
      irModeOut: LendingMode.NONE,
      tradeType,
      isMaxIn,
      usePendleMintRedeem: false,
      ...(accountId ? { accountId } : {}),
    }, account)
  }

  const canFetch = !!colInPool && !!colOutPool && !!amount

  return (
    <div className="space-y-3">
      <PoolSelectorDropdown
        pools={allPools}
        value={colInPool}
        onChange={setColInPool}
        userPositions={userPositions}
        label="Collateral In (Withdraw)"
        positionType="deposits"
      />

      <PoolSelectorDropdown
        pools={allPools}
        value={colOutPool}
        onChange={setColOutPool}
        userPositions={userPositions}
        label="Collateral Out (Deposit)"
        positionType="deposits"
      />

      {/* Amount */}
      <div className="form-control">
        <div className="flex items-center justify-between mb-0.5">
          <label className="label-text text-xs">Amount</label>
          <AmountQuickButtons maxAmount={maxWithdrawable} onSelect={setAmount} />
        </div>
        <input
          type="text"
          inputMode="decimal"
          className="input input-bordered input-sm w-full"
          placeholder="0.0"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); reset() }}
        />
        {colInPos && Number(colInPos.withdrawable) > 0 && (
          <span className="text-[10px] text-base-content/50 mt-0.5">
            Withdrawable: {Number(colInPos.withdrawable).toFixed(4)}
          </span>
        )}
      </div>

      {/* Trade type + Max In */}
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
            checked={isMaxIn}
            onChange={(e) => setIsMaxIn(e.target.checked)}
          />
          <span>Max In</span>
        </label>
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

      {permissions.map((tx, i) => (
        <button key={i} type="button" className="btn btn-outline btn-sm w-full" onClick={() => executePermission(tx)}>
          {tx.description || 'Approve'}
        </button>
      ))}

      {quotes.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium">Quotes</span>
          {quotes.map((q, i) => (
            <QuoteCard key={i} quote={q} index={i} isSelected={selectedIndex === i} onClick={() => selectQuote(i)} operation="ColSwap" inSymbol={colInPool?.asset.symbol} outSymbol={colOutPool?.asset.symbol} />
          ))}
        </div>
      )}

      {selectedIndex !== null && (
        <button type="button" className="btn btn-success btn-sm w-full" disabled={executing} onClick={executeQuote}>
          {executing ? 'Executing...' : 'Execute Collateral Swap'}
        </button>
      )}
    </div>
  )
}
