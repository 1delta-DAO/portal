import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { OptimizerPairRow } from '../../../../hooks/lending/useOptimizerPairs'
import { useLendingLatest } from '../../../../hooks/lending/usePoolData'
import { useUserData } from '../../../../hooks/lending/useUserData'
import {
  isAggregatePosition,
  type UserPositionEntry,
  type UserSubAccount,
} from '../../../../sdk/lending-helper/userPositionTypes'
import { useTokenBalances } from '../../../../hooks/lending/useTokenBalances'
import { LoopAction } from '../trading/actions/LoopAction'
import { buildPath, OPTIMIZER_DEEPLINK_KEYS } from '../../../../utils/routes'
import { resolveDeepLinkPool } from '../../shared/deepLink'

const EMPTY_SET: Set<string> = new Set()
const NOOP = () => {}

/**
 * Embeds the Loop (leverage-open) action inline in the optimizer panel with the
 * selected pair pre-injected — no navigation, no deep link. Fetches the pair's
 * lender data lazily (this only mounts when the Loop tab is opened) and resolves
 * the collateral / debt pools + the user's sub-accounts + wallet balances that
 * {@link LoopAction} needs, then hands them straight through as its
 * `initialSelection`. Falls back to the full Loop tab if the pair's markets
 * aren't resolvable from the lender's public data.
 */
export function OptimizerLoopPanel({ row, account }: { row: OptimizerPairRow; account?: string }) {
  const navigate = useNavigate()
  const chainId = row.chainId
  const lender = row.lenderKey

  // Heavy per-market fetch — lazy: this component only mounts on the Loop tab.
  const { lenderData, isPublicDataLoading } = useLendingLatest(chainId, [lender], true)
  const allPools = useMemo(() => lenderData?.[lender] ?? [], [lenderData, lender])

  // Resolve the pair's pools — marketUid first, underlying address as the
  // fallback. Shared with the Lending / Loop tab hand-offs so all three
  // resolve a pair the same way.
  const collateralPool = useMemo(
    () => resolveDeepLinkPool(allPools, row.marketLongUid, row.collateral.address) ?? null,
    [allPools, row.marketLongUid, row.collateral.address]
  )
  const debtPool = useMemo(
    () => resolveDeepLinkPool(allPools, row.marketShortUid, row.debt.address) ?? null,
    [allPools, row.marketShortUid, row.debt.address]
  )

  // Sub-accounts + positions for the lender (cache-shared with the panel above).
  const { userData } = useUserData({
    chainId,
    account,
    enabled: !!account,
    lenders: [lender],
  })
  const subAccounts = useMemo<UserSubAccount[]>(() => {
    const entry = userData?.raw?.find((e) => e.chainId === chainId && e.lender === lender)
    return entry?.data ?? []
  }, [userData, chainId, lender])
  const [accountId, setAccountId] = useState<string | null>(null)
  const activeSub = subAccounts.find((s) => s.accountId === accountId) ?? subAccounts[0] ?? null
  const userPositions = useMemo(() => {
    const map = new Map<string, UserPositionEntry>()
    for (const pos of activeSub?.positions ?? []) {
      if (typeof pos === 'object' && pos !== null && isAggregatePosition(pos)) {
        map.set(pos.marketUid, pos)
      }
    }
    return map
  }, [activeSub])

  // Wallet balances for the lender's pool assets.
  const poolAssetAddresses = useMemo(
    () => [...new Set(allPools.map((p) => p.underlying))],
    [allPools]
  )
  const {
    balances: walletBalances,
    isBalancesFetching,
    refetchBalances,
  } = useTokenBalances({ chainId, account, assets: poolAssetAddresses })

  const initialSelection = useMemo(
    () => ({
      collateralPool: collateralPool ?? undefined,
      debtPool: debtPool ?? undefined,
    }),
    [collateralPool, debtPool]
  )

  if (isPublicDataLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-xs text-base-content/50">
        <span className="loading loading-spinner loading-xs" /> Loading loop markets…
      </div>
    )
  }

  // The pair's markets aren't in this lender's public data (rare) — fall back to
  // the full Loop tab so the user isn't stuck.
  if (!collateralPool || !debtPool) {
    return (
      <div className="space-y-2 text-xs">
        <p className="text-base-content/60">Couldn't load the loop markets for this pair here.</p>
        <button
          type="button"
          className="btn btn-primary btn-sm w-full"
          onClick={() =>
            navigate(
              buildPath('trading', chainId, lender, {
                // UIDs first, addresses as the fallback — see
                // OPTIMIZER_DEEPLINK_KEYS. This panel already failed to resolve
                // the pair locally, so naming the markets exactly is what gives
                // the Loop tab a chance the embedded view didn't have.
                [OPTIMIZER_DEEPLINK_KEYS.colMarket]: row.marketLongUid,
                [OPTIMIZER_DEEPLINK_KEYS.debtMarket]: row.marketShortUid,
                [OPTIMIZER_DEEPLINK_KEYS.collateral]: row.collateral.address,
                [OPTIMIZER_DEEPLINK_KEYS.debt]: row.debt.address,
                [OPTIMIZER_DEEPLINK_KEYS.config]: row.eModeConfigId,
                [OPTIMIZER_DEEPLINK_KEYS.action]: 'loop',
              })
            )
          }
        >
          Open in Loop tab
        </button>
      </div>
    )
  }

  return (
    <LoopAction
      key={`${collateralPool.marketUid}:${debtPool.marketUid}`}
      allPools={allPools}
      collateralPools={allPools}
      borrowablePools={allPools}
      preferredCollateralUids={EMPTY_SET}
      preferredBorrowableUids={EMPTY_SET}
      userPositions={userPositions}
      walletBalances={walletBalances}
      subAccounts={subAccounts}
      selectedLender={lender}
      chainId={chainId}
      account={account}
      accountId={accountId ?? undefined}
      isBalancesFetching={isBalancesFetching}
      refetchBalances={refetchBalances}
      onAccountIdChange={setAccountId}
      onPoolSelectionChange={NOOP}
      initialSelection={initialSelection}
      pendingMarketClick={null}
      consumeMarketClick={NOOP}
    />
  )
}
