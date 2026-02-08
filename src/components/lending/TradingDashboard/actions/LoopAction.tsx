import React, { useMemo, useState, useEffect } from 'react'
import { isWNative, LendingMode, type RawCurrency } from '@1delta/lib-utils'
import { parseUnits, zeroAddress } from 'viem'
import { useTokenLists } from '../../../../hooks/useTokenLists'
import type { PoolDataItem } from '../../../../hooks/lending/usePoolData'
import type { TradingActionProps, SelectedPool } from '../types'
import { PoolSelectorDropdown } from '../PoolSelectorDropdown'
import { SlippageInput } from '../SlippageInput'
import { QuoteCard } from '../QuoteCard'
import { AmountQuickButtons } from '../../DashboardActions/AmountQuickButtons'
import { useTradingQuotes } from '../useTradingQuotes'

export const LoopAction: React.FC<TradingActionProps> = ({
  allPools,
  userPositions,
  walletBalances,
  selectedLender,
  chainId,
  account,
  accountId,
  onPoolSelectionChange,
}) => {
  const { data: tokenLists } = useTokenLists()

  // Pool selections
  const [collateralPool, setCollateralPool] = useState<PoolDataItem | null>(null)
  const [debtPool, setDebtPool] = useState<PoolDataItem | null>(null)

  // Amounts
  const [debtAmount, setDebtAmount] = useState('')
  const [payAmount, setPayAmount] = useState('')

  // Pay currency
  const [payCurrencyAddress, setPayCurrencyAddress] = useState<string | null>(null)

  // Options
  const [slippage, setSlippage] = useState('0.3')

  // Quotes
  const {
    quotes, permissions, selectedIndex, loading, executing, error,
    fetchQuotes, selectQuote, executePermission, executeQuote, reset,
  } = useTradingQuotes()

  // Derive pay currencies from selected pools
  const payCurrencies = useMemo(() => {
    const assets: RawCurrency[] = []

    if (collateralPool?.asset) {
      assets.push(collateralPool.asset)
    }
    if (debtPool?.asset && debtPool.asset.address !== collateralPool?.asset?.address) {
      assets.push(debtPool.asset)
    }

    // Add native token if wrapped native is in the list
    const hasWrappedNative = assets.some(a => isWNative(a))
    if (hasWrappedNative && tokenLists[chainId]?.[zeroAddress]) {
      assets.unshift(tokenLists[chainId][zeroAddress] as RawCurrency)
    }

    return assets
  }, [collateralPool, debtPool, tokenLists, chainId])

  const selectedPayCurrency = payCurrencies.find(c => c.address === payCurrencyAddress) ?? null

  // Reset pay currency when pools change
  useEffect(() => {
    setPayCurrencyAddress(null)
    setPayAmount('')
  }, [collateralPool?.poolId, debtPool?.poolId])

  // Notify parent of pool selections for table highlighting
  useEffect(() => {
    const selections: SelectedPool[] = []
    if (collateralPool) selections.push({ pool: collateralPool, role: 'output' })
    if (debtPool) selections.push({ pool: debtPool, role: 'input' })
    onPoolSelectionChange(selections)
  }, [collateralPool, debtPool, onPoolSelectionChange])

  // Max amounts
  const debtPos = debtPool ? userPositions.get(debtPool.underlying.toLowerCase()) : null
  const maxBorrowable = debtPos ? Number(debtPos.borrowable) : 0

  const handleFetchQuotes = () => {
    if (!collateralPool || !debtPool || !selectedPayCurrency) return
    fetchQuotes('Loop', {
      chainId,
      lender: selectedLender,
      collateralAsset: collateralPool.asset.address,
      debtAsset: debtPool.asset.address,
      payAsset: selectedPayCurrency.address,
      payAmount: parseUnits(payAmount || '0', selectedPayCurrency.decimals).toString(),
      debtAmount: parseUnits(debtAmount || '0', debtPool.asset.decimals).toString(),
      slippage: parseFloat(slippage) || 0.3,
      borrowMode: LendingMode.VARIABLE,
      usePendleMintRedeem: false,
      ...(accountId ? { accountId } : {}),
    }, account)
  }

  const canFetch = !!collateralPool && !!debtPool && !!selectedPayCurrency && (!!debtAmount || !!payAmount)

  return (
    <div className="space-y-3">
      {/* Collateral pool */}
      <PoolSelectorDropdown
        pools={allPools}
        value={collateralPool}
        onChange={setCollateralPool}
        userPositions={userPositions}
        label="Collateral (Deposit Into)"
        positionType="deposits"
      />

      {/* Debt pool */}
      <PoolSelectorDropdown
        pools={allPools}
        value={debtPool}
        onChange={setDebtPool}
        userPositions={userPositions}
        label="Debt (Borrow From)"
        positionType="debt"
      />

      {/* Debt amount */}
      <div className="form-control">
        <div className="flex items-center justify-between mb-0.5">
          <label className="label-text text-xs">Debt Amount</label>
          <AmountQuickButtons maxAmount={maxBorrowable} onSelect={setDebtAmount} />
        </div>
        <input
          type="text"
          inputMode="decimal"
          className="input input-bordered input-sm w-full"
          placeholder="0.0"
          value={debtAmount}
          onChange={(e) => { setDebtAmount(e.target.value); reset() }}
        />
        {debtPos && Number(debtPos.borrowable) > 0 && (
          <span className="text-[10px] text-base-content/50 mt-0.5">
            Borrowable: {Number(debtPos.borrowable).toFixed(4)}
          </span>
        )}
      </div>

      {/* Pay currency */}
      <div className="form-control">
        <label className="label-text text-xs mb-0.5">Pay With (Margin)</label>
        <select
          className="select select-bordered select-sm w-full"
          value={payCurrencyAddress ?? ''}
          onChange={(e) => { setPayCurrencyAddress(e.target.value); setPayAmount('') }}
          disabled={payCurrencies.length === 0}
        >
          <option value="" disabled>Select pay currency...</option>
          {payCurrencies.map(c => (
            <option key={c.address} value={c.address}>{c.symbol}</option>
          ))}
        </select>
      </div>

      {/* Pay amount */}
      {selectedPayCurrency && (
        <div className="form-control">
          <div className="flex items-center justify-between mb-0.5">
            <label className="label-text text-xs">Pay Amount</label>
            {(() => {
              const wb = walletBalances.get(selectedPayCurrency.address.toLowerCase())
              return wb ? <AmountQuickButtons maxAmount={Number(wb.balance)} onSelect={setPayAmount} /> : null
            })()}
          </div>
          <input
            type="text"
            inputMode="decimal"
            className="input input-bordered input-sm w-full"
            placeholder="0.0"
            value={payAmount}
            onChange={(e) => { setPayAmount(e.target.value); reset() }}
          />
        </div>
      )}

      {/* Slippage */}
      <SlippageInput value={slippage} onChange={setSlippage} />

      {/* Fetch quotes */}
      <button
        type="button"
        className="btn btn-primary btn-sm w-full"
        disabled={!canFetch || loading}
        onClick={handleFetchQuotes}
      >
        {loading ? 'Fetching quotes...' : 'Get Loop Quotes'}
      </button>

      {/* Error */}
      {error && <div className="text-error text-xs">{error}</div>}

      {/* Permissions */}
      {permissions.map((tx, i) => (
        <button
          key={i}
          type="button"
          className="btn btn-outline btn-sm w-full"
          onClick={() => executePermission(tx)}
        >
          {tx.info || 'Approve'}
        </button>
      ))}

      {/* Quotes */}
      {quotes.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium">Quotes</span>
          {quotes.map((q, i) => (
            <QuoteCard
              key={i}
              quote={q}
              index={i}
              isSelected={selectedIndex === i}
              onClick={() => selectQuote(i)}
              operation="Loop"
            />
          ))}
        </div>
      )}

      {/* Execute */}
      {selectedIndex !== null && (
        <button
          type="button"
          className="btn btn-success btn-sm w-full"
          disabled={executing}
          onClick={executeQuote}
        >
          {executing ? 'Executing...' : 'Execute Loop'}
        </button>
      )}
    </div>
  )
}
