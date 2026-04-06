import React, { useMemo, useState, useEffect } from 'react'
import { isWNative, LendingMode, type RawCurrency } from '../../../../lib/lib-utils'
import { parseUnits, zeroAddress } from 'viem'
import { useTokenLists } from '../../../../hooks/useTokenLists'
import type { PoolDataItem } from '../../../../hooks/lending/usePoolData'
import type { TradingActionProps, SelectedPool } from '../types'
import { PoolSelectorDropdown } from '../PoolSelectorDropdown'
import { SlippageInput } from '../SlippageInput'
import { QuoteCard } from '../QuoteCard'
import { AmountQuickButtons } from '../../DashboardActions/AmountQuickButtons'
import { formatTokenAmount, formatUsd, parseAmount, sanitizeAmountInput } from '../../DashboardActions/format'
import { ErrorDisplay } from '../ErrorDisplay'
import { useTradingQuotes, buildSimulationBody } from '../useTradingQuotes'
import { TradingTransactionSuccess } from '../TradingTransactionSuccess'
import { RateImpactIndicator } from '../../DashboardActions/RateImpactIndicator'
import { SimulationIndicator } from '../../DashboardActions/SimulationIndicator'
import { SubAccountSelector } from '../../DashboardActions/SubAccountSelector'
import { lenderSupportsSubAccounts } from '../../DashboardActions/helpers'
import {
  fetchLoopRangeWithSimulation,
  fetchLoopRange,
  type LoopRangeEntry,
} from '../../../../sdk/lending-helper/fetchLoopRange'

function LoopRangeInfo({
  loopRange,
  loading,
  debtSymbol,
  onSetMax,
}: {
  loopRange: LoopRangeEntry | null
  loading: boolean
  debtSymbol: string
  onSetMax: (amount: number) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-base-content/50 px-1 py-1.5">
        <span className="loading loading-spinner loading-xs" />
        Loading max loop size...
      </div>
    )
  }

  if (!loopRange) return null

  const { modeAnalysis } = loopRange
  const inUserMode = modeAnalysis.userModeRange
  const needsModeSwitch = modeAnalysis.userMode !== modeAnalysis.targetMode
  const formatMode = (mode: string | number) => {
    const s = String(mode)
    return s.startsWith('0x') && s.length > 10 ? `${s.slice(0, 5)}....${s.slice(-3)}` : s
  }

  return (
    <div className="rounded-lg border border-base-300 bg-base-200/40 px-2.5 py-2 space-y-1.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-base-content/60 font-medium">Max Loop Size</span>
        <button
          type="button"
          className="text-primary hover:underline cursor-pointer text-[10px] font-medium"
          onClick={() => onSetMax(loopRange.amountIn)}
        >
          Use max
        </button>
      </div>

      {/* Best-case (target e-mode) */}
      <div className="flex items-center justify-between">
        <span className="text-base-content/70">{needsModeSwitch ? 'Target e-mode' : 'Max'}</span>
        <span className="font-medium">
          {formatTokenAmount(loopRange.amountInStr)} {debtSymbol}{' '}
          <span className="text-base-content/50">(${formatUsd(loopRange.amountUSD)})</span>
        </span>
      </div>

      {/* Current e-mode range (shown only if different from target) */}
      {needsModeSwitch && inUserMode && (
        <div className="flex items-center justify-between">
          <span className="text-base-content/70">Current mode</span>
          <span className="font-medium">
            {formatTokenAmount(inUserMode.amountIn)} {debtSymbol}{' '}
            <span className="text-base-content/50">(${formatUsd(inUserMode.amountUSD)})</span>
          </span>
        </div>
      )}

      {needsModeSwitch && !inUserMode && (
        <div className="text-warning/80">Pair not available in your current mode</div>
      )}

      {/* Mode switch indicator */}
      {needsModeSwitch && (
        <div
          className={`flex items-center gap-1 text-[10px] ${
            modeAnalysis.canSwitchToTargetMode ? 'text-success/80' : 'text-warning/80'
          }`}
        >
          <span>{modeAnalysis.canSwitchToTargetMode ? '\u2713' : '\u26A0'}</span>
          <span>
            {modeAnalysis.canSwitchToTargetMode
              ? `Can switch to borrow mode ${formatMode(modeAnalysis.targetMode)} for better range`
              : `Cannot switch to borrow mode ${formatMode(modeAnalysis.targetMode)} (conflicts with existing positions)`}
          </span>
        </div>
      )}
    </div>
  )
}

export const LoopAction: React.FC<TradingActionProps> = ({
  collateralPools,
  borrowablePools,
  preferredCollateralUids,
  preferredBorrowableUids,
  userPositions,
  walletBalances,
  subAccounts,
  selectedLender,
  chainId,
  account,
  accountId,
  isBalancesFetching,
  refetchBalances,
  onAccountIdChange,
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
    quotes,
    permissions,
    transactions,
    rateImpact,
    simulation,
    selectedIndex,
    loading,
    executingQuote,
    txSuccess,
    error,
    fetchQuotes,
    selectQuote,
    executeNextPermission,
    executeNextTransaction,
    executeQuote,
    dismissSuccess,
    reset,
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
    const hasWrappedNative = assets.some((a) => isWNative(a))
    if (hasWrappedNative && chainTokens[zeroAddress]) {
      assets.unshift(chainTokens[zeroAddress] as RawCurrency)
    }

    return assets
  }, [collateralPool, debtPool, chainTokens])

  const selectedPayCurrency = payCurrencies.find((c) => c.address === payCurrencyAddress) ?? null

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

  // Loop range (max leverage size)
  const [loopRange, setLoopRange] = useState<LoopRangeEntry | null>(null)
  const [loopRangeLoading, setLoopRangeLoading] = useState(false)

  const activeSubAccount = useMemo(
    () => subAccounts.find((s) => s.accountId === accountId) ?? null,
    [subAccounts, accountId]
  )

  // Debounce payAmount to avoid excessive range refetches on every keystroke
  const [debouncedPayAmount, setDebouncedPayAmount] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedPayAmount(payAmount), 400)
    return () => clearTimeout(timer)
  }, [payAmount])

  useEffect(() => {
    if (!collateralPool || !debtPool || !selectedLender || !chainId) {
      setLoopRange(null)
      return
    }

    let cancelled = false
    setLoopRangeLoading(true)

    const run = async () => {
      const payParams = selectedPayCurrency
        ? {
            payAsset: selectedPayCurrency.address,
            ...(debouncedPayAmount
              ? {
                  payAmount: parseUnits(
                    debouncedPayAmount,
                    selectedPayCurrency.decimals
                  ).toString(),
                }
              : {}),
          }
        : {}

      const filterParams = {
        lender: selectedLender,
        chainId,
        marketUidIn: debtPool.marketUid,
        marketUidOut: collateralPool.marketUid,
        ...payParams,
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
      setLoopRange(result.success && result.data?.length ? result.data[0] : null)
      setLoopRangeLoading(false)
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
    selectedPayCurrency?.address,
    debouncedPayAmount,
  ])

  // Max amounts
  const debtPos = debtPool ? userPositions.get(debtPool.marketUid) : null
  const maxBorrowableStr = debtPos ? String(debtPos.borrowable) : '0'

  // Pay wallet balance + overMax
  const payWalletBalance = selectedPayCurrency
    ? (walletBalances.get(selectedPayCurrency.address.toLowerCase()) ?? null)
    : null
  const payWalletStr = payWalletBalance?.balance ?? '0'
  const payOverMax = parseAmount(payWalletStr) > 0 && parseAmount(payAmount) > parseAmount(payWalletStr) + 1e-9

  const handleFetchQuotes = () => {
    if (!collateralPool || !debtPool) return
    fetchQuotes(
      'Loop',
      {
        marketUidIn: debtPool.marketUid,
        marketUidOut: collateralPool.marketUid,
        debtAmount: parseUnits(debtAmount || '0', debtPool.asset.decimals).toString(),
        slippage: (parseFloat(slippage) || 0.3) * 100,
        borrowMode: LendingMode.VARIABLE,
        usePendleMintRedeem: false,
        ...(selectedPayCurrency ? { payAsset: selectedPayCurrency.address } : {}),
        ...(selectedPayCurrency && payAmount
          ? { payAmount: parseUnits(payAmount, selectedPayCurrency.decimals).toString() }
          : {}),
        ...(accountId ? { accountId } : {}),
      },
      account,
      activeSubAccount ? buildSimulationBody(activeSubAccount) : undefined
    )
  }

  const allowCreateAccount = !!selectedPayCurrency && !!payAmount

  const canFetch = !!collateralPool && !!debtPool && !!debtAmount

  if (txSuccess) {
    return <TradingTransactionSuccess operation={txSuccess.operation} hash={txSuccess.hash} onDismiss={dismissSuccess} />
  }

  return (
    <div className="space-y-3">
      {/* Sub-account */}
      {(subAccounts.length > 0 || allowCreateAccount || lenderSupportsSubAccounts(selectedLender)) && (
        <SubAccountSelector
          subAccounts={subAccounts}
          selectedAccountId={accountId ?? null}
          onChange={onAccountIdChange}
          allowCreate={allowCreateAccount || (subAccounts.length === 0 && lenderSupportsSubAccounts(selectedLender))}
          chainId={chainId}
          lender={selectedLender}
          account={account}
        />
      )}

      {/* Collateral pool (output — no amount, determined by quote) */}
      <div className="rounded-lg p-2 bg-base-200/30">
        <PoolSelectorDropdown
          pools={collateralPools}
          value={collateralPool}
          onChange={setCollateralPool}
          userPositions={userPositions}
          label="Collateral (Deposit Into)"
          positionType="deposits"
          preferredUids={preferredCollateralUids}
        />
      </div>

      {/* Debt pool + Debt amount + Loop range */}
      <div className="rounded-lg p-2 ring-1 ring-primary bg-primary/5">
        <PoolSelectorDropdown
          pools={borrowablePools}
          value={debtPool}
          onChange={setDebtPool}
          userPositions={userPositions}
          label="Debt (Borrow From)"
          positionType="debt"
          preferredUids={preferredBorrowableUids}
        />
        <div className="form-control mt-1.5">
          <div className="flex items-center justify-between mb-0.5">
            <label className="label-text text-xs">Debt Amount</label>
            <AmountQuickButtons maxAmount={maxBorrowableStr} onSelect={setDebtAmount} />
          </div>
          <input
            type="text"
            inputMode="decimal"
            className="input input-bordered input-sm w-full"
            placeholder="0.0"
            value={debtAmount}
            onChange={(e) => {
              const v = sanitizeAmountInput(e.target.value)
              if (v === null) return
              setDebtAmount(v)
              reset()
            }}
          />
          {debtPos && Number(debtPos.borrowable) > 0 && (
            <span className="text-[10px] text-base-content/50 mt-0.5">
              Borrowable: {Number(debtPos.borrowable).toFixed(4)}
            </span>
          )}
        </div>

        {/* Loop range info */}
        {collateralPool && debtPool && (
          <div className="mt-1.5">
            <LoopRangeInfo
              loopRange={loopRange}
              loading={loopRangeLoading}
              debtSymbol={debtPool.asset.symbol}
              onSetMax={(amount) => {
                setDebtAmount(String(amount))
                reset()
              }}
            />
          </div>
        )}
      </div>

      {/* Pay currency + Pay amount */}
      <div className="rounded-lg p-2 bg-base-200/30">
        <div className="form-control">
          <label className="label-text text-xs mb-1">Pay With (Margin)</label>
          {payCurrencies.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {payCurrencies.map((c) => {
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
                    onClick={() => {
                      setPayCurrencyAddress(c.address)
                      setPayAmount('')
                    }}
                  >
                    <img
                      src={c.logoURI}
                      width={16}
                      height={16}
                      alt={c.symbol}
                      className="rounded-full object-contain w-4 h-4 token-logo"
                    />
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
        {selectedPayCurrency && (
          <div className="form-control mt-1.5">
            {payWalletBalance && (
              <div className="text-xs flex justify-between px-1 mb-1">
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
                <span
                  className={`font-medium ${parseAmount(payWalletStr) === 0 ? 'text-base-content/40' : ''}`}
                >
                  {formatTokenAmount(payWalletBalance.balance)} {selectedPayCurrency.symbol} ($
                  {formatUsd(payWalletBalance.balanceUSD)})
                </span>
              </div>
            )}
            <div className="flex items-center justify-between mb-0.5">
              <label className="label-text text-xs">Pay Amount</label>
              {payWalletBalance ? (
                <AmountQuickButtons maxAmount={payWalletStr} onSelect={setPayAmount} />
              ) : null}
            </div>
            <input
              type="text"
              inputMode="decimal"
              className="input input-bordered input-sm w-full"
              placeholder="0.0"
              value={payAmount}
              onChange={(e) => {
                const v = sanitizeAmountInput(e.target.value)
                if (v === null) return
                setPayAmount(v)
                reset()
              }}
            />
            {payOverMax && (
              <div className="text-[10px] text-error mt-0.5">
                Exceeds wallet balance ({formatTokenAmount(payWalletStr)}).
              </div>
            )}
          </div>
        )}
      </div>

      {/* Slippage */}
      <SlippageInput value={slippage} onChange={setSlippage} />

      {/* Fetch quotes */}
      <button
        type="button"
        className="btn btn-primary btn-sm w-full"
        disabled={!canFetch || loading || payOverMax}
        onClick={handleFetchQuotes}
      >
        {loading ? 'Fetching quotes...' : 'Get Loop Quotes'}
      </button>

      {/* Error */}
      {error && <ErrorDisplay error={error} />}

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

      {/* Permissions, transactions, and execute */}
      {selectedIndex !== null && !payOverMax && (
        <div className="space-y-1.5">
          {permissions.map((tx, i) => (
            <button
              key={`perm-${i}`}
              type="button"
              className="btn btn-outline btn-sm w-full h-auto min-h-8 py-1 whitespace-normal text-xs"
              title={tx.description || 'Approve'}
              onClick={() => executeNextPermission()}
            >
              {tx.description || 'Approve'}
            </button>
          ))}
          {transactions.map((tx, i) => (
            <button
              key={`tx-${i}`}
              type="button"
              className="btn btn-outline btn-sm w-full h-auto min-h-8 py-1 whitespace-normal text-xs"
              title={tx.description || 'Execute Setup Transaction'}
              onClick={() => executeNextTransaction()}
            >
              {tx.description || 'Execute Setup Transaction'}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-success btn-sm w-full"
            disabled={executingQuote}
            onClick={() => executeQuote('Loop')}
          >
            {executingQuote ? <span className="loading loading-spinner loading-xs" /> : 'Execute Loop'}
          </button>
        </div>
      )}
    </div>
  )
}
