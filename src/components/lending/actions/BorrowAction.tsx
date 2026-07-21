import React, { useEffect, useState } from 'react'
import { isWNative } from '../../../lib/lib-utils'
import { zeroAddress } from 'viem'
import type { ActionPanelProps } from './types'
import { useActionExecution } from './useActionExecution'
import { formatTokenAmount, formatUsd, parseAmount } from './format'
import { AmountInput } from '../../common/AmountInput'
import { NativeCurrencySelector } from './NativeCurrencySelector'
import { SubAccountSelector } from './SubAccountSelector'
import { lenderSupportsSubAccounts, fixedTermDetails } from './helpers'
import { FixedTermDetailsRows } from '../shared/FixedTermDetails'
import { MidnightOrderBook } from '../shared/MidnightOrderBook'
import { useLendingOffers, computeEffectiveBorrow } from '../../../hooks/lending/useLendingOffers'
import { MakeOfferPanel, TakeMakeToggle } from '../shared/MakeOfferPanel'
import { HealthFactorProjection } from './HealthFactorProjection'
import { RateImpactIndicator } from './RateImpactIndicator'
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

  const canUseNative = !!pool && isWNative(pool.asset) && !!nativeToken

  const {
    result,
    simulation,
    rateImpact,
    loading,
    executingPermission,
    executingMain,
    permissions,
    hasPermissions,
    permissionsCompleted,
    allPermissionsDone,
    error,
    txSuccess,
    executeNextPermission,
    executeMain,
    resetState,
    dismissSuccess,
  } = useActionExecution({
    actionType: 'Borrow',
    pool,
    account,
    amount,
    isAll: false,
    receiveAsset: canUseNative && useNative ? zeroAddress : undefined,
    accountId: hasSubAccounts ? (selectedAccountId ?? undefined) : undefined,
    termId: isBrokered ? (selectedTermId ?? undefined) : undefined,
    chainId,
    subAccount,
  })

  // Reset when pool changes
  useEffect(() => {
    setAmount('')
    setUseNative(false)
    resetState()
  }, [pool?.marketUid])

  const depositsStr = String(userPosition?.deposits ?? '0')
  const debtStr = String(userPosition?.debt ?? '0')
  const debtStableStr = String(userPosition?.debtStable ?? '0')
  const borrowableStr = String(userPosition?.borrowable ?? '0')
  const debtTotal = parseAmount(debtStr) + parseAmount(debtStableStr)
  const overMax =
    parseAmount(borrowableStr) > 0 && parseAmount(amount) > parseAmount(borrowableStr) + 1e-9

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
    chainId: pool?.marketUid?.split(':')[1],
    lender: pool?.marketUid?.split(':')[0],
    minAssetsUsd: 1,
  })
  const effectiveBorrow = computeEffectiveBorrow(orderBookOffers, amountNum)
  const borrowAprPct = effectiveBorrow.aprPct != null ? effectiveBorrow.aprPct : topOfBookAprPct
  const monthlyInterestUsd =
    amountNum > 0 && effectivePriceUsd > 0 && borrowAprPct > 0
      ? (amountNum * effectivePriceUsd * (borrowAprPct / 100)) / 12
      : 0

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
                amountTokens={amountNum}
                hideLadder={isOrderBook}
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
          entered amount, since a borrow fills several offers at different rates. */}
      {pool && (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60">
            {isBrokered ? 'Fixed borrow APR:' : 'Borrow APR:'}
          </span>
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
      <RateImpactIndicator rateImpact={rateImpact} />

      {result && !overMax && hasPermissions && !allPermissionsDone && (
        <div className="space-y-1">
          <span className="text-xs text-base-content/60">
            Approvals ({permissionsCompleted}/{permissions.length})
          </span>
          {permissions.map((perm, i) => {
            const done = i < permissionsCompleted
            const isCurrent = i === permissionsCompleted
            return (
              <button
                key={i}
                type="button"
                className={`btn btn-sm w-full ${done ? 'btn-disabled btn-outline btn-success' : isCurrent ? 'btn-warning' : 'btn-outline btn-ghost'}`}
                disabled={!isCurrent || executingPermission}
                onClick={isCurrent ? executeNextPermission : undefined}
                title={perm.description || `Approval ${i + 1}`}
              >
                <span className="truncate max-w-full">
                  {done ? (
                    `\u2713 ${perm.description || `Approval ${i + 1}`}`
                  ) : isCurrent && executingPermission ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    perm.description || `Approval ${i + 1}`
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {result && !overMax && (!hasPermissions || allPermissionsDone) && (
        <button
          type="button"
          className="btn btn-success btn-sm w-full"
          disabled={executingMain}
          onClick={executeMain}
        >
          {executingMain ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            'Execute Borrow'
          )}
        </button>
      )}
    </div>
  )
}
