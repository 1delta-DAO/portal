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
import { formatTokenAmount, formatUsd } from '../../DashboardActions/format'
import { ErrorDisplay } from '../ErrorDisplay'
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
  const { data: chainTokens } = useTokenLists(chainId)

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
  } = useTradingQuotes({ chainId, account })

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
    if (hasWrappedNative && chainTokens[zeroAddress]) {
      assets.unshift(chainTokens[zeroAddress] as RawCurrency)
    }

    return assets
  }, [collateralPool, debtPool, chainTokens])

  const selectedPayCurrency = payCurrencies.find(c => c.address === payCurrencyAddress) ?? null

  // Reset pay currency when pools change
  useEffect(() => {
    setPayCurrencyAddress(null)
    setPayAmount('')
  }, [collateralPool?.marketUid, debtPool?.marketUid])

  // Notify parent of pool selections for table highlighting
  useEffect(() => {
    const selections: SelectedPool[] = []
    if (collateralPool) selections.push({ pool: collateralPool, role: 'output' })
    if (debtPool) selections.push({ pool: debtPool, role: 'input' })
    onPoolSelectionChange(selections)
  }, [collateralPool, debtPool, onPoolSelectionChange])

  // Max amounts
  const debtPos = debtPool ? userPositions.get(debtPool.marketUid) : null
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
        <label className="label-text text-xs mb-1">Pay With (Margin)</label>
        {payCurrencies.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {payCurrencies.map(c => {
              const isActive = payCurrencyAddress === c.address
              return (
                <button
                  key={c.address}
                  type="button"
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors border cursor-pointer ${
                    isActive
                      ? 'border-primary bg-primary/10 ring-1 ring-primary'
                      : 'border-base-300 bg-base-200/50 hover:bg-base-200'
                  }`}
                  onClick={() => { setPayCurrencyAddress(c.address); setPayAmount('') }}
                >
                  <img src={c.logoURI} width={16} height={16} alt={c.symbol} className="rounded-full object-cover w-4 h-4" />
                  <span className="font-medium">{c.symbol}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <span className="text-xs text-base-content/50">Select collateral & debt pools first</span>
        )}
      </div>

      {/* Pay amount + wallet balance */}
      {selectedPayCurrency && (() => {
        const wb = walletBalances.get(selectedPayCurrency.address.toLowerCase())
        return (
          <div className="form-control">
            {wb && parseFloat(wb.balance) > 0 && (
              <div className="text-xs flex justify-between px-1 mb-1">
                <span className="text-base-content/60">Wallet balance:</span>
                <span className="font-medium">
                  {formatTokenAmount(wb.balance)} {selectedPayCurrency.symbol} (${formatUsd(wb.balanceUSD)})
                </span>
              </div>
            )}
            <div className="flex items-center justify-between mb-0.5">
              <label className="label-text text-xs">Pay Amount</label>
              {wb ? <AmountQuickButtons maxAmount={Number(wb.balance)} onSelect={setPayAmount} /> : null}
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
        )
      })()}

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
      {error && <ErrorDisplay error={error} />}

      {/* Permissions */}
      {permissions.map((tx, i) => (
        <button
          key={i}
          type="button"
          className="btn btn-outline btn-sm w-full"
          onClick={() => executePermission(tx)}
        >
          {tx.description || 'Approve'}
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
              inSymbol={debtPool?.asset.symbol}
              outSymbol={collateralPool?.asset.symbol}
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
