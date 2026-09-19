import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { isWNative, LendingMode, type RawCurrency } from '../../../../../lib/lib-utils'
import { parseUnits, zeroAddress } from 'viem'
import { smartInfo } from '../../../../../sdk/lending-helper/fluidSmart'
import { useTokenLists } from '../../../../../hooks/useTokenLists'
import type { PoolDataItem } from '../../../../../sdk/lending-helper/marketTypes'
import type { TradingActionProps, SelectedPool } from '../types'
import { PoolSelectorDropdown } from '../PoolSelectorDropdown'
import { SlippageInput } from '../SlippageInput'
import { QuoteCard } from '../QuoteCard'
import { AmountQuickButtons } from '../../../actions/AmountQuickButtons'
import {
  compareAmountStrings,
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
import { AutoBalancedNotice } from '../../../shared/SmartVault'
import { TermsSummary, type BandSetterState } from '../../../terms'
import { BandSetterRow } from '../../../terms/BandSetterRow'
import { openLoanBandCount } from '../../../../../sdk/lending-helper/userPositionTypes'
import { borrowTerms, isBrokeredBorrow } from '../../../../../sdk/lending-helper/marketSides'
import { deriveMarginSources } from './marginSources'
import { isFullSheet } from '../../../terms/types'
import { useTermSheet } from '../../../../../hooks/lending/useTermSheet'
import { useLoopPayAssets } from '../../../../../hooks/lending/useLoopPayAssets'
import {
  fetchLoopRangeWithSimulation,
  fetchLoopRange,
  type LoopRangeEntry,
} from '../../../../../sdk/lending-helper/fetchLoopRange'
import { displaySymbol } from '../../../../../lib/lib-utils/wnative'

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

/**
 * Advisory banner for a margin amount the wallet cannot cover.
 *
 * Deliberately NOT a blocker: the user can still quote to see what the loop
 * would look like and top up before executing — the wallet transfer is the real
 * guardrail. But it has to be loud enough to be seen, because the failure it
 * predicts happens at signing time, after the user has already committed
 * attention to a quote.
 */
function InsufficientPayBalance({
  symbol: rawSymbol,
  balanceStr,
  shortfall,
}: {
  symbol?: string
  balanceStr: string
  shortfall: number
}) {
  const symbol = rawSymbol ?? 'token'
  return (
    <div className="rounded-lg border border-error/40 bg-error/10 px-2 py-1.5 text-[11px] text-error flex items-start gap-1.5">
      <svg
        className="w-3.5 h-3.5 shrink-0 mt-px"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
      <span>
        <span className="font-medium">Insufficient {symbol} balance.</span> You hold{' '}
        {formatTokenAmount(balanceStr)} {symbol} — {formatTokenAmount(shortfall)} {symbol} short.
        Quoting still works, but the transaction will fail unless you top up or lower the pay
        amount.
      </span>
    </div>
  )
}

/** `DOLOMITE` → `Dolomite`, for a toggle sitting next to the word "Wallet". */
function lenderLabel(lender: string): string {
  const word = lender.split('_')[0]
  return word.charAt(0) + word.slice(1).toLowerCase()
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

  /**
   * Where the margin comes from. `'wallet'` is the default and the only source
   * every lender supports; `'lender'` funds from an existing sub-account, which
   * on Dolomite makes the open a SINGLE transaction (the proxy can transfer
   * between the caller's own sub-accounts inside the leverage call, but cannot
   * reach the wallet at all). Deliberately an explicit choice, never inferred
   * from balances: silently spending in-protocol funds because the wallet is
   * short changes where the user's money comes from without them asking.
   */
  const [payFrom, setPayFrom] = useState<'wallet' | 'lender'>('wallet')
  const [marginSourceId, setMarginSourceId] = useState<string | null>(null)

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

  /**
   * Changing `N` RE-PRICES the loan — it moves the collateral factor, so a
   * quote fetched at the old value is sized against an LTV that no longer
   * applies. Drop any fetched quotes, exactly as the amount input does.
   */
  const handleBandsChange = useCallback(
    (next: BandSetterState) => {
      setBands((prev) => {
        if (prev && prev.bands === next.bands && prev.valid === next.valid) return prev
        if (prev && prev.bands !== next.bands) reset()
        return next
      })
    },
    [reset]
  )

  /**
   * Which assets may fund the margin — asked of the API, not derived here.
   *
   * `/v1/actions/loop/leverage/pay-assets` applies the per-lender rule the
   * build enforces (collateral only on Curvance / Fraxlend / Resupply / Twyne,
   * no native on LlamaLend, the debt asset only on Exactly, nothing on Flying
   * Tulip), so a chip is only ever offered for a margin the open can take.
   * Before this the panel offered collateral + debt + native everywhere and
   * the user found out from the build error.
   */
  const { data: payAssetsData } = useLoopPayAssets({
    marketUidIn: debtPool?.marketUid,
    marketUidOut: collateralPool?.marketUid,
  })

  // Pay currencies: the server's list once it has answered, with the local
  // collateral / debt / native derivation as the fallback while loading (or if
  // the call fails), so the chips never disappear on a hiccup.
  const payCurrencies = useMemo(() => {
    const local: RawCurrency[] = []
    if (collateralPool?.asset) {
      local.push(collateralPool.asset)
    }
    if (debtPool?.asset && debtPool.asset.address !== collateralPool?.asset?.address) {
      local.push(debtPool.asset)
    }
    // Add native token if wrapped native is in the list
    const hasWrappedNative = local.some((a) => isWNative(a))
    if (hasWrappedNative && chainTokens[zeroAddress]) {
      local.unshift(chainTokens[zeroAddress] as RawCurrency)
    }

    if (!payAssetsData) return local

    // The server rows carry token-list metadata; back-fill anything a
    // non-curated row lacks (decimals above all) from the pool's own currency,
    // which the row necessarily is — every accepted margin asset is one of the
    // two market assets or native.
    const known = new Map<string, RawCurrency>()
    for (const c of local) known.set(c.address.toLowerCase(), c)
    for (const c of Object.values(chainTokens) as RawCurrency[])
      if (c?.address && !known.has(c.address.toLowerCase())) known.set(c.address.toLowerCase(), c)
    return payAssetsData.payAssets.map((row) => {
      const base = known.get(row.address.toLowerCase())
      return { ...(base ?? {}), ...row, address: base?.address ?? row.address } as RawCurrency
    })
  }, [collateralPool, debtPool, chainTokens, payAssetsData])

  const selectedPayCurrency = payCurrencies.find((c) => c.address === payCurrencyAddress) ?? null

  /**
   * The market whose deposits ARE the pay asset inside the lender.
   *
   * Native is resolved to the wrapped market on purpose: there is no native
   * balance inside a lender — an "ETH" margin held in Dolomite is WETH — and
   * the API applies the same mapping (`isNativeAddress(payAsset) ? wrapped`),
   * so the two agree on which market gets transferred.
   */
  const payMarketUid = useMemo(() => {
    if (!selectedPayCurrency) return undefined
    const addr = selectedPayCurrency.address.toLowerCase()
    const isNative = addr === zeroAddress
    const match = [collateralPool, debtPool].find((pool) =>
      isNative
        ? !!pool?.asset && isWNative(pool.asset)
        : pool?.asset?.address?.toLowerCase() === addr
    )
    return match?.marketUid
  }, [selectedPayCurrency, collateralPool, debtPool])

  const marginSources = useMemo(
    () =>
      deriveMarginSources({
        subAccounts,
        tradeAccountId: accountId,
        marketUid: payMarketUid,
      }),
    [subAccounts, accountId, payMarketUid]
  )
  const canPayFromLender = marginSources.length > 0
  const activeMarginSource =
    marginSources.find((m) => m.accountId === marginSourceId) ?? marginSources[0] ?? null
  // `payFrom` alone is not enough to act on: the sources are derived from data
  // that reloads, so a stale `'lender'` must never survive them disappearing —
  // it would drop `marginFromAccountId` while still hiding the wallet balance.
  const payFromLender = payFrom === 'lender' && !!activeMarginSource

  // Fall back to the wallet whenever the chosen source stops existing (pool
  // change, pay-asset change, sub-account switch, user data reload).
  useEffect(() => {
    if (!canPayFromLender) {
      setPayFrom('wallet')
      setMarginSourceId(null)
    }
  }, [canPayFromLender])

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
  const debtTerms = borrowTerms(debtPool)
  const isDebtBrokered = !!debtPool && isBrokeredBorrow(debtPool)
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

  /**
   * The band count of an OPEN loan on the selected debt market. Non-null means
   * `N` is no longer a choice: LlamaLend fixes it at `create_loan` and every
   * later borrow inherits it, so the setter renders LOCKED at the POSITION's
   * value — not editable at the market default, which is what let a borrower
   * at N=4 stare at an editable "10". It also means `bands` must not be sent
   * with the quote: the API cannot apply it, and a dirty-looking control
   * implying otherwise is the same lie one layer up.
   */
  const lockedBandCount = openLoanBandCount(debtPos)

  // Pay wallet balance + overMax.
  //
  // The PRESENCE of a balance entry — not a non-zero one — is what makes the
  // balance known. Gating the comparison on `balance > 0` drops the warning in
  // the one case where it matters most: a zero balance, where EVERY pay amount
  // is unaffordable. That is why the panel showed "0 sfrxUSD" next to a pay
  // amount of 100 without complaint.
  //
  // String comparison, not floats: "Max" writes the balance string verbatim, so
  // an exact-max pay amount must compare equal rather than land inside an
  // epsilon fudge at 18 decimals.
  const payWalletBalance = selectedPayCurrency
    ? (walletBalances.get(selectedPayCurrency.address.toLowerCase()) ?? null)
    : null

  /**
   * The balance the margin is actually drawn from — wallet or sub-account.
   *
   * Everything downstream (Max, the shortfall warning, the price-impact
   * correction) reads THIS rather than the wallet, or a lender-funded open
   * would size and validate itself against a balance it never touches.
   */
  // Memoised: a fresh object literal every render would re-run the
  // `payAmountUSD` memo that depends on it, defeating the point of the memo.
  const payBalance = useMemo(
    () =>
      payFromLender
        ? { balance: activeMarginSource!.balance, balanceUSD: activeMarginSource!.balanceUSD }
        : payWalletBalance,
    [payFromLender, activeMarginSource, payWalletBalance]
  )
  const payBalanceStr = payBalance?.balance ?? '0'
  const payOverMax =
    !!payBalance && parseAmount(payAmount) > 0 && compareAmountStrings(payAmount, payBalanceStr) > 0
  const payShortfall = payOverMax ? parseAmount(payAmount) - parseAmount(payBalanceStr) : 0

  // USD value of the paid-in margin — used to correct the loop price impact so
  // the margin isn't booked as a swap penalty. Prefer the wallet balance's
  // implied unit price; fall back to the matching pool's oracle price. Left at
  // 0 when unknown so no (possibly wrong) correction is applied.
  const payAmountUSD = useMemo(() => {
    const amt = parseAmount(payAmount)
    if (!selectedPayCurrency || !(amt > 0)) return 0
    const balNum = parseAmount(payBalance?.balance ?? '0')
    const balUSD = payBalance?.balanceUSD
    if (balUSD != null && balNum > 0) {
      const price = balUSD / balNum
      if (Number.isFinite(price) && price > 0) return price * amt
    }
    const addr = selectedPayCurrency.address.toLowerCase()
    const match = [collateralPool, debtPool].find((p) => p?.asset?.address?.toLowerCase() === addr)
    if (match?.oraclePriceUSD != null) return match.oraclePriceUSD * amt
    return 0
  }, [selectedPayCurrency, payAmount, payBalance, collateralPool, debtPool])

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
        // NEVER sent over an open loan: `N` is fixed at open and every later
        // borrow inherits it, so a value here could only mislead.
        ...(lockedBandCount == null && bands?.dirty && bands.valid ? { bands: bands.bands } : {}),
        ...(selectedPayCurrency ? { payAsset: selectedPayCurrency.address } : {}),
        ...(selectedPayCurrency && payAmount
          ? { payAmount: parseUnits(payAmount, selectedPayCurrency.decimals).toString() }
          : {}),
        ...(accountId ? { accountId } : {}),
        // Fund the margin from inside the lender: the transfer rides in the
        // leverage tx and the deposit + approval disappear. `Number(...)`, not
        // truthiness — `0` is the DEFAULT sub-account and a valid source.
        ...(payFromLender ? { marginFromAccountId: Number(activeMarginSource!.accountId) } : {}),
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

      {/* Auto-balanced collateral, disclosed ABOVE the inputs.
          Unlike the optimizer panel, this surface holds the real market row, so
          the notice gets the full explainer (which SIDES are baskets, not just
          "collateral") and can name both legs. */}
      <AutoBalancedNotice
        row={collateralPool}
        legSymbols={smartInfo(collateralPool)?.collateralPair ?? []}
      />

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
            {/* Terminal 1 fill-now (Term Finance): the shown rate is a standing
                limit order settled INSTANTLY at that rate — unlike an auction
                round, it is the rate you actually get, capped by book depth. */}
            {(() => {
              const fillNow = (debtPool as any)?.fixedTerm?.fillNow
              if (!fillNow?.canBorrow) return null
              return (
                <div className="flex items-center gap-1.5 text-[10px] text-base-content/60">
                  <span className="inline-flex items-center rounded-md bg-success/20 px-1.5 py-0.5 font-semibold uppercase tracking-wide leading-none text-success whitespace-nowrap">
                    Instant fill
                  </span>
                  <span>
                    standing orders
                    {typeof fillNow.borrowAprPct === 'number'
                      ? ` at ${fillNow.borrowAprPct.toFixed(2)}%`
                      : ''}
                    {typeof fillNow.borrowLiquidity === 'number'
                      ? ` · depth ${fillNow.borrowLiquidity.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${debtPool?.asset.symbol ?? ''}`
                      : ''}
                  </span>
                </div>
              )
            })()}
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
                    <span className="font-medium">{displaySymbol(c)}</span>
                  </button>
                )
              })}
            </div>
          ) : payAssetsData && collateralPool && debtPool ? (
            // The lender takes NO margin on a loop (Flying Tulip): the open
            // deposits only the swap output, so collateral has to be supplied
            // beforehand. The API says so in `notes`; show it rather than an
            // empty row.
            <span className="text-xs text-base-content/60">
              {payAssetsData.notes[0] ?? 'This lender takes no margin on a leveraged open.'}
            </span>
          ) : (
            <span className="text-xs text-base-content/50">
              Select collateral & debt pools first
            </span>
          )}
          {payCurrencies.length > 0 && payAssetsData?.notes?.length ? (
            <div className="text-[11px] text-base-content/50 mt-1">{payAssetsData.notes[0]}</div>
          ) : null}

          {/* Margin source. Rendered only when a sub-account actually holds the
              pay asset, so the common wallet-only case looks exactly as before.
              Funding from inside the lender removes the separate deposit AND
              its approval — Dolomite's trader proxy can transfer between the
              caller's own sub-accounts inside the leverage call, but cannot
              reach the wallet at all. */}
          {selectedPayCurrency && canPayFromLender && (
            <div className="flex items-center flex-wrap gap-1.5 mt-1.5 text-xs">
              <span className="text-base-content/60">From:</span>
              <div className="join">
                {(['wallet', 'lender'] as const).map((src) => (
                  <button
                    key={src}
                    type="button"
                    className={`join-item btn btn-xs ${
                      (src === 'lender') === payFromLender ? 'btn-primary' : 'btn-ghost'
                    }`}
                    onClick={() => {
                      setPayFrom(src)
                      // There is no native balance inside a lender — margin held
                      // in Dolomite is WETH, not ETH. Switch the chip rather
                      // than show a wrapped balance under a native label.
                      if (src === 'lender' && selectedPayCurrency.address === zeroAddress) {
                        const wrapped = payCurrencies.find((c) => isWNative(c))
                        if (wrapped) setPayCurrencyAddress(wrapped.address)
                      }
                      setPayAmount('')
                      reset()
                    }}
                  >
                    {src === 'wallet' ? 'Wallet' : lenderLabel(selectedLender)}
                  </button>
                ))}
              </div>
              {payFromLender && marginSources.length > 1 && (
                <select
                  className="select select-xs select-bordered"
                  value={activeMarginSource!.accountId}
                  onChange={(e) => {
                    setMarginSourceId(e.target.value)
                    setPayAmount('')
                    reset()
                  }}
                >
                  {marginSources.map((m) => (
                    <option key={m.accountId} value={m.accountId}>
                      #{m.accountId} · {formatTokenAmount(m.balance)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Pay amount + wallet balance */}
        {selectedPayCurrency && (
          <div className="form-control mt-1.5">
            {payBalance && (
              <div className="text-xs flex justify-between px-1 mb-1">
                <span className="text-base-content/60 flex items-center gap-1">
                  {payFromLender
                    ? `In ${lenderLabel(selectedLender)} #${activeMarginSource!.accountId}:`
                    : 'Wallet balance:'}
                  {/* The refresh control belongs to the wallet-balance hook; a
                      sub-account balance comes from user data and has no
                      equivalent here. */}
                  {!payFromLender && refetchBalances && (
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
                  className={`font-medium ${parseAmount(payBalanceStr) === 0 ? 'text-base-content/40' : ''}`}
                >
                  {formatTokenAmount(payBalance.balance)} {displaySymbol(selectedPayCurrency)} ($
                  {formatUsd(payBalance.balanceUSD)})
                </span>
              </div>
            )}

            {/* What the user gets, and what it costs. The transaction saving is
                the entire point of the source toggle, so state it; and a source
                account that carries debt is LOSING collateral, which its health
                does not show until after the move. Dolomite re-checks
                collateralization at the end of the batch, so an unsafe move
                reverts rather than executing — but a revert is a poor way to
                find out. No projected health is shown: per-asset collateral
                factors make a naive scaling wrong, and a wrong number here is
                worse than none. */}
            {payFromLender && (
              <div className="text-[11px] px-1 mb-1 space-y-0.5">
                <div className="text-success">
                  Moves from #{activeMarginSource!.accountId} into #{accountId ?? '0'} inside the
                  loop — no deposit transaction.
                </div>
                {activeMarginSource!.health != null && (
                  <div className="text-warning">
                    #{activeMarginSource!.accountId} has debt (health{' '}
                    {activeMarginSource!.health.toFixed(2)}). Moving margin out lowers its
                    collateral; the transaction reverts if that would leave it undercollateralized.
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center justify-between mb-0.5">
              <label className="label-text text-xs">Pay Amount</label>
              {payBalance ? (
                <AmountQuickButtons
                  maxAmount={payBalanceStr}
                  onSelect={setPayAmount}
                  decimals={selectedPayCurrency.decimals}
                />
              ) : null}
            </div>
            <input
              type="text"
              inputMode="decimal"
              className={`input input-bordered input-sm w-full ${payOverMax ? 'input-error' : ''}`}
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
              <div className="mt-1">
                <InsufficientPayBalance
                  symbol={displaySymbol(selectedPayCurrency)}
                  balanceStr={payBalanceStr}
                  shortfall={payShortfall}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Band count — a LOAN-SHAPING input, so it sits with amount and
          slippage rather than at the bottom of the term sheet. It is fixed once
          `create_loan` lands, which is exactly why it must be seen before the
          quote rather than reviewed after it. Renders nothing unless the debt
          market exposes the parameter. */}
      {debtTermSheet && isFullSheet(debtTermSheet) && debtTermSheet.borrow?.liquidation ? (
        <BandSetterRow
          liquidation={debtTermSheet.borrow.liquidation}
          // An OPEN loan pins the control to the position's own `N`, read-only.
          // Editable-at-the-default over a live position was the bug: a
          // borrower at N=4 saw an editable "10" that could never apply.
          value={lockedBandCount ?? bands?.bands}
          onChange={handleBandsChange}
          mode={lockedBandCount != null ? 'locked' : 'edit'}
          variant="field"
        />
      ) : null}

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
              // drawn against the collateral, and it is fixed at open. The
              // LIVE control is in the form body — this is a read-only mirror,
              // because two inputs bound to one value fight each other and the
              // quote is sized against whichever wrote last. Over an open loan
              // it mirrors the POSITION's `N` and says so (`locked`).
              bandEdit={{
                value: lockedBandCount ?? bands?.bands,
                mode: lockedBandCount != null ? 'locked' : 'mirror',
              }}
            />
          ) : null}
        </div>
      ) : null}

      {/* Permissions, transactions, and execute. Shown once a quote is selected;
          the wallet-balance warning stays advisory (see the quotes button). */}
      {selectedIndex !== null && (
        <>
          {/* Repeated at the point of signing: the pay field sits several
              sections up and is easily scrolled out of view by the time a quote
              has been picked. */}
          {payOverMax && (
            <InsufficientPayBalance
              symbol={selectedPayCurrency ? displaySymbol(selectedPayCurrency) : undefined}
              balanceStr={payBalanceStr}
              shortfall={payShortfall}
            />
          )}
          <TradingExecuteBlock
            quotes={tradingQuotes}
            operation="Loop"
            executeLabel="Execute Loop"
          />
        </>
      )}
    </div>
  )
}
