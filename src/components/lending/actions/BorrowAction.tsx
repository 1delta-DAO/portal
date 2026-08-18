import React, { useEffect, useMemo, useState } from 'react'
import { isWNative } from '../../../lib/lib-utils'
import { zeroAddress } from 'viem'
import type { ActionPanelProps } from './types'
import { useActionExecution } from './useActionExecution'
import { ActionExecuteBlock } from './ActionExecuteBlock'
import { isOverMax, formatTokenAmount, formatUsd, parseAmount } from './format'
import { AmountInput } from '../../common/AmountInput'
import { NativeCurrencySelector } from './NativeCurrencySelector'
import { SubAccountSelector } from './SubAccountSelector'
import { lenderSupportsSubAccounts, fixedTermDetails, lenderSupportsNative } from './helpers'
import { FixedTermDetailsRows } from '../shared/FixedTermDetails'
import { MidnightOrderBook } from '../shared/MidnightOrderBook'
import { useLendingOffers, computeEffectiveBorrow } from '../../../hooks/lending/useLendingOffers'
import { MakeOfferPanel, TakeMakeToggle } from '../shared/MakeOfferPanel'
import { HealthFactorProjection } from './HealthFactorProjection'
import { RateImpactIndicator } from './RateImpactIndicator'
import { TermsSummary } from '../terms'
import { useTermsAcknowledgement } from '../terms/TermsDisclosure'
import { useTermSheet } from '../../../hooks/lending/useTermSheet'
import { useTokenLists } from '../../../hooks/useTokenLists'
import { resolveSmartLeg, SmartLegInput, type SmartLegState } from '../shared/SmartLegInput'
import type { RateSetterState } from '../terms/RateSetterRow'
import { aprPercentToWad } from '../../../sdk/lending-helper/fetchLiquityRate'
import { isLiquityFamily, isLlamaLend } from '@1delta/lender-registry'
import { LiquityOpenPanel } from './LiquityOpenPanel'
import { LlamaLendOpenNotice } from './LlamaLendOpenNotice'
import { TermMaxOpenNotice } from './TermMaxOpenNotice'
import { DepositBorrowOpenPanel, openPanelCollaterals } from './DepositBorrowOpenPanel'
import { isFullSheet } from '../terms/types'
import { ComparableRatesPill } from '../shared/ComparableRatesPill'
import { TransactionSuccess } from './TransactionSuccess'

export const BorrowAction: React.FC<ActionPanelProps> = ({
  pool,
  userPosition,
  walletBalance,
  account,
  chainId,
  accountId,
  subAccounts,
  lenderKey,
  nativeToken,
  subAccount,
  isBalancesFetching,
  refetchBalances,
  priceUsd,
}) => {
  const [amount, setAmount] = useState('')
  // Term sheet for this market's BORROW side. Gates the wallet when the market
  // carries `critical` terms (time-based liquidation, full-collateral seizure,
  // redeemable-while-healthy, physical delivery) the user hasn't acknowledged.
  // The row carries a DIGEST (the API default). Upgrade to the full sheet
  // for this one market so the panel can show exit terms, liquidation
  // params, fees, oracle and governance — the digest has none of those.
  const { sheet: termSheet, isLoading: termsLoading } = useTermSheet({
    marketUid: pool?.marketUid,
    chainId,
    fallback: pool?.termSheet,
  })
  const termsAck = useTermsAcknowledgement(termSheet, 'borrow')

  // User-set-rate markets (the Liquity family) have no algorithmic rate — the
  // borrower picks one, and it is edited inside the term sheet rather than in
  // a separate field, because it IS one of the terms.
  const userSet = isFullSheet(termSheet) ? termSheet.borrow?.rate.userSet : undefined
  const [rateState, setRateState] = useState<RateSetterState | undefined>(undefined)
  const chosenRatePct = rateState?.aprPercent ?? userSet?.default
  // A rate outside the protocol's bounds reverts, so block the CTA rather than
  // letting the transaction fail.
  const rateBlocks = userSet?.required === true && rateState?.valid === false

  // Liquity-family markets need a TROVE before debt can be increased, and
  // opening one is a different call entirely (collateral + debt + rate in a
  // single transaction). With no trove there is nothing for the borrow form to
  // act on, so hand over to the open panel rather than building a request the
  // endpoint will reject.
  const lenderOfPool = pool?.marketUid?.split(':')[0] ?? ''
  const isLiquity = isLiquityFamily(lenderOfPool)
  const hasTrove = (subAccounts?.length ?? 0) > 0 || Number(userPosition?.debt ?? 0) > 0
  const needsOpen = isLiquity && !hasTrove

  /**
   * LlamaLend is the same shape as Liquity for the same reason: this screen
   * calls `borrow_more`, which requires a loan to already exist. Opening one is
   * `create_loan`, which needs collateral AND a band count in the same
   * transaction — so it cannot be reached from a borrow-only form.
   *
   * Without this branch the panel rendered a disabled band control captioned
   * "fixed for the life of this loan" to users who had no loan, and the borrow
   * itself would have failed server-side with "no open loan ... use
   * deposit-and-borrow". Say that up front instead.
   *
   * It also makes the read-only band row BELOW correct by construction: past
   * this point a loan always exists, so the parameter really is immutable.
   */
  const llamaLendNeedsOpen = isLlamaLend(lenderOfPool) && !hasTrove

  /**
   * TermMax is the same shape a third time: the standalone borrow raises debt
   * on an EXISTING GT and the server requires its gtId (`posId`) — with no
   * position the endpoint 400s ("use deposit-and-borrow"). Opening takes
   * collateral + borrow in one router transaction, from the Optimizer.
   */
  const termMaxNeedsOpen = lenderOfPool.startsWith('TERMMAX_') && !hasTrove
  const [useNative, setUseNative] = useState(false)

  const hasSubAccounts = lenderSupportsSubAccounts(lenderKey)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(accountId ?? null)

  useEffect(() => {
    setSelectedAccountId(accountId ?? null)
  }, [accountId])

  // Brokered (Lista) markets only offer fixed-term borrowing — pick a term from
  // the rate card; variable borrow isn't available through the app. (Spec §3-4.)
  const terms = pool?.terms ?? []
  const isBrokered = !!pool && (pool.variableBorrowDisabled === true || terms.length > 0)
  // Take (fill existing offers) vs Make (post your own limit offer) — order books only.
  const [obMode, setObMode] = useState<'take' | 'make'>('take')
  const hasTerms = terms.length > 0
  const [selectedTermId, setSelectedTermId] = useState<number | null>(null)

  // Default to the first term whenever the market (or its menu) changes.
  useEffect(() => {
    setSelectedTermId(terms.length > 0 ? terms[0].termId : null)
  }, [pool?.marketUid, terms.length])

  const selectedTerm = terms.find((t) => t.termId === selectedTermId) ?? null

  // Canonical fixed-term details (maturity / fees / early-repay), from the
  // API's `params.market.fixedTerm` — same shape for Lista and Midnight.
  const ftDetails = fixedTermDetails(pool)

  const canUseNative =
    !!pool && isWNative(pool.asset) && !!nativeToken && lenderSupportsNative(lenderKey)

  // Fluid smart DEBT (T3/T4): a borrow draws a two-token LP, not one token.
  // Null on every ordinary market.
  const smartLeg = useMemo(
    () => (pool ? resolveSmartLeg(pool, pool.underlying, 'debt') : null),
    [pool]
  )
  const [legState, setLegState] = useState<SmartLegState>({})
  const { data: smartChainTokens } = useTokenLists(smartLeg ? chainId : undefined)
  const secondaryToken = smartLeg
    ? smartChainTokens?.[smartLeg.secondary.underlying.toLowerCase()]
    : undefined

  const exec = useActionExecution({
    actionType: 'Borrow',
    pool,
    account,
    amount,
    asset1: legState.asset1,
    amount1: legState.amount1,
    isAll: false,
    receiveAsset: canUseNative && useNative ? zeroAddress : undefined,
    accountId: hasSubAccounts ? (selectedAccountId ?? undefined) : undefined,
    termId: isBrokered ? (selectedTermId ?? undefined) : undefined,
    // Percent in the UI, WAD on the wire — converted once, here.
    interestRate:
      userSet?.required && chosenRatePct != null ? aprPercentToWad(chosenRatePct) : undefined,
    chainId,
    subAccount,
  })
  const { simulation, rateImpact, loading, error, txSuccess, resetState, dismissSuccess } = exec

  // Reset when pool changes
  useEffect(() => {
    setAmount('')
    setUseNative(false)
    setLegState({})
    resetState()
  }, [pool?.marketUid])

  const depositsStr = String(userPosition?.deposits ?? '0')
  const debtStr = String(userPosition?.debt ?? '0')
  const debtStableStr = String(userPosition?.debtStable ?? '0')
  const borrowableStr = String(userPosition?.borrowable ?? '0')
  const debtTotal = parseAmount(debtStr) + parseAmount(debtStableStr)
  // Warn whenever the typed amount exceeds what's borrowable — including the
  // case where borrowable is exactly 0 (no free collateral), which the old
  // `borrowable > 0` gate silently swallowed. Gate on `userPosition` (as
  // WithdrawAction does) so the warning waits for the position rather than
  // firing on a not-yet-loaded — or genuinely absent — one. Advisory only: it
  // never disables the action.
  const overMax = !!userPosition && isOverMax(amount, borrowableStr)

  // Estimated monthly interest: variableBorrowRate is in percent units.
  // Prefer the simulation's projected borrow rate (post-tx) when available —
  // adding borrow demand can move the rate appreciably. Fall back to the
  // pool's current rate, and likewise to oraclePriceUSD for the price.
  const effectivePriceUsd = priceUsd ?? pool?.oraclePriceUSD ?? 0
  const projectedBorrowAprPct = rateImpact?.find((e) => e.marketUid === pool?.marketUid)?.borrowRate
    ?.projected
  // Brokered borrow is a fixed rate from the chosen term; otherwise use the
  // (post-tx projected, else current) variable rate.
  const topOfBookAprPct = isBrokered
    ? (selectedTerm?.apr ?? 0)
    : (projectedBorrowAprPct ?? pool?.variableBorrowRate ?? 0)
  const amountNum = parseAmount(amount)
  // Order-book (Midnight) markets: a borrow `take`s multiple offers best-first,
  // so the rate you actually pay is the size-weighted BLEND across the offers
  // this amount fills — not the lone top-of-book rate. Compute it from the live
  // ladder (react-query dedupes this fetch with the OfferLadder below). Falls
  // back to the top-of-book rate when there's no amount / not an order book.
  const { offers: orderBookOffers } = useLendingOffers({
    marketUid: pool?.marketUid,
    minAssetsUsd: 1,
  })
  const effectiveBorrow = computeEffectiveBorrow(orderBookOffers, amountNum)
  const borrowAprPct = effectiveBorrow.aprPct != null ? effectiveBorrow.aprPct : topOfBookAprPct
  const monthlyInterestUsd =
    amountNum > 0 && effectivePriceUsd > 0 && borrowAprPct > 0
      ? (amountNum * effectivePriceUsd * (borrowAprPct / 100)) / 12
      : 0

  // Holding period the rate comparison is normalized to. Anchor it to THIS
  // market's own term so the comparison answers "what else could I pay over the
  // period I'm actually committing to": a calendar maturity (Midnight/Term/
  // Exactly) counted from now, else the selected rolling-menu duration (Lista),
  // else undefined — which lets the server fall back to a year, where a variable
  // pool's effective rate is just its sticker rate.
  const comparisonHorizonDays = (() => {
    if (ftDetails?.maturityMs) {
      const days = (ftDetails.maturityMs - Date.now()) / 86_400_000
      if (days > 0) return days
    }
    const d = Number(selectedTerm?.durationDays)
    return Number.isFinite(d) && d > 0 ? d : undefined
  })()

  if (txSuccess) {
    return (
      <TransactionSuccess
        actionType={txSuccess.actionType}
        amount={txSuccess.amount}
        symbol={txSuccess.symbol}
        hash={txSuccess.hash}
        onDismiss={() => {
          dismissSuccess()
          setAmount('')
        }}
      />
    )
  }

  const isOrderBook = ftDetails?.provider?.kind === 'orderbook'

  // Order-book MAKE mode: post your own limit borrow offer instead of taking.
  if (isOrderBook && obMode === 'make') {
    return (
      <div className="space-y-3">
        <TakeMakeToggle value={obMode} onChange={setObMode} />
        <MakeOfferPanel
          chainId={pool?.marketUid?.split(':')[1] ?? chainId}
          lender={pool!.marketUid.split(':')[0]}
          side="borrow"
          symbol={pool?.asset?.symbol}
          decimals={pool?.asset?.decimals}
          account={account}
          maturityMs={ftDetails?.maturityMs}
        />
      </div>
    )
  }

  // No position yet on a lender whose standalone borrow needs one (LlamaLend
  // `borrow_more`, TermMax `issueFtByExistedGt`): embed the deposit-and-borrow
  // open right here — collateral + borrow in one transaction, the same build
  // the Optimizer uses — instead of dead-ending into a notice. The notice
  // stays as the fallback for when the term sheet cannot name a collateral to
  // address the request with (still loading, or a digest-only sheet).
  if ((llamaLendNeedsOpen || termMaxNeedsOpen) && pool) {
    if (termsLoading) {
      return (
        <div className="flex items-center justify-center gap-2 py-3 text-xs text-base-content/60">
          <span className="loading loading-spinner loading-xs" />
          <span>Loading market terms…</span>
        </div>
      )
    }
    if (openPanelCollaterals(termSheet).length > 0) {
      return (
        <DepositBorrowOpenPanel
          pool={pool}
          termSheet={termSheet}
          account={account}
          chainId={chainId}
        />
      )
    }
    return llamaLendNeedsOpen ? (
      <LlamaLendOpenNotice symbol={pool.asset.symbol} />
    ) : (
      <TermMaxOpenNotice symbol={pool.asset.symbol} />
    )
  }

  if (needsOpen && pool) {
    return (
      <LiquityOpenPanel
        pool={pool}
        // A Liquity branch has exactly one collateral; the sheet names it.
        collateralAsset={
          isFullSheet(termSheet)
            ? termSheet.borrow?.acceptedCollateral?.items?.[0]?.asset
            : undefined
        }
        termSheet={termSheet}
        account={account}
        chainId={chainId}
      />
    )
  }

  return (
    <div className="space-y-3">
      {isOrderBook && <TakeMakeToggle value={obMode} onChange={setObMode} />}
      {/* Sub-account selector */}
      {hasSubAccounts && (
        <SubAccountSelector
          subAccounts={subAccounts ?? []}
          selectedAccountId={selectedAccountId}
          onChange={setSelectedAccountId}
          allowCreate={false}
        />
      )}

      {/* Native/wrapped selector */}
      {canUseNative && nativeToken && (
        <NativeCurrencySelector
          wrappedSymbol={pool!.asset.symbol}
          nativeToken={nativeToken}
          useNative={useNative}
          onChange={setUseNative}
          label="Receive as"
        />
      )}

      {/* Fixed-term selector (brokered markets only). */}
      {isBrokered && (
        <div className="space-y-1.5">
          <span className="text-xs text-base-content/60 px-1">Fixed term</span>
          {hasTerms ? (
            <div className="flex flex-wrap gap-1.5">
              {terms.map((t) => {
                const active = t.termId === selectedTermId
                return (
                  <button
                    key={t.termId}
                    type="button"
                    onClick={() => setSelectedTermId(t.termId)}
                    className={`flex flex-col items-start px-2.5 py-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
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
            <div className="text-xs text-base-content/50 px-1">
              Fixed-term borrowing is currently unavailable for this market.
            </div>
          )}
          {/* Fixed-term details — maturity, any market-level fees, and the
              early-repayment policy. Unified across Lista and Midnight. */}
          {ftDetails && (
            <div className="mt-1 space-y-0.5 px-1 text-[10px] text-base-content/60">
              <FixedTermDetailsRows
                details={ftDetails}
                symbol={pool?.asset?.symbol}
                lender={pool?.marketUid}
                // Term rows now come from <TermsSummary> for every lender;
                // this stays for the live depth ladder + tap-to-fill.
                hideRows
                amountTokens={amountNum}
                hideLadder={isOrderBook}
                termId={selectedTermId ?? undefined}
                onSelectOfferAmount={(tokens) => {
                  // Tap an offer tile → borrow up to that tier's depth, capped at
                  // what the position can actually borrow.
                  const cap = parseAmount(borrowableStr)
                  setAmount(String(cap > 0 ? Math.min(tokens, cap) : tokens))
                }}
              />
              {/* Full two-sided order book. Borrowing = TAKE the bid (demand)
                  side (tap-to-fill); the ask side shows competing borrow makers. */}
              {isOrderBook && (
                <MidnightOrderBook
                  chainId={pool?.marketUid?.split(':')[1]}
                  lender={pool?.marketUid?.split(':')[0]}
                  symbol={pool?.asset?.symbol}
                  fillSide="bids"
                  amountTokens={amountNum}
                  onSelectAmount={(tokens) => {
                    const cap = parseAmount(borrowableStr)
                    setAmount(String(cap > 0 ? Math.min(tokens, cap) : tokens))
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Wallet balance */}
      {walletBalance && parseFloat(walletBalance.balance) > 0 && (
        <div className="text-xs flex justify-between px-1">
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
          <span className="font-medium">
            {formatTokenAmount(walletBalance.balance)} (${formatUsd(walletBalance.balanceUSD)})
          </span>
        </div>
      )}

      {/* User position context */}
      {userPosition && parseAmount(depositsStr) > 0 && (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60">Your deposits:</span>
          <span className="text-success font-medium">
            {formatTokenAmount(userPosition.deposits)} (${formatUsd(userPosition.depositsUSD)})
          </span>
        </div>
      )}
      {userPosition && debtTotal > 0 && (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60">Current debt:</span>
          <span className="text-error font-medium">
            {formatTokenAmount(debtTotal)} ($
            {formatUsd(userPosition.debtUSD + userPosition.debtStableUSD)})
          </span>
        </div>
      )}
      {parseAmount(borrowableStr) > 0 && (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60">Available to borrow:</span>
          <span className="text-warning font-medium">{formatTokenAmount(borrowableStr)}</span>
        </div>
      )}

      {/* Pool info — fixed term rate when brokered, else the variable rate. For
          an order book this becomes the effective (size-weighted) rate for the
          entered amount, since a borrow fills several offers at different rates.
          The pill next to it answers "what would this cost elsewhere?" — the
          best comparable venues for the same asset, priced at the entered size
          and (for a fixed term) over the same maturity. */}
      {pool && (
        <div className="text-xs flex justify-between items-center gap-2 px-1">
          <span className="text-base-content/60">
            {isBrokered ? 'Fixed borrow APR:' : 'Borrow APR:'}
          </span>
          <span className="flex items-center gap-1.5">
            <ComparableRatesPill
              chainId={chainId}
              debtAddress={pool.asset?.address}
              amount={amountNum > 0 ? amountNum : undefined}
              horizonDays={comparisonHorizonDays}
              referenceMarketUid={pool.marketUid}
              referenceTermId={selectedTermId != null ? String(selectedTermId) : undefined}
              currentAprPct={borrowAprPct}
            />
            <span
              className="text-warning font-medium"
              title={
                effectiveBorrow.aprPct != null
                  ? `Effective (size-weighted) rate across the ${effectiveBorrow.consumedTicks.length} offer(s) this borrow fills — worst offer ${(effectiveBorrow.worstAprPct ?? 0).toFixed(2)}%.`
                  : undefined
              }
            >
              {borrowAprPct.toFixed(2)}%
            </span>
          </span>
        </div>
      )}

      {/* Amount input */}
      <AmountInput
        value={amount}
        onChange={setAmount}
        maxAmount={borrowableStr}
        decimals={pool?.asset?.decimals}
        disabled={!pool || (isBrokered && !selectedTerm)}
        error={overMax ? `Exceeds borrowable amount (${formatTokenAmount(borrowableStr)}).` : null}
      />

      {/* The second leg of an LP debt side. A smart-debt borrow draws BOTH
          tokens; balanced is the cheaper draw, single-sided pays the pool. */}
      {smartLeg && pool && (
        <SmartLegInput
          row={pool}
          leg={smartLeg}
          primaryAmount={amount}
          primarySymbol={pool.asset.symbol}
          secondarySymbol={secondaryToken?.symbol}
          secondaryLogoURI={secondaryToken?.logoURI}
          onChange={setLegState}
        />
      )}

      {/* Order-book depth: warn when the borrow is larger than the live book can
          fill on THIS market (a bigger position would need another market's book). */}
      {isBrokered && effectiveBorrow.short && amountNum > 0 && !overMax && (
        <div className="text-[10px] text-warning px-1">
          Order-book depth is ~{formatTokenAmount(effectiveBorrow.filled)}
          {pool?.asset?.symbol ? ` ${pool.asset.symbol}` : ''} — a larger borrow won't fully fill on
          this market.
        </div>
      )}

      {/* Estimated monthly interest — mirror of the deposit-side earnings row. */}
      {monthlyInterestUsd > 0 && (
        <div className="text-xs flex items-center justify-between gap-2 px-1">
          <span className="text-base-content/60 whitespace-nowrap">Interest / month</span>
          <span className="text-error font-medium whitespace-nowrap">
            ~${formatUsd(monthlyInterestUsd)}
            <span className="text-base-content/40 font-normal ml-1">
              ({borrowAprPct.toFixed(2)}%)
            </span>
          </span>
        </div>
      )}

      {error && <div className="text-error text-xs wrap-break-word">{error}</div>}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-1 text-xs text-base-content/60">
          <span className="loading loading-spinner loading-xs" />
          <span>Simulating...</span>
        </div>
      )}

      {/* Projected health factor */}
      <HealthFactorProjection simulation={simulation} />

      {/* Rate impact */}
      <RateImpactIndicator
        rateImpact={rateImpact}
        marketYields={
          pool
            ? {
                [pool.marketUid]: {
                  intrinsicYield: pool.intrinsicYield,
                  depositRewardApr: pool.depositRewardApr,
                  borrowRewardApr: pool.borrowRewardApr,
                },
              }
            : undefined
        }
      />

      {/* One card, every lender: what you pay and whether it grows, when it is
          due and what happens if you do nothing, what can take your collateral,
          and what exiting early costs. */}
      <TermsSummary
        sheet={termSheet}
        side="borrow"
        termsLoading={termsLoading}
        rateEdit={userSet?.required ? { value: chosenRatePct, onChange: setRateState } : undefined}
        /* `/lending/borrow` only ever INCREASES debt on a loan that already
           exists — opening one needs collateral, debt and the band count
           together, which is the loop/deposit-and-borrow path. The no-loan case
           returns above, so by here the loan exists and its band count really
           is fixed: read-only is the truth, not a fallback. */
        bandEdit={{ mode: 'locked' }}
      />

      {rateBlocks ? (
        <div className="rounded-lg border border-error/30 bg-error/10 px-2 py-1.5 text-[11px] text-error">
          Set an interest rate within the allowed range before borrowing.
        </div>
      ) : null}

      <ActionExecuteBlock
        exec={exec}
        label="Execute Borrow"
        terms={termsAck}
        termsSide="borrow"
        termsActionLabel="borrow"
      />
    </div>
  )
}
