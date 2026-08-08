import React, { useMemo, useState, useEffect } from 'react'
import { isWNative, LendingMode, type RawCurrency } from '../../../../../lib/lib-utils'
import { parseUnits, zeroAddress } from 'viem'
import { useTokenLists } from '../../../../../hooks/useTokenLists'
import type { PoolDataItem } from '../../../../../hooks/lending/usePoolData'
import type { TradingActionProps, SelectedPool } from '../types'
import { PoolSelectorDropdown } from '../PoolSelectorDropdown'
import { SlippageInput } from '../SlippageInput'
import { QuoteCard } from '../QuoteCard'
import { AmountQuickButtons } from '../../../actions/AmountQuickButtons'
import {
  formatTokenAmount,
  formatUsd,
  parseAmount,
  sanitizeAmountInput,
} from '../../../actions/format'
import { ErrorDisplay } from '../ErrorDisplay'
import { useTradingQuotes, buildSimulationBody } from '../useTradingQuotes'
import { TradingExecuteBlock } from '../TradingExecuteBlock'
import { TradingTransactionSuccess } from '../TradingTransactionSuccess'
import { RateImpactIndicator } from '../../../actions/RateImpactIndicator'
import { Logo } from '../../../../common/Logo'
import { SimulationIndicator } from '../../../actions/SimulationIndicator'
import { SubAccountSelector } from '../../../actions/SubAccountSelector'
import { lenderSupportsSubAccounts, fixedTermDetails } from '../../../actions/helpers'
import { FixedTermDetailsRows } from '../../../shared/FixedTermDetails'
import { MidnightOrderBook } from '../../../shared/MidnightOrderBook'
import { TermsSummary, type BandSetterState } from '../../../terms'
import { useTermSheet } from '../../../../../hooks/lending/useTermSheet'
import {
  fetchLoopRangeWithSimulation,
  fetchLoopRange,
  type LoopRangeEntry,
} from '../../../../../sdk/lending-helper/fetchLoopRange'

function LoopRangeInfo({
  loopRange,
  loading,
  debtSymbol,
}: {
  loopRange: LoopRangeEntry | null
  loading: boolean
  debtSymbol: string
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
      <div className="text-base-content/60 font-medium">Max Loop Size</div>

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
  initialSelection,
  pendingMarketClick,
  consumeMarketClick,
}) => {
  const { data: chainTokens } = useTokenLists(chainId)

  // Pool selections — seeded once from `initialSelection` if a deep link
  // (e.g. the Optimizer's "Loop this" button) provided one. The parent
  // strips the URL params after passing the resolved pools through, so this
  // initialiser only fires on mount.
  const [collateralPool, setCollateralPool] = useState<PoolDataItem | null>(
    initialSelection?.collateralPool ?? null
  )
  const [debtPool, setDebtPool] = useState<PoolDataItem | null>(initialSelection?.debtPool ?? null)

  // Amounts — pre-fill the pay amount when the optimizer hands one through.
  const [debtAmount, setDebtAmount] = useState('')
  /**
   * LlamaLend band count. Undefined until the user touches it, so the API
   * applies the market default rather than us guessing one — and `bands` is
   * only meaningful on markets whose term sheet advertises the parameter.
   */
  const [bands, setBands] = useState<BandSetterState | undefined>(undefined)

  // A loop signs the user up to BOTH sides at once — it supplies into the
  // collateral market and borrows out of the debt market — so one sheet cannot
  // describe it. Two sheets, each on its own side.
  //
  // This matters more here than on the single-sided panels, because the terms
  // that bite hardest on a loop are exit terms: Curvance stamps a 20-minute
  // hold on POSTING COLLATERAL and on BORROWING during which repayment and
  // redemption both revert, so a freshly opened loop cannot be closed or
  // deleveraged at all for that window — and its $10 minimum debt gates the
  // partial repay a deleverage performs, not just the open.
  //
  // Rows carry a DIGEST (the API default); upgrade each to the full sheet so
  // exit terms, liquidation params and fees are actually present.
  const { sheet: collateralTermSheet } = useTermSheet({
    marketUid: collateralPool?.marketUid,
    chainId,
    fallback: collateralPool?.termSheet,
  })
  const { sheet: debtTermSheet } = useTermSheet({
    marketUid: debtPool?.marketUid,
    chainId,
    fallback: debtPool?.termSheet,
  })
  const [payAmount, setPayAmount] = useState(
    initialSelection?.amount != null ? String(initialSelection.amount) : ''
  )

  // Pay currency
  const [payCurrencyAddress, setPayCurrencyAddress] = useState<string | null>(null)

  // Options
  const [slippage, setSlippage] = useState('0.3')

  // Quotes
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

  // Reset pay currency + clear stale quotes when the user picks a different
  // collateral or debt pool — old quotes reference the previous pair and are
  // no longer actionable.
  useEffect(() => {
    setPayCurrencyAddress(null)
    setPayAmount('')
    reset()
  }, [collateralPool?.marketUid, debtPool?.marketUid])

  // Notify parent of pool selections for table highlighting
  useEffect(() => {
    const selections: SelectedPool[] = []
    if (collateralPool)
      selections.push({ pool: collateralPool, role: 'output', side: 'collateral' })
    if (debtPool) selections.push({ pool: debtPool, role: 'input', side: 'borrowable' })
    onPoolSelectionChange(selections)
  }, [collateralPool, debtPool, onPoolSelectionChange])

  // Apply by-config row clicks: collateral row → collateralPool slot,
  // borrowable row → debtPool slot. Side is unambiguous for Loop.
  useEffect(() => {
    if (!pendingMarketClick) return
    if (pendingMarketClick.side === 'collateral') {
      setCollateralPool(pendingMarketClick.pool)
    } else {
      setDebtPool(pendingMarketClick.pool)
    }
    consumeMarketClick?.()
  }, [pendingMarketClick, consumeMarketClick])

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
      setLoopRangeLoading(false)
      return
    }

    let cancelled = false
    setLoopRangeLoading(true)

    const run = async () => {
      try {
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

        if (cancelled) return
        setLoopRange(result?.success && result.data?.length ? result.data[0] : null)
      } catch {
        if (!cancelled) setLoopRange(null)
      } finally {
        // Always clear the spinner unless a newer fetch superseded this one.
        // Covers the no-account / null-result and thrown-error paths that used
        // to leave "Loading max loop size…" stuck forever.
        if (!cancelled) setLoopRangeLoading(false)
      }
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

  // Brokered (Lista) debt markets borrow at a fixed term — pick one from the
  // rate card; variable borrow isn't offered through the app. (BROKERED_MARKETS.md §6)
  const debtTerms = debtPool?.terms ?? []
  const isDebtBrokered =
    !!debtPool && (debtPool.variableBorrowDisabled === true || debtTerms.length > 0)
  const [selectedTermId, setSelectedTermId] = useState<number | null>(null)
  useEffect(() => {
    setSelectedTermId(debtTerms.length > 0 ? debtTerms[0].termId : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debtPool?.marketUid, debtTerms.length])
  const selectedTerm = debtTerms.find((t) => t.termId === selectedTermId) ?? null

  // Morpho Midnight debt markets carry offer details Lista lacks (fixed calendar
  // maturity, fillable depth, continuous + settlement fees) — surface them under
  // the term picker, same as the plain BorrowAction.
  // Canonical fixed-term details for the debt market (Lista or Midnight).
  const debtFtDetails = fixedTermDetails(debtPool)
  // Order-book (Midnight) debt: the borrow leg is filled by TAKING bid offers.
  // The loop only ever takes (no maker offers here), so we surface the same
  // two-sided book as the plain Borrow tab — tap-to-fill, multi-select — sized
  // straight into the debt Amount, but WITHOUT the Make side.
  const debtIsOrderBook = debtFtDetails?.provider?.kind === 'orderbook'

  // Max amounts
  const debtPos = debtPool ? userPositions.get(debtPool.marketUid) : null

  // Pay wallet balance + overMax
  const payWalletBalance = selectedPayCurrency
    ? (walletBalances.get(selectedPayCurrency.address.toLowerCase()) ?? null)
    : null
  const payWalletStr = payWalletBalance?.balance ?? '0'
  const payOverMax =
    parseAmount(payWalletStr) > 0 && parseAmount(payAmount) > parseAmount(payWalletStr) + 1e-9

  // USD value of the paid-in margin — used to correct the loop price impact so
  // the margin isn't booked as a swap penalty. Prefer the wallet balance's
  // implied unit price; fall back to the matching pool's oracle price. Left at
  // 0 when unknown so no (possibly wrong) correction is applied.
  const payAmountUSD = useMemo(() => {
    const amt = parseAmount(payAmount)
    if (!selectedPayCurrency || !(amt > 0)) return 0
    const balNum = parseAmount(payWalletBalance?.balance ?? '0')
    const balUSD = payWalletBalance?.balanceUSD
    if (balUSD != null && balNum > 0) {
      const price = balUSD / balNum
      if (Number.isFinite(price) && price > 0) return price * amt
    }
    const addr = selectedPayCurrency.address.toLowerCase()
    const match = [collateralPool, debtPool].find((p) => p?.asset?.address?.toLowerCase() === addr)
    if (match?.oraclePriceUSD != null) return match.oraclePriceUSD * amt
    return 0
  }, [selectedPayCurrency, payAmount, payWalletBalance, collateralPool, debtPool])

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
        // Brokered debt: open the borrow at the chosen fixed term. (Docs §6)
        ...(isDebtBrokered && selectedTermId != null ? { termId: selectedTermId } : {}),
        usePendleMintRedeem: false,
        // Only sent once the user has actually chosen, and only when valid —
        // an out-of-range N is refused by the Controller, so it is better to
        // omit it and take the market default than to send a rejected one.
        ...(bands?.dirty && bands.valid ? { bands: bands.bands } : {}),
        ...(selectedPayCurrency ? { payAsset: selectedPayCurrency.address } : {}),
        ...(selectedPayCurrency && payAmount
          ? { payAmount: parseUnits(payAmount, selectedPayCurrency.decimals).toString() }
          : {}),
        ...(accountId ? { accountId } : {}),
      },
      account,
      activeSubAccount ? buildSimulationBody(activeSubAccount) : undefined,
      payAmountUSD
    )
  }

  const allowCreateAccount = !!selectedPayCurrency && !!payAmount

  const canFetch =
    !!collateralPool && !!debtPool && !!debtAmount && (!isDebtBrokered || selectedTerm != null)

  if (txSuccess) {
    return (
      <TradingTransactionSuccess
        operation={txSuccess.operation}
        hash={txSuccess.hash}
        onDismiss={dismissSuccess}
      />
    )
  }

  return (
    <div className="space-y-3">
      {/* Sub-account */}
      {(subAccounts.length > 0 ||
        allowCreateAccount ||
        lenderSupportsSubAccounts(selectedLender)) && (
        <SubAccountSelector
          subAccounts={subAccounts}
          selectedAccountId={accountId ?? null}
          onChange={onAccountIdChange}
          allowCreate={allowCreateAccount || lenderSupportsSubAccounts(selectedLender)}
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

        {/* Fixed-term selector — brokered (Lista) debt markets only. */}
        {isDebtBrokered && (
          <div className="mt-1.5 rounded-lg border border-warning/30 bg-warning/5 p-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center rounded-md bg-warning/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide leading-none text-warning whitespace-nowrap">
                Fixed-term
              </span>
              <span className="text-[10px] text-base-content/60 leading-tight">
                Variable borrow unavailable — pick a term
              </span>
            </div>
            {debtTerms.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {debtTerms.map((t) => {
                  const active = t.termId === selectedTermId
                  return (
                    <button
                      key={t.termId}
                      type="button"
                      onClick={() => {
                        setSelectedTermId(t.termId)
                        reset()
                      }}
                      className={`flex flex-col items-start px-2.5 py-1 rounded-lg border text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-primary bg-primary/10 ring-1 ring-primary'
                          : 'border-base-300 bg-base-200/50 hover:bg-base-200'
                      }`}
                    >
                      <span
                        className="text-xs font-semibold"
                        title={`${t.durationDays.toFixed(2)} days to maturity`}
                      >
                        {Math.max(1, Math.round(t.durationDays))}-day
                      </span>
                      <span className="text-[10px] font-mono tabular-nums text-warning">
                        {t.apr.toFixed(2)}%
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <span className="text-[10px] text-base-content/50">
                Fixed-term borrowing is currently unavailable for this market.
              </span>
            )}
            {/* Fixed-term details — maturity, market-level fees, and the
                early-repayment policy. Unified across Lista and Midnight. */}
            {debtFtDetails && (
              <div className="space-y-1.5 text-[10px] text-base-content/60">
                <FixedTermDetailsRows
                  details={debtFtDetails}
                  symbol={debtPool?.asset?.symbol}
                  lender={debtPool?.marketUid}
                  hideLadder={debtIsOrderBook}
                />
                {/* Order-book debt: TAKE-only two-sided book, multi-select into
                    the debt Amount (capped at the loop's max borrowable). No Make
                    side — loops can only take existing offers. */}
                {debtIsOrderBook && (
                  <MidnightOrderBook
                    chainId={debtPool?.marketUid?.split(':')[1]}
                    lender={debtPool?.marketUid?.split(':')[0]}
                    symbol={debtPool?.asset?.symbol}
                    fillSide="bids"
                    amountTokens={parseAmount(debtAmount)}
                    onSelectAmount={(tokens) => {
                      const cap = parseAmount(loopRange?.amountInStr ?? '0')
                      setDebtAmount(String(cap > 0 ? Math.min(tokens, cap) : tokens))
                      reset()
                    }}
                  />
                )}
              </div>
            )}
          </div>
        )}

        <div className="form-control mt-1.5">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <label className="label-text text-xs whitespace-nowrap shrink-0">Amount</label>
            <AmountQuickButtons
              maxAmount={loopRange?.amountInStr ?? '0'}
              onSelect={(v) => {
                setDebtAmount(v)
                reset()
              }}
              decimals={debtPool?.asset?.decimals}
              presets={[
                { label: '25%', fraction: 0.25 },
                { label: '50%', fraction: 0.5 },
                { label: '75%', fraction: 0.75 },
                { label: '90%', fraction: 0.9 },
                { label: 'Max', fraction: 1 },
              ]}
            />
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
                      reset()
                    }}
                  >
                    <Logo
                      src={c.logoURI}
                      alt={c.symbol}
                      fallbackText={c.symbol}
                      className="rounded-full object-contain w-4 h-4 token-logo"
                    />
                    <span className="font-medium">{c.symbol}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <span className="text-xs text-base-content/50">
              Select collateral & debt pools first
            </span>
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
                    <button
                      type="button"
                      className="text-base-content/30 hover:text-base-content/60 transition-colors"
                      onClick={refetchBalances}
                      title="Refresh balance"
                    >
                      {isBalancesFetching ? (
                        <span className="loading loading-spinner w-2.5 h-2.5" />
                      ) : (
                        <svg
                          className="w-2.5 h-2.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 2v6h-6" />
                          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                          <path d="M3 22v-6h6" />
                          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                        </svg>
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
                <AmountQuickButtons
                  maxAmount={payWalletStr}
                  onSelect={setPayAmount}
                  decimals={selectedPayCurrency.decimals}
                />
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

      {/* Fetch quotes. The wallet-balance warning (`payOverMax`) is advisory and
          does NOT block quoting — the user can explore quotes and top up before
          executing; the on-chain send is the real guardrail. */}
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

      {/* Quotes */}
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
                operation="Loop"
                inSymbol={debtPool?.asset.symbol}
                outSymbol={collateralPool?.asset.symbol}
                bestPriceImpactUSD={bestImpact}
                marketRoles={{
                  ...(debtPool
                    ? {
                        [debtPool.marketUid]: {
                          role: 'debt' as const,
                          symbol: debtPool.asset.symbol,
                          assetAddress: debtPool.asset.address,
                          intrinsicYield: debtPool.intrinsicYield,
                          rewardApr: debtPool.borrowRewardApr,
                          // Brokered debt borrows at the selected fixed term's APR.
                          borrowRatePct: selectedTerm?.apr ?? debtPool.variableBorrowRate,
                          depositRatePct: debtPool.depositRate,
                        },
                      }
                    : {}),
                  ...(collateralPool
                    ? {
                        [collateralPool.marketUid]: {
                          role: 'collateral' as const,
                          symbol: collateralPool.asset.symbol,
                          assetAddress: collateralPool.asset.address,
                          intrinsicYield: collateralPool.intrinsicYield,
                          rewardApr: collateralPool.depositRewardApr,
                          depositRatePct: collateralPool.depositRate,
                          borrowRatePct: collateralPool.variableBorrowRate,
                        },
                      }
                    : {}),
                }}
              />
            ))
          })()}
        </div>
      )}

      {/* Rate impact — the selected quote's own projection when available */}
      <RateImpactIndicator
        rateImpact={
          (selectedIndex !== null ? quotes[selectedIndex]?.rateImpact : undefined) ?? rateImpact
        }
        marketLabels={{
          ...(collateralPool
            ? { [collateralPool.marketUid]: `${collateralPool.asset.symbol} (Collateral)` }
            : {}),
          ...(debtPool ? { [debtPool.marketUid]: `${debtPool.asset.symbol} (Debt)` } : {}),
        }}
        marketYields={{
          ...(collateralPool
            ? {
                [collateralPool.marketUid]: {
                  intrinsicYield: collateralPool.intrinsicYield,
                  depositRewardApr: collateralPool.depositRewardApr,
                  borrowRewardApr: collateralPool.borrowRewardApr,
                },
              }
            : {}),
          ...(debtPool
            ? {
                [debtPool.marketUid]: {
                  intrinsicYield: debtPool.intrinsicYield,
                  depositRewardApr: debtPool.depositRewardApr,
                  borrowRewardApr: debtPool.borrowRewardApr,
                },
              }
            : {}),
        }}
      />

      {/* Position impact (health factor / borrow capacity) */}
      <SimulationIndicator simulation={simulation} />

      {/* Both sides' terms. Collapsed by default so the panel stays compact;
          `TermsSummary` still surfaces critical findings when collapsed.

          Each block is LABELLED by ROLE and asset (via TermsSummary's `title` /
          `subtitle`) rather than by the default "Deposit terms" / "Borrow
          terms". Without that the two sheets are indistinguishable — both
          render as "Variable x% · …" and a reader cannot tell which side they
          are agreeing to, which is the one thing that matters when the same
          panel opens a position on both. */}
      {collateralTermSheet || debtTermSheet ? (
        <div className="space-y-1.5">
          {collateralTermSheet ? (
            <TermsSummary
              sheet={collateralTermSheet}
              side="supply"
              title="Collateral"
              titleTone="good"
              subtitle={`${collateralPool?.asset.symbol ?? ''} — what you supply and earn on`}
            />
          ) : null}
          {debtTermSheet ? (
            <TermsSummary
              sheet={debtTermSheet}
              side="borrow"
              title="Debt"
              titleTone="warn"
              subtitle={`${debtPool?.asset.symbol ?? ''} — what you borrow and pay on`}
              // The band count is a BORROW-side term: it sets how much can be
              // drawn against the collateral, and it is fixed at open.
              bandEdit={{ value: bands?.bands, onChange: setBands }}
            />
          ) : null}
        </div>
      ) : null}

      {/* Permissions, transactions, and execute. Shown once a quote is selected;
          the wallet-balance warning stays advisory (see the quotes button). */}
      {selectedIndex !== null && (
        <TradingExecuteBlock quotes={tradingQuotes} operation="Loop" executeLabel="Execute Loop" />
      )}
    </div>
  )
}
