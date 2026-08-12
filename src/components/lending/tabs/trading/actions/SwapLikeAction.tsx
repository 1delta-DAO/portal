import React, { useMemo, useState, useEffect } from 'react'
import { LendingMode } from '../../../../../lib/lib-utils'
import { parseUnits } from 'viem'
import type { PoolDataItem } from '../../../../../sdk/lending-helper/marketTypes'
import type { TradingActionProps, SelectedPool } from '../types'
import type { UserSubAccount } from '../../../../../sdk/lending-helper/userPositionTypes'
import { PoolSelectorDropdown } from '../PoolSelectorDropdown'
import { SlippageInput } from '../SlippageInput'
import { QuoteCard } from '../QuoteCard'
import { AmountQuickButtons } from '../../../actions/AmountQuickButtons'
import { formatTokenForInput, formatUsd, sanitizeAmountInput } from '../../../actions/format'
import { ErrorDisplay } from '../ErrorDisplay'
import { useTradingQuotes, buildSimulationBody } from '../useTradingQuotes'
import { TradingExecuteBlock } from '../TradingExecuteBlock'
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

/**
 * Everything that differs between a collateral swap and a debt swap.
 *
 * The two operations are the same form: pick two markets on the SAME side of
 * the book, type an amount into one of them, quote, execute. They were two
 * near-identical 460-line files whose only real differences are captured here —
 * so a fix to the quote flow now lands on both, and a new same-side swap is a
 * config object rather than a third copy.
 */
export interface SwapLikeConfig {
  /** Operation key sent to the quote endpoint and shown on the quote cards. */
  operation: 'ColSwap' | 'DebtSwap'
  /** Range endpoint's operation discriminator. */
  rangeOperation: 'collateral-swap' | 'debt-swap'
  /** Which side of the book both slots are drawn from. */
  side: 'collateral' | 'borrowable'
  /** Role tag on the quote card's market chips. */
  role: 'collateral' | 'debt'
  /** `positionType` the pool dropdown shows next to each market. */
  positionType: 'deposits' | 'debt'
  /** Interest-rate mode both legs are built with. */
  lendingMode: LendingMode

  /**
   * Which field starts as the exact one.
   *
   * Collateral swap leads with the withdraw (input) leg — you know how much
   * collateral you want to move. Debt swap leads with the repay (output) leg —
   * you know how much debt you want gone.
   */
  exactFieldDefault: 'input' | 'output'
  /**
   * Which field carries the max-amount hint and quick buttons. Always the same
   * field as {@link exactFieldDefault}: the range endpoint bounds that leg.
   */
  maxField: 'input' | 'output'
  /**
   * Which side of the range response bounds {@link maxField} — `amountInStr`
   * for the withdraw leg, `amountOutStr` for the repay leg.
   */
  maxFrom: 'amountInStr' | 'amountOutStr'
  /**
   * Whether an "exact max" click should send `isAll: true`.
   *
   * Only the collateral swap does. A debt swap sized to the full repay amount
   * still goes through as an exact amount, because the flash-loan leg is
   * bounded by the debt rather than by a balance the server would re-read.
   */
  supportsIsAll: boolean

  labels: {
    /** Dropdown label for the first (input) slot. */
    in: string
    /** Dropdown label for the second (output) slot. */
    out: string
    /** Primary button, e.g. "Get Collateral Swap Quotes". */
    fetchQuotes: string
    /** Execute button, e.g. "Execute Collateral Swap". */
    execute: string
    /** Rate-impact row label for the input market. */
    rateImpactIn: string
    /** Rate-impact row label for the output market. */
    rateImpactOut: string
  }
}

/** Reward APR to show on a market chip — deposit-side or borrow-side. */
function rewardAprFor(pool: PoolDataItem, role: SwapLikeConfig['role']): number {
  return role === 'collateral' ? pool.depositRewardApr : pool.borrowRewardApr
}

/**
 * Shared implementation of the two same-side swap forms. Behaviour is driven
 * entirely by {@link SwapLikeConfig}; see `ColSwapAction` and `DebtSwapAction`
 * for the two configurations.
 */
export const SwapLikeAction: React.FC<TradingActionProps & { config: SwapLikeConfig }> = ({
  config,
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
  const isCollateral = config.side === 'collateral'
  const pools = isCollateral ? collateralPools : borrowablePools
  const preferredUids = isCollateral ? preferredCollateralUids : preferredBorrowableUids

  const [inPool, setInPool] = useState<PoolDataItem | null>(null)
  const [outPool, setOutPool] = useState<PoolDataItem | null>(null)

  const [inputAmount, setInputAmount] = useState('')
  const [outputAmount, setOutputAmount] = useState('')
  const [activeField, setActiveField] = useState<'input' | 'output'>(config.exactFieldDefault)
  const [isAll, setIsAll] = useState(false)
  const [slippage, setSlippage] = useState('0.3')

  const tradingQuotes = useTradingQuotes({ chainId, account })
  const {
    quotes,
    rateImpact,
    simulation,
    selectedIndex,
    loading,
    txSuccess,
    error,
    fetchQuotes,
    selectQuote,
    dismissSuccess,
    reset,
  } = tradingQuotes

  // Notify parent
  useEffect(() => {
    const selections: SelectedPool[] = []
    if (inPool) selections.push({ pool: inPool, role: 'input', side: config.side })
    if (outPool) selections.push({ pool: outPool, role: 'output', side: config.side })
    onPoolSelectionChange(selections)
  }, [inPool, outPool, onPoolSelectionChange, config.side])

  // Apply by-config row clicks. Both slots are on the same side, so the side
  // alone doesn't disambiguate; use a fuzzy rule: fill the empty slot first,
  // otherwise replace the input (more common user intent — keeping the output
  // and trying alternative source assets).
  useEffect(() => {
    if (!pendingMarketClick) return
    // Rows from the other side of the book aren't actionable here — drop them.
    if (pendingMarketClick.side !== config.side) {
      consumeMarketClick?.()
      return
    }
    const pool = pendingMarketClick.pool
    if (!inPool) setInPool(pool)
    else if (!outPool) setOutPool(pool)
    else setInPool(pool)
    consumeMarketClick?.()
  }, [pendingMarketClick, consumeMarketClick, inPool, outPool, config.side])

  // Clear stale quotes when either side of the swap changes.
  useEffect(() => {
    reset()
  }, [inPool?.marketUid, outPool?.marketUid])

  // Swap range (flash-loan aware max)
  const [swapRange, setSwapRange] = useState<LoopRangeEntry | null>(null)
  const [swapRangeLoading, setSwapRangeLoading] = useState(false)

  const activeSubAccount = useMemo<UserSubAccount | null>(
    () => subAccounts.find((s) => s.accountId === accountId) ?? null,
    [subAccounts, accountId]
  )

  useEffect(() => {
    if (!inPool || !outPool || !selectedLender || !chainId) {
      setSwapRange(null)
      return
    }

    let cancelled = false
    setSwapRangeLoading(true)

    const run = async () => {
      const filterParams = {
        lender: selectedLender,
        chainId,
        marketUidIn: inPool.marketUid,
        marketUidOut: outPool.marketUid,
        operation: config.rangeOperation,
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
    inPool?.marketUid,
    outPool?.marketUid,
    selectedLender,
    chainId,
    account,
    activeSubAccount,
    config.rangeOperation,
  ])

  const maxSwapStr = swapRange?.[config.maxFrom] ?? '0'
  /** The market the max applies to — the one under {@link SwapLikeConfig.maxField}. */
  const maxPool = config.maxField === 'input' ? inPool : outPool

  const tradeType = activeField === 'input' ? 0 : 1
  const exactAmount = activeField === 'input' ? inputAmount : outputAmount
  const exactPool = activeField === 'input' ? inPool : outPool

  // Quote-derived amounts for the inactive field
  const selectedQuote = selectedIndex !== null ? quotes[selectedIndex] : null
  const quotedInputAmount = selectedQuote ? formatTokenForInput(selectedQuote.tradeAmountIn) : ''
  const quotedOutputAmount = selectedQuote ? formatTokenForInput(selectedQuote.tradeAmountOut) : ''

  const handleFetchQuotes = () => {
    if (!inPool || !outPool || !exactPool) return
    fetchQuotes(
      config.operation,
      {
        marketUidIn: inPool.marketUid,
        marketUidOut: outPool.marketUid,
        amount: parseUnits(exactAmount || '0', exactPool.asset.decimals).toString(),
        slippage: (parseFloat(slippage) || 0.3) * 100,
        irModeIn: config.lendingMode,
        irModeOut: config.lendingMode,
        tradeType,
        ...(config.supportsIsAll && activeField === config.maxField && isAll
          ? { isAll: true }
          : {}),
        usePendleMintRedeem: false,
        ...(accountId ? { accountId } : {}),
      },
      account,
      activeSubAccount ? buildSimulationBody(activeSubAccount) : undefined
    )
  }

  const canFetch = !!inPool && !!outPool && !!exactAmount

  if (txSuccess) {
    return (
      <TradingTransactionSuccess
        operation={txSuccess.operation}
        hash={txSuccess.hash}
        onDismiss={dismissSuccess}
      />
    )
  }

  /** One of the two market slots. Both render identically bar their labels. */
  const renderSlot = (field: 'input' | 'output') => {
    const isActive = activeField === field
    const pool = field === 'input' ? inPool : outPool
    const setPool = field === 'input' ? setInPool : setOutPool
    const amount = field === 'input' ? inputAmount : outputAmount
    const setAmount = field === 'input' ? setInputAmount : setOutputAmount
    const quotedAmount = field === 'input' ? quotedInputAmount : quotedOutputAmount
    const showsMax = config.maxField === field && isActive

    return (
      <div
        className={`rounded-lg p-2 transition-colors ${isActive ? 'ring-1 ring-primary bg-primary/5' : 'bg-base-200/30'}`}
      >
        <PoolSelectorDropdown
          pools={pools}
          value={pool}
          onChange={setPool}
          userPositions={userPositions}
          label={field === 'input' ? config.labels.in : config.labels.out}
          positionType={config.positionType}
          preferredUids={preferredUids}
        />
        <div className="form-control mt-1.5">
          <div className="flex items-center justify-between mb-0.5">
            <label className="label-text text-xs">
              Amount
              {isActive && (
                <span className="text-primary ml-1 text-[10px] font-medium">(exact)</span>
              )}
            </label>
            {showsMax && (
              <AmountQuickButtons
                maxAmount={maxSwapStr}
                onSelect={(v) => {
                  setAmount(v)
                  setIsAll(false)
                  reset()
                }}
                onMax={() => {
                  setAmount(maxSwapStr)
                  setIsAll(true)
                  reset()
                }}
                decimals={pool?.asset?.decimals}
              />
            )}
          </div>
          <input
            type="text"
            inputMode="decimal"
            className={`input input-bordered input-sm w-full ${!isActive ? 'opacity-60' : ''}`}
            placeholder="0.0"
            value={isActive ? amount : quotedAmount}
            readOnly={!isActive}
            onFocus={() => {
              if (!isActive) {
                setActiveField(field)
                setAmount(quotedAmount)
                setIsAll(false)
                reset()
              }
            }}
            onChange={(e) => {
              const v = sanitizeAmountInput(e.target.value)
              if (v === null) return
              setAmount(v)
              setIsAll(false)
              reset()
            }}
          />
          {showsMax && swapRangeLoading && (
            <span className="text-[10px] text-base-content/50 mt-0.5 flex items-center gap-1">
              <span className="loading loading-spinner loading-xs" /> Loading max...
            </span>
          )}
          {showsMax && !swapRangeLoading && parseFloat(maxSwapStr) > 0 && (
            <span className="text-[10px] text-base-content/50 mt-0.5">
              Max swap: {formatTokenForInput(maxSwapStr)} {maxPool?.asset.symbol}
              {swapRange?.amountUSD ? ` ($${formatUsd(swapRange.amountUSD)})` : ''}
            </span>
          )}
        </div>
      </div>
    )
  }

  /** Market chip metadata for the quote cards. */
  const marketRoles = {
    ...(inPool
      ? {
          [inPool.marketUid]: {
            role: config.role,
            symbol: inPool.asset.symbol,
            assetAddress: inPool.asset.address,
            intrinsicYield: inPool.intrinsicYield,
            rewardApr: rewardAprFor(inPool, config.role),
            depositRatePct: inPool.depositRate,
            borrowRatePct: inPool.variableBorrowRate,
          },
        }
      : {}),
    ...(outPool
      ? {
          [outPool.marketUid]: {
            role: config.role,
            symbol: outPool.asset.symbol,
            assetAddress: outPool.asset.address,
            intrinsicYield: outPool.intrinsicYield,
            rewardApr: rewardAprFor(outPool, config.role),
            depositRatePct: outPool.depositRate,
            borrowRatePct: outPool.variableBorrowRate,
          },
        }
      : {}),
  }

  const marketYields = {
    ...(inPool
      ? {
          [inPool.marketUid]: {
            intrinsicYield: inPool.intrinsicYield,
            depositRewardApr: inPool.depositRewardApr,
            borrowRewardApr: inPool.borrowRewardApr,
          },
        }
      : {}),
    ...(outPool
      ? {
          [outPool.marketUid]: {
            intrinsicYield: outPool.intrinsicYield,
            depositRewardApr: outPool.depositRewardApr,
            borrowRewardApr: outPool.borrowRewardApr,
          },
        }
      : {}),
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

      {renderSlot('input')}
      {renderSlot('output')}

      <SlippageInput value={slippage} onChange={setSlippage} />

      <button
        type="button"
        className="btn btn-primary btn-sm w-full"
        disabled={!canFetch || loading}
        onClick={handleFetchQuotes}
      >
        {loading ? 'Fetching quotes...' : config.labels.fetchQuotes}
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
                // Index is the identity here: `alternatives[i]` is positionally
                // matched to `quotes[i]`, and the array is replaced wholesale.
                key={i}
                quote={q}
                index={i}
                isSelected={selectedIndex === i}
                onClick={() => selectQuote(i)}
                operation={config.operation}
                inSymbol={inPool?.asset.symbol}
                outSymbol={outPool?.asset.symbol}
                bestPriceImpactUSD={bestImpact}
                marketRoles={marketRoles}
              />
            ))
          })()}
        </div>
      )}

      {/* Rate impact */}
      <RateImpactIndicator
        rateImpact={
          (selectedIndex !== null ? quotes[selectedIndex]?.rateImpact : undefined) ?? rateImpact
        }
        marketLabels={{
          ...(inPool
            ? { [inPool.marketUid]: `${inPool.asset.symbol} ${config.labels.rateImpactIn}` }
            : {}),
          ...(outPool
            ? { [outPool.marketUid]: `${outPool.asset.symbol} ${config.labels.rateImpactOut}` }
            : {}),
        }}
        marketYields={marketYields}
      />

      {/* Position impact (health factor / borrow capacity) */}
      <SimulationIndicator simulation={simulation} />

      {selectedIndex !== null && (
        <TradingExecuteBlock
          quotes={tradingQuotes}
          operation={config.operation}
          executeLabel={config.labels.execute}
        />
      )}
    </div>
  )
}
