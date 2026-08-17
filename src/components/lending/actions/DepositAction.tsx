import React, { useEffect, useMemo, useRef, useState } from 'react'
import { isWNative } from '../../../lib/lib-utils'
import { zeroAddress } from 'viem'
import { isValidAddress } from '../../../utils/addressValidation'
import { useUserData } from '../../../hooks/lending/useUserData'
import type { ActionPanelProps } from './types'
import { useActionExecution } from './useActionExecution'
import { ActionExecuteBlock } from './ActionExecuteBlock'
import { compareAmountStrings, formatTokenAmount, formatUsd, parseAmount } from './format'
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
import { TransactionSuccess } from './TransactionSuccess'
import { TermsSummary } from '../terms'
import { useTermsAcknowledgement } from '../terms/TermsDisclosure'
import { useTermSheet } from '../../../hooks/lending/useTermSheet'
import { useTokenLists } from '../../../hooks/useTokenLists'
import { useTokenBalances } from '../../../hooks/lending/useTokenBalances'
import {
  resolveSmartLeg,
  SmartLegInput,
  type SmartLegState,
} from '../shared/SmartLegInput'

export const DepositAction: React.FC<ActionPanelProps> = ({
  pool,
  userPosition,
  walletBalance,
  account,
  chainId,
  accountId,
  subAccounts,
  lenderKey,
  nativeToken,
  nativeBalance,
  subAccount,
  isBalancesFetching,
  refetchBalances,
  hideSimulation,
  priceUsd,
  allowCustomReceiver,
}) => {
  const [amount, setAmount] = useState('')
  // Term sheet for this market's SUPPLY side. `cleared` is false only when the
  // market carries `critical` terms the user has not acknowledged — which is
  // rare by design, so the gate stays credible when it does fire.
  // The row carries a DIGEST (the API default). Upgrade to the full sheet
  // for this one market so the panel can show exit terms, liquidation
  // params, fees, oracle and governance — the digest has none of those.
  const { sheet: termSheet, isLoading: termsLoading } = useTermSheet({
    marketUid: pool?.marketUid,
    chainId,
    fallback: pool?.termSheet,
  })
  const termsAck = useTermsAcknowledgement(termSheet, 'supply')
  const [useNative, setUseNative] = useState(false)
  // Take (fill existing offers) vs Make (post your own limit offer) — order books only.
  const [obMode, setObMode] = useState<'take' | 'make'>('take')

  const hasSubAccounts = lenderSupportsSubAccounts(lenderKey)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(accountId ?? null)

  // Custom-receiver state — only visible when `allowCustomReceiver` is true
  // (the earn deposit flow). Null override == "deposit to operator".
  const [receiverOverride, setReceiverOverride] = useState<string | null>(null)
  const [receiverDraft, setReceiverDraft] = useState('')
  const [editingReceiver, setEditingReceiver] = useState(false)
  const effectiveReceiver = allowCustomReceiver && receiverOverride ? receiverOverride : account

  // Sync with parent's accountId when it changes — but only while we're
  // depositing to the operator. Once the user overrides the receiver, the
  // operator's sub-account is no longer meaningful and we let the user pick
  // one of the receiver's accounts.
  useEffect(() => {
    if (allowCustomReceiver && receiverOverride) return
    setSelectedAccountId(accountId ?? null)
  }, [accountId, allowCustomReceiver, receiverOverride])

  // Fetch the receiver's lending data, scoped to the selected lender so we
  // only pull what we need to render their sub-accounts and current position.
  const receiverDataQuery = useUserData({
    chainId,
    account: receiverOverride ?? undefined,
    enabled: !!allowCustomReceiver && !!receiverOverride && !!lenderKey,
    lenders: lenderKey ? [lenderKey] : undefined,
  })
  const receiverLenderEntry = useMemo(() => {
    if (!receiverDataQuery.userData?.raw) return null
    return (
      receiverDataQuery.userData.raw.find((e) => e.lender === lenderKey && e.chainId === chainId) ??
      null
    )
  }, [receiverDataQuery.userData, lenderKey, chainId])
  const receiverSubAccounts = receiverLenderEntry?.data ?? []

  // Operator-data fallback. The earn flow doesn't auto-fetch full user data
  // anymore (the global query only fires on the Lending / Looping tabs), so
  // when the parent hands us an empty `subAccounts` for a multi-account
  // lender we kick off a lender-scoped fetch here. Same React Query, same
  // cache key — if the Lending tab has already loaded it for this lender,
  // this hits the cache and returns synchronously.
  const operatorFallbackNeeded =
    !(allowCustomReceiver && receiverOverride) &&
    hasSubAccounts &&
    !!account &&
    !!lenderKey &&
    !!chainId &&
    (!subAccounts || subAccounts.length === 0)
  const operatorDataQuery = useUserData({
    chainId,
    account,
    enabled: operatorFallbackNeeded,
    lenders: lenderKey ? [lenderKey] : undefined,
  })
  const operatorFallbackSubs = useMemo(() => {
    if (!operatorDataQuery.userData?.raw) return []
    const entry = operatorDataQuery.userData.raw.find(
      (e) => e.lender === lenderKey && e.chainId === chainId
    )
    return entry?.data ?? []
  }, [operatorDataQuery.userData, lenderKey, chainId])

  // The list shown in the SubAccountSelector — receiver's when an override
  // is active, otherwise the parent's prop (Lending tab) falling back to our
  // own scoped fetch (Earn tab).
  const operatorSubs = subAccounts && subAccounts.length > 0 ? subAccounts : operatorFallbackSubs
  const effectiveSubAccounts =
    allowCustomReceiver && receiverOverride ? receiverSubAccounts : operatorSubs

  // Reset the chosen sub-account whenever the receiver changes (sub-account
  // IDs don't carry semantics across owners). The auto-pick below then fills
  // in a sensible default once the receiver's data has landed.
  const autoPickedForReceiverRef = useRef<string | null>(null)
  useEffect(() => {
    if (!allowCustomReceiver) return
    setSelectedAccountId(null)
    autoPickedForReceiverRef.current = null
  }, [allowCustomReceiver, receiverOverride])

  // Auto-pick the receiver's sub-account with the highest USD deposits as the
  // default selection. Runs exactly once per receiver change — once the user
  // taps a different sub-account, our ref still matches the current receiver
  // so this effect early-returns and respects the user's choice.
  useEffect(() => {
    if (!allowCustomReceiver || !receiverOverride) return
    if (receiverDataQuery.isUserDataLoading) return
    if (autoPickedForReceiverRef.current === receiverOverride) return
    if (receiverSubAccounts.length > 0) {
      const best = receiverSubAccounts.reduce((acc, sub) =>
        (sub.balanceData?.deposits ?? 0) > (acc.balanceData?.deposits ?? 0) ? sub : acc
      )
      setSelectedAccountId(best.accountId)
    }
    autoPickedForReceiverRef.current = receiverOverride
  }, [
    allowCustomReceiver,
    receiverOverride,
    receiverSubAccounts,
    receiverDataQuery.isUserDataLoading,
  ])

  // Auto-pick the operator's highest-deposit sub-account when no selection is
  // active yet (earn flow doesn't pass an `accountId` prop). Without this,
  // multi-account lenders (Euler V2, Fluid, …) would receive `accountId:
  // undefined` and the worker would fall through to a default — usually
  // *not* the account the user thinks they're depositing into.
  //
  // The Lending tab explicitly passes `accountId`, so `selectedAccountId` is
  // already truthy on mount there and this effect early-returns. Skipped
  // entirely while a receiver override is active (that path has its own
  // dedicated auto-pick above).
  useEffect(() => {
    if (allowCustomReceiver && receiverOverride) return
    if (!hasSubAccounts) return
    if (selectedAccountId) return
    if (operatorSubs.length === 0) return
    const best = operatorSubs.reduce((acc, sub) =>
      (sub.balanceData?.deposits ?? 0) > (acc.balanceData?.deposits ?? 0) ? sub : acc
    )
    setSelectedAccountId(best.accountId)
  }, [allowCustomReceiver, receiverOverride, hasSubAccounts, selectedAccountId, operatorSubs])

  // Position to display under the amount input: receiver's current deposit
  // on this market when an override is set, otherwise the operator's.
  const receiverPosition = useMemo(() => {
    if (!allowCustomReceiver || !receiverOverride || !pool) return null
    for (const sub of receiverSubAccounts) {
      // When the user has picked a specific receiver sub-account, only look
      // at that one — otherwise sum across all sub-accounts would mislead.
      if (selectedAccountId && sub.accountId !== selectedAccountId) continue
      for (const pos of sub.positions) {
        // Aggregate row only — skip per-loan brokered rows that share marketUid.
        if (
          typeof pos === 'object' &&
          pos !== null &&
          !pos.term &&
          pos.marketUid === pool.marketUid
        ) {
          return pos
        }
      }
    }
    return null
  }, [allowCustomReceiver, receiverOverride, receiverSubAccounts, selectedAccountId, pool])

  // For multi-account lenders the parent's `userPosition` prop returns the
  // first match across *all* sub-accounts, which can show the wrong figure
  // when the operator holds the same market in multiple subs. Re-derive from
  // the prop `subAccounts` filtered by the actually-selected sub.
  const operatorPosition = useMemo(() => {
    if (!hasSubAccounts) return userPosition
    if (!pool || operatorSubs.length === 0) return userPosition
    for (const sub of operatorSubs) {
      if (selectedAccountId && sub.accountId !== selectedAccountId) continue
      for (const pos of sub.positions) {
        // Aggregate row only — skip per-loan brokered rows that share marketUid.
        if (
          typeof pos === 'object' &&
          pos !== null &&
          !pos.term &&
          pos.marketUid === pool.marketUid
        ) {
          return pos
        }
      }
    }
    // Fall through to the prop only when nothing matched — preserves behavior
    // for single-account lenders that the parent computes correctly.
    return null
  }, [hasSubAccounts, pool, operatorSubs, selectedAccountId, userPosition])

  const displayPosition =
    allowCustomReceiver && receiverOverride ? receiverPosition : operatorPosition

  const canUseNative =
    !!pool && isWNative(pool.asset) && !!nativeToken && lenderSupportsNative(lenderKey)

  // ── Fluid smart collateral: the deposit takes TWO amounts ────────────────
  //
  // A deposit acts on the COLLATERAL side, so this resolves against that side
  // regardless of which leg the selected row happens to name. Null on every
  // ordinary market, and every branch below then behaves exactly as before.
  const smartLeg = useMemo(
    () => (pool ? resolveSmartLeg(pool, pool.underlying, 'collateral') : null),
    [pool]
  )
  const [legState, setLegState] = useState<SmartLegState>({})
  const { data: chainTokens } = useTokenLists(smartLeg ? chainId : undefined)
  const secondaryToken = smartLeg
    ? chainTokens?.[smartLeg.secondary.underlying.toLowerCase()]
    : undefined
  const { balances: secondaryBalances } = useTokenBalances({
    chainId,
    account,
    assets: smartLeg ? [smartLeg.secondary.underlying] : [],
  })
  const secondaryBalance = smartLeg
    ? secondaryBalances.get(smartLeg.secondary.underlying.toLowerCase())?.balance
    : undefined

  const exec = useActionExecution({
    actionType: 'Deposit',
    pool,
    account,
    receiver: effectiveReceiver,
    amount,
    isAll: false,
    payAsset: canUseNative && useNative ? zeroAddress : undefined,
    accountId: hasSubAccounts ? (selectedAccountId ?? undefined) : undefined,
    chainId,
    subAccount,
    asset1: legState.asset1,
    amount1: legState.amount1,
  })
  const { simulation, rateImpact, loading, error, txSuccess, resetState, dismissSuccess } = exec

  // Tracks whether the native/wrapped default has been settled for the current
  // pool — either because the auto-default below applied it or because the user
  // manually picked a side. Once set, the auto-default stops running so it can't
  // fight a manual selection.
  const nativeDefaultSettledRef = useRef(false)

  // Reset when pool changes
  useEffect(() => {
    setAmount('')
    setUseNative(false)
    // The second leg belongs to the market that was selected, not to the one
    // now selected — carrying it across would build a request naming a token
    // that is not in the new vault.
    setLegState({})
    nativeDefaultSettledRef.current = false
    resetState()
  }, [pool?.marketUid])

  // For wnative markets where the user holds the native token but no wrapped
  // balance (typical: CELO/ETH/MATIC sitting in the wallet, no WCELO/WETH/etc.),
  // default the toggle to "Pay with native" so the wallet balance display and
  // the % quick-buttons immediately have something to scale from. This is a
  // one-time default per pool: without the settled-ref guard it re-fired on
  // every `useNative` change and snapped the toggle back to native the instant
  // the user tried to switch to wrapped.
  useEffect(() => {
    if (!canUseNative || nativeDefaultSettledRef.current) return
    const wrappedBal = parseAmount(walletBalance?.balance ?? '0')
    const nativeBal = parseAmount(nativeBalance?.balance ?? '0')
    // Wait for balances to land before committing the default; both zero
    // usually means the balance query hasn't resolved yet.
    if (wrappedBal === 0 && nativeBal === 0) return
    if (wrappedBal === 0 && nativeBal > 0) setUseNative(true)
    nativeDefaultSettledRef.current = true
  }, [canUseNative, walletBalance, nativeBalance])

  // Any manual pick settles the default so the auto-default won't override it.
  const handleUseNativeChange = (next: boolean) => {
    nativeDefaultSettledRef.current = true
    setUseNative(next)
  }

  const activeBal = canUseNative && useNative ? nativeBalance : walletBalance
  const walletAmountStr = activeBal?.balance ?? '0'
  // Warn whenever the typed amount exceeds the wallet — including a balance of
  // exactly ZERO, where every amount is unaffordable. Gate on the PRESENCE of a
  // balance entry (not `balance > 0`) so the warning is suppressed only while
  // the balance is genuinely unknown, never because it is empty. Advisory: it
  // never disables the action, the wallet transfer is the real guardrail.
  const overMax = !!activeBal && compareAmountStrings(amount || '0', walletAmountStr) > 0

  // Estimated monthly earnings: depositRate is in percent units (e.g. 5 = 5% APR).
  // Prefer the simulation's projected deposit rate (post-tx) when the backend
  // returns one for this market — supplying a depositor can move the rate
  // appreciably, so the post-tx APR is the more honest forecast. Fall back to
  // the pool's current rate, and likewise to oraclePriceUSD for the price.
  const effectivePriceUsd = priceUsd ?? pool?.oraclePriceUSD ?? 0
  const projectedAprPct = rateImpact?.find((e) => e.marketUid === pool?.marketUid)?.depositRate
    ?.projected
  const amountNum = parseAmount(amount)
  // Order-book (Midnight) LEND: supplying the loan token buys credit units by
  // taking maker SELL offers (asks). The rate you earn is the size-weighted blend
  // across the offers this deposit fills — surface that instead of the ~0
  // `depositRate` an order-book market carries. Gate on the LOAN leg only (the
  // borrowable one); the collateral-deposit leg keeps the plain deposit view.
  // (react-query dedupes this fetch with the lend ladder rendered below.)
  const ftDetails = fixedTermDetails(pool)
  const isLoanOrderBook =
    ftDetails?.provider?.kind === 'orderbook' && !(pool?.config as any)?.['0']?.debtDisabled
  const { offers: lendOffers } = useLendingOffers({
    marketUid: pool?.marketUid,
    side: 'lend',
    minAssetsUsd: 1,
  })
  const effectiveLend = computeEffectiveBorrow(lendOffers, amountNum)
  const topDepositAprPct = projectedAprPct ?? pool?.depositRate ?? 0
  const aprPct =
    isLoanOrderBook && effectiveLend.aprPct != null ? effectiveLend.aprPct : topDepositAprPct
  const monthlyEarnUsd =
    amountNum > 0 && effectivePriceUsd > 0 && aprPct > 0
      ? (amountNum * effectivePriceUsd * (aprPct / 100)) / 12
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

  // Order-book MAKE mode: post your own limit lend offer instead of taking.
  if (isLoanOrderBook && obMode === 'make') {
    return (
      <div className="space-y-3">
        <TakeMakeToggle value={obMode} onChange={setObMode} />
        <MakeOfferPanel
          chainId={pool?.marketUid?.split(':')[1] ?? chainId}
          lender={pool!.marketUid.split(':')[0]}
          side="lend"
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
      {isLoanOrderBook && <TakeMakeToggle value={obMode} onChange={setObMode} />}
      {/* Custom receiver row — surfaces the address that will own the deposit
          (shares accrue here). Defaults to the operator; integrators can paste
          a different address to preview the flow and inspect the receiver's
          existing position on this lender. Earn only. */}
      {allowCustomReceiver && (account || receiverOverride) && (
        <div className="rounded-lg border border-base-300 px-2 py-1.5 text-xs space-y-1">
          {editingReceiver ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-base-content/60">Receiver</span>
                <button
                  type="button"
                  className="text-[10px] text-base-content/40 hover:text-base-content"
                  onClick={() => {
                    setEditingReceiver(false)
                    setReceiverDraft('')
                  }}
                >
                  Cancel
                </button>
              </div>
              <input
                type="text"
                spellCheck={false}
                autoFocus
                className={`input input-bordered input-xs w-full font-mono ${
                  receiverDraft && !isValidAddress(receiverDraft) ? 'input-error' : ''
                }`}
                placeholder="0x… (defaults to operator)"
                value={receiverDraft}
                onChange={(e) => setReceiverDraft(e.target.value.trim())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isValidAddress(receiverDraft)) {
                    setReceiverOverride(receiverDraft)
                    setEditingReceiver(false)
                  } else if (e.key === 'Escape') {
                    setEditingReceiver(false)
                    setReceiverDraft('')
                  }
                }}
              />
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`text-[10px] ${
                    receiverDraft && !isValidAddress(receiverDraft)
                      ? 'text-error'
                      : 'text-base-content/40'
                  }`}
                >
                  {receiverDraft
                    ? isValidAddress(receiverDraft)
                      ? 'Valid checksum'
                      : 'Not a valid address'
                    : 'Paste an EVM address'}
                </span>
                <button
                  type="button"
                  className="btn btn-xs btn-primary"
                  disabled={!isValidAddress(receiverDraft)}
                  onClick={() => {
                    setReceiverOverride(receiverDraft)
                    setEditingReceiver(false)
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-1">
              <span className="text-base-content/60">Receiver</span>
              <div className="flex items-center gap-1">
                <span
                  className="font-mono text-[11px] truncate max-w-35"
                  title={effectiveReceiver ?? ''}
                >
                  {receiverOverride
                    ? `${receiverOverride.slice(0, 6)}…${receiverOverride.slice(-4)}`
                    : 'Operator'}
                </span>
                <button
                  type="button"
                  className="text-base-content/40 hover:text-base-content"
                  title="Edit receiver"
                  onClick={() => {
                    setReceiverDraft(receiverOverride ?? '')
                    setEditingReceiver(true)
                  }}
                >
                  <svg
                    className="w-3 h-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                {receiverOverride && (
                  <button
                    type="button"
                    className="text-base-content/40 hover:text-base-content"
                    title="Reset to operator"
                    onClick={() => {
                      setReceiverOverride(null)
                      setReceiverDraft('')
                    }}
                  >
                    <svg
                      className="w-3 h-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Receiver-fetch status — only when a custom receiver is set. Surfaces
          a fetch error inline (with a retry) and explicitly tells the user
          when the receiver has no sub-accounts on this lender yet, so the
          empty selector below isn't ambiguous. */}
      {allowCustomReceiver && receiverOverride && hasSubAccounts && (
        <>
          {receiverDataQuery.error ? (
            <div className="rounded-lg border border-error/30 bg-error/10 px-2 py-1.5 text-[11px] flex items-center justify-between gap-2">
              <span
                className="text-error truncate"
                title={(receiverDataQuery.error as Error).message}
              >
                Couldn't load receiver data: {(receiverDataQuery.error as Error).message}
              </span>
              <button
                type="button"
                className="btn btn-xs btn-outline btn-error"
                onClick={() => receiverDataQuery.refetch()}
              >
                Retry
              </button>
            </div>
          ) : !receiverDataQuery.isUserDataLoading && receiverSubAccounts.length === 0 ? (
            <div className="rounded-lg border border-base-300 px-2 py-1.5 text-[11px] text-base-content/60">
              Receiver has no sub-accounts on this lender yet. Use{' '}
              <span className="font-medium">+ New</span> below to create one.
            </div>
          ) : null}
        </>
      )}

      {/* Operator-fallback fetch status — only visible on the Earn path when
          the parent didn't pre-load sub-accounts for this lender. Surfaces
          the in-flight state so the empty selector doesn't look broken, and
          the fetch error if the lender-scoped RPC roundtrip fails. */}
      {operatorFallbackNeeded && !(allowCustomReceiver && receiverOverride) && (
        <>
          {operatorDataQuery.error ? (
            <div className="rounded-lg border border-error/30 bg-error/10 px-2 py-1.5 text-[11px] flex items-center justify-between gap-2">
              <span
                className="text-error truncate"
                title={(operatorDataQuery.error as Error).message}
              >
                Couldn't load your accounts on this lender:{' '}
                {(operatorDataQuery.error as Error).message}
              </span>
              <button
                type="button"
                className="btn btn-xs btn-outline btn-error"
                onClick={() => operatorDataQuery.refetch()}
              >
                Retry
              </button>
            </div>
          ) : operatorDataQuery.isUserDataLoading ? (
            <div className="rounded-lg border border-base-300 px-2 py-1.5 text-[11px] text-base-content/60 flex items-center gap-2">
              <span className="loading loading-spinner w-2.5 h-2.5" />
              Loading your accounts on this lender…
            </div>
          ) : null}
        </>
      )}

      {/* Sub-account selector. When a custom receiver is set, the list
          switches to the receiver's sub-accounts (and the next-account create
          flow queries against the receiver address). */}
      {hasSubAccounts && (
        <SubAccountSelector
          subAccounts={effectiveSubAccounts}
          selectedAccountId={selectedAccountId}
          onChange={setSelectedAccountId}
          allowCreate
          chainId={chainId}
          lender={lenderKey}
          account={effectiveReceiver}
        />
      )}

      {/* Native/wrapped selector */}
      {canUseNative && nativeToken && (
        <NativeCurrencySelector
          wrappedSymbol={pool!.asset.symbol}
          nativeToken={nativeToken}
          useNative={useNative}
          onChange={handleUseNativeChange}
          label="Pay with"
        />
      )}

      {/* Wallet balance — always render the row when a pool is selected so the
          user gets immediate "loading…" feedback instead of an empty space. */}
      {pool && (
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
          {activeBal ? (
            <span
              className={`font-medium ${parseAmount(walletAmountStr) === 0 ? 'text-base-content/40' : ''}`}
            >
              {formatTokenAmount(activeBal.balance)} (${formatUsd(activeBal.balanceUSD)})
            </span>
          ) : isBalancesFetching ? (
            <span className="flex items-center gap-1 text-base-content/40">
              <span className="loading loading-spinner w-3 h-3" />
              Loading…
            </span>
          ) : (
            <span className="text-base-content/40">—</span>
          )}
        </div>
      )}

      {/* Current deposits — the receiver's when a custom receiver is set,
          otherwise the operator's. While the receiver's data is still in
          flight we show a loading row. On error we show a dash + tooltip,
          so the user doesn't conflate a fetch failure with "no position." */}
      {allowCustomReceiver && receiverOverride && receiverDataQuery.isUserDataLoading ? (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60">Receiver deposits:</span>
          <span className="flex items-center gap-1 text-base-content/40">
            <span className="loading loading-spinner w-3 h-3" />
            Loading…
          </span>
        </div>
      ) : allowCustomReceiver && receiverOverride && receiverDataQuery.error ? (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60">Receiver deposits:</span>
          <span className="text-error/80" title={(receiverDataQuery.error as Error).message}>
            unavailable
          </span>
        </div>
      ) : displayPosition && Number(displayPosition.deposits) > 0 ? (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60">
            {allowCustomReceiver && receiverOverride ? 'Receiver deposits:' : 'Current deposits:'}
          </span>
          <span className="text-success font-medium">
            {formatTokenAmount(displayPosition.deposits)} (${formatUsd(displayPosition.depositsUSD)}
            )
          </span>
        </div>
      ) : null}

      {/* Order-book (Midnight) LEND: the fixed-term facts + the full two-sided
          order book. Depositing = LEND = TAKE the ask (supply) side, so those
          rows are tap-to-fill; the bid (demand) side shows competing lend makers.
          Loan leg only (the collateral-deposit leg keeps the plain view). */}
      {isLoanOrderBook && ftDetails && (
        <div className="mt-1 space-y-1.5 px-1 text-[10px] text-base-content/60">
          <MidnightOrderBook
            chainId={pool?.marketUid?.split(':')[1]}
            lender={pool?.marketUid?.split(':')[0]}
            symbol={pool?.asset?.symbol}
            fillSide="asks"
            amountTokens={amountNum}
            onSelectAmount={(tokens) => {
              // Tap an offer → select up to that tier's cumulative depth. Do NOT
              // clamp to the wallet here: when the wallet is smaller than every
              // offer's depth, a min() collapses every tap to the same wallet-sized
              // value and the selection appears frozen. The `overMax` guard below
              // still blocks executing more than the wallet holds — exactly as it
              // does for a typed amount, so tap and type behave identically.
              setAmount(String(tokens))
            }}
          />
        </div>
      )}

      {/* Amount input */}
      <AmountInput
        value={amount}
        onChange={setAmount}
        maxAmount={walletAmountStr}
        decimals={pool?.asset?.decimals}
        disabled={!pool}
        error={overMax ? `Exceeds wallet balance (${formatTokenAmount(walletAmountStr)}).` : null}
      />

      {/* The second leg of an LP collateral side, plus the balanced /
          single-sided choice. Renders nothing on an ordinary market. */}
      {smartLeg && pool && (
        <SmartLegInput
          row={pool}
          leg={smartLeg}
          primaryAmount={amount}
          primarySymbol={pool.asset.symbol}
          secondarySymbol={secondaryToken?.symbol}
          secondaryLogoURI={secondaryToken?.logoURI}
          secondaryBalance={secondaryBalance}
          onChange={setLegState}
        />
      )}

      {/* Estimated monthly earnings — surfaces what the user will earn on this
          deposit based on the market's current deposit APR. */}
      {monthlyEarnUsd > 0 && (
        <div className="text-xs flex items-center justify-between gap-2 px-1">
          <span className="text-base-content/60 whitespace-nowrap">Earnings / month</span>
          <span className="text-success font-medium whitespace-nowrap">
            ~${formatUsd(monthlyEarnUsd)}
            <span className="text-base-content/40 font-normal ml-1">({aprPct.toFixed(2)}%)</span>
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

      {!hideSimulation && (
        <>
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
        </>
      )}

      {/* One card, every lender: rate breakdown, exit terms + utilization,
          what backs the deposit, fees, oracle and governance — all derived
          from `termSheet`, with no lender-key branching. */}
      <TermsSummary sheet={termSheet} side="supply" termsLoading={termsLoading} />

      <ActionExecuteBlock
        exec={exec}
        label="Execute Deposit"
        terms={termsAck}
        termsSide="supply"
        termsActionLabel="deposit"
      />
    </div>
  )
}
