import React, { useEffect, useMemo, useRef, useState } from 'react'
import { isWNative } from '../../../lib/lib-utils'
import { zeroAddress } from 'viem'
import { isValidAddress } from '../../../utils/addressValidation'
import { useUserData } from '../../../hooks/lending/useUserData'
import type { ActionPanelProps } from './types'
import { useActionExecution } from './useActionExecution'
import { formatTokenAmount, formatUsd, parseAmount } from './format'
import { AmountInput } from '../../common/AmountInput'
import { NativeCurrencySelector } from './NativeCurrencySelector'
import { SubAccountSelector } from './SubAccountSelector'
import { lenderSupportsSubAccounts } from './helpers'
import { HealthFactorProjection } from './HealthFactorProjection'
import { RateImpactIndicator } from './RateImpactIndicator'
import { TransactionSuccess } from './TransactionSuccess'

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
  const [useNative, setUseNative] = useState(false)

  const hasSubAccounts = lenderSupportsSubAccounts(lenderKey)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(accountId ?? null)

  // Custom-receiver state — only visible when `allowCustomReceiver` is true
  // (the earn deposit flow). Null override == "deposit to operator".
  const [receiverOverride, setReceiverOverride] = useState<string | null>(null)
  const [receiverDraft, setReceiverDraft] = useState('')
  const [editingReceiver, setEditingReceiver] = useState(false)
  const effectiveReceiver = allowCustomReceiver && receiverOverride
    ? receiverOverride
    : account

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
      receiverDataQuery.userData.raw.find(
        (e) => e.lender === lenderKey && e.chainId === chainId
      ) ?? null
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
  const operatorSubs =
    subAccounts && subAccounts.length > 0 ? subAccounts : operatorFallbackSubs
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
        if (typeof pos === 'object' && pos !== null && !pos.term && pos.marketUid === pool.marketUid) {
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
        if (typeof pos === 'object' && pos !== null && !pos.term && pos.marketUid === pool.marketUid) {
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

  const canUseNative = !!pool && isWNative(pool.asset) && !!nativeToken

  const { result, simulation, rateImpact, loading, executingPermission, executingMain, permissions, hasPermissions, permissionsCompleted, allPermissionsDone, error, txSuccess, executeNextPermission, executeMain, resetState, dismissSuccess } =
    useActionExecution({
      actionType: 'Deposit',
      pool,
      account,
      receiver: effectiveReceiver,
      amount,
      isAll: false,
      payAsset: canUseNative && useNative ? zeroAddress : undefined,
      accountId: hasSubAccounts ? selectedAccountId ?? undefined : undefined,
      chainId,
      subAccount,
    })

  // Reset when pool changes
  useEffect(() => {
    setAmount('')
    setUseNative(false)
    resetState()
  }, [pool?.marketUid])

  // For wnative markets where the user holds the native token but no wrapped
  // balance (typical: CELO/ETH/MATIC sitting in the wallet, no WCELO/WETH/etc.),
  // default the toggle to "Pay with native" so the wallet balance display and
  // the % quick-buttons immediately have something to scale from.
  useEffect(() => {
    if (!canUseNative || useNative) return
    const wrappedBal = parseAmount(walletBalance?.balance ?? '0')
    const nativeBal = parseAmount(nativeBalance?.balance ?? '0')
    if (wrappedBal === 0 && nativeBal > 0) setUseNative(true)
  }, [canUseNative, useNative, walletBalance, nativeBalance])

  const activeBal = canUseNative && useNative ? nativeBalance : walletBalance
  const walletAmountStr = activeBal?.balance ?? '0'
  const overMax = parseAmount(walletAmountStr) > 0 && parseAmount(amount) > parseAmount(walletAmountStr) + 1e-9

  // Estimated monthly earnings: depositRate is in percent units (e.g. 5 = 5% APR).
  // Prefer the simulation's projected deposit rate (post-tx) when the backend
  // returns one for this market — supplying a depositor can move the rate
  // appreciably, so the post-tx APR is the more honest forecast. Fall back to
  // the pool's current rate, and likewise to oraclePriceUSD for the price.
  const effectivePriceUsd = priceUsd ?? pool?.oraclePriceUSD ?? 0
  const projectedAprPct = rateImpact?.find((e) => e.marketUid === pool?.marketUid)
    ?.depositRate?.projected
  const aprPct = projectedAprPct ?? pool?.depositRate ?? 0
  const amountNum = parseAmount(amount)
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
        onDismiss={() => { dismissSuccess(); setAmount('') }}
      />
    )
  }

  return (
    <div className="space-y-3">
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
              <span className="text-error truncate" title={(receiverDataQuery.error as Error).message}>
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
              <span className="text-error truncate" title={(operatorDataQuery.error as Error).message}>
                Couldn't load your accounts on this lender: {(operatorDataQuery.error as Error).message}
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
          onChange={setUseNative}
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
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                  </svg>
                )}
              </button>
            )}
          </span>
          {activeBal ? (
            <span className={`font-medium ${parseAmount(walletAmountStr) === 0 ? 'text-base-content/40' : ''}`}>
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
          <span
            className="text-error/80"
            title={(receiverDataQuery.error as Error).message}
          >
            unavailable
          </span>
        </div>
      ) : displayPosition && Number(displayPosition.deposits) > 0 ? (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60">
            {allowCustomReceiver && receiverOverride ? 'Receiver deposits:' : 'Current deposits:'}
          </span>
          <span className="text-success font-medium">
            {formatTokenAmount(displayPosition.deposits)} (${formatUsd(displayPosition.depositsUSD)})
          </span>
        </div>
      ) : null}

      {/* Amount input */}
      <AmountInput
        value={amount}
        onChange={setAmount}
        maxAmount={walletAmountStr}
        decimals={pool?.asset?.decimals}
        disabled={!pool}
        error={overMax ? `Exceeds wallet balance (${formatTokenAmount(walletAmountStr)}).` : null}
      />

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
          <RateImpactIndicator rateImpact={rateImpact} />
        </>
      )}

      {result && !overMax && hasPermissions && !allPermissionsDone && (
        <div className="space-y-1">
          <span className="text-xs text-base-content/60">Approvals ({permissionsCompleted}/{permissions.length})</span>
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
                  {done ? `\u2713 ${perm.description || `Approval ${i + 1}`}` : isCurrent && executingPermission ? (
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
          {executingMain ? <span className="loading loading-spinner loading-xs" /> : 'Execute Deposit'}
        </button>
      )}
    </div>
  )
}
