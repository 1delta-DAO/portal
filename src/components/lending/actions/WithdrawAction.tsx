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
import { SellEarlyPanel } from '../shared/SellEarlyPanel'
import { HealthFactorProjection } from './HealthFactorProjection'
import { RateImpactIndicator } from './RateImpactIndicator'
import { TransactionSuccess } from './TransactionSuccess'

export const WithdrawAction: React.FC<ActionPanelProps> = ({
  pool,
  userPosition,
  account,
  chainId,
  accountId,
  subAccounts,
  lenderKey,
  nativeToken,
  subAccount,
  hideSimulation,
  priceUsd,
}) => {
  const [amount, setAmount] = useState('')
  const [isAll, setIsAll] = useState(false)
  const [useNative, setUseNative] = useState(false)
  // Redeem (settled units, at/after maturity) vs Sell-early (into the book).
  const [exitMode, setExitMode] = useState<'redeem' | 'sell'>('redeem')

  const hasSubAccounts = lenderSupportsSubAccounts(lenderKey)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(accountId ?? null)

  useEffect(() => {
    setSelectedAccountId(accountId ?? null)
  }, [accountId])

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
    actionType: 'Withdraw',
    pool,
    account,
    amount,
    isAll,
    receiveAsset: canUseNative && useNative ? zeroAddress : undefined,
    accountId: hasSubAccounts ? (selectedAccountId ?? undefined) : undefined,
    chainId,
    subAccount,
  })

  // Reset when pool changes
  useEffect(() => {
    setAmount('')
    setIsAll(false)
    setUseNative(false)
    resetState()
  }, [pool?.marketUid])

  const withdrawableStr = String(userPosition?.withdrawable ?? '0')
  const depositsStr = String(userPosition?.deposits ?? '0')

  // Midnight loan-token (order-book) lender position — offer an early-exit SELL
  // (into the book) alongside the plain Redeem (settled units at maturity).
  const ftDetails = fixedTermDetails(pool)
  const isLoanOrderBook =
    ftDetails?.provider?.kind === 'orderbook' && !(pool?.config as any)?.['0']?.debtDisabled
  // Warn whenever the typed amount exceeds what's withdrawable — including the
  // fully-collateralized case where withdrawable is exactly 0 (deposits back an
  // open borrow). Gate on `userPosition` (not `withdrawable > 0`) so we don't
  // flash the warning before the position loads.
  const overMax =
    !isAll && !!userPosition && parseAmount(amount) > parseAmount(withdrawableStr) + 1e-9

  // Estimated earnings forfeited by withdrawing this amount. depositRate is
  // in percent units. Prefer the simulation's projected deposit rate (post-tx)
  // when available — withdrawing typically raises utilization and the rate.
  // Fall back to the pool's current rate and to oraclePriceUSD.
  const effectivePriceUsd = priceUsd ?? pool?.oraclePriceUSD ?? 0
  const projectedAprPct = rateImpact?.find((e) => e.marketUid === pool?.marketUid)?.depositRate
    ?.projected
  const aprPct = projectedAprPct ?? pool?.depositRate ?? 0
  const amountNum = parseAmount(amount)
  const monthlyForfeitedUsd =
    amountNum > 0 && effectivePriceUsd > 0 && aprPct > 0
      ? (amountNum * effectivePriceUsd * (aprPct / 100)) / 12
      : 0

  // Any user input (typing or 25/50/75 presets) clears the isAll flag.
  const handleAmountChange = (val: string) => {
    setIsAll(false)
    setAmount(val)
  }

  // The "Max" preset is special: it sets isAll=true (so the backend repays
  // the full position via the dedicated isAll flag, not a fixed amount).
  const handleMaxClick = () => {
    setIsAll(true)
    if (parseAmount(withdrawableStr) > 0) setAmount(withdrawableStr)
  }

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
          setIsAll(false)
        }}
      />
    )
  }

  // Early-exit SELL mode: sell the position into the book instead of redeeming.
  if (isLoanOrderBook && exitMode === 'sell') {
    return (
      <div className="space-y-3">
        <ExitToggle value={exitMode} onChange={setExitMode} />
        <SellEarlyPanel
          chainId={pool?.marketUid?.split(':')[1] ?? chainId}
          lender={pool!.marketUid.split(':')[0]}
          marketUid={pool!.marketUid}
          symbol={pool?.asset?.symbol}
          decimals={pool?.asset?.decimals}
          account={account}
          maturityMs={ftDetails?.maturityMs}
          maxAmount={withdrawableStr}
          onSold={() => resetState()}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {isLoanOrderBook && <ExitToggle value={exitMode} onChange={setExitMode} />}
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

      {/* Available balance */}
      {userPosition && parseAmount(depositsStr) > 0 && (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60">Available to withdraw:</span>
          <span className="text-success font-medium">
            {formatTokenAmount(userPosition.withdrawable)} (${formatUsd(userPosition.depositsUSD)})
          </span>
        </div>
      )}

      {/* Amount input with quick buttons */}
      <AmountInput
        value={amount}
        onChange={handleAmountChange}
        maxAmount={withdrawableStr}
        decimals={pool?.asset?.decimals}
        onMaxClick={handleMaxClick}
        disabled={!pool}
        error={
          overMax ? `Exceeds withdrawable balance (${formatTokenAmount(withdrawableStr)}).` : null
        }
      />

      {/* Estimated earnings forfeited by this withdrawal. */}
      {monthlyForfeitedUsd > 0 && (
        <div className="text-xs flex items-center justify-between gap-2 px-1">
          <span className="text-base-content/60 whitespace-nowrap">Forfeited / month</span>
          <span className="text-warning font-medium whitespace-nowrap">
            ~${formatUsd(monthlyForfeitedUsd)}
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

      {result && hasPermissions && !allPermissionsDone && (
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

      {result && (!hasPermissions || allPermissionsDone) && (
        <button
          type="button"
          className="btn btn-success btn-sm w-full"
          disabled={executingMain}
          onClick={executeMain}
        >
          {executingMain ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            'Execute Withdraw'
          )}
        </button>
      )}
    </div>
  )
}

/** Redeem (settled units / at maturity) vs Sell-early (into the book). */
function ExitToggle({
  value,
  onChange,
}: {
  value: 'redeem' | 'sell'
  onChange: (v: 'redeem' | 'sell') => void
}) {
  const opts: { v: 'redeem' | 'sell'; label: string; title: string }[] = [
    {
      v: 'redeem',
      label: 'Redeem',
      title: 'Withdraw settled units 1:1 (at/after maturity)',
    },
    {
      v: 'sell',
      label: 'Sell early',
      title: 'Exit before maturity by selling your units into the book',
    },
  ]
  return (
    <div className="flex rounded-lg border border-base-300 p-0.5 text-xs">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          title={o.title}
          className={`flex-1 rounded-md py-1 transition-colors ${
            value === o.v
              ? 'bg-primary/15 text-primary font-medium'
              : 'text-base-content/60 hover:text-base-content'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
