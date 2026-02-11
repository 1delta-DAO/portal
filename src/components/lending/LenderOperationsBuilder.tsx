// src/components/lending/LenderOperationsBuilder.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSendLendingTransaction } from '../../hooks/useSendLendingTransaction'
import { LenderSelectionProvider, useLenderSelection } from '../../contexts/LenderSelectionContext'
import { LenderOperationSelectionRow } from './LenderOperationSelectionRow'
import type { UserDataResult } from '../../hooks/lending/useUserData'
import {
  FlattenedPoolWithUserData,
  flattenLenderDataWithUser,
  type PositionTotals,
  type UserConfigs,
} from '../../hooks/lending/prepareMixedData'
import { LenderData } from '../../hooks/lending/usePoolData'
import { useSimulatedLenderSelections } from '../../hooks/lending/useSimulatedLenderSelections'
import type { SimulatedActionState } from '../../contexts/Simulation/simulateLenderSelections'
import { RunningBalancesOverview } from './RunningBlanacesOverview'
import { useAccount } from 'wagmi'
import { fetchAllocateAction } from '../../sdk/lending-helper/fetchAllocateAction'
import type { ApiActions } from '../../sdk/lending-helper/fetchFromApi'

interface LenderOperationsBuilderProps {
  chainId: string
  userDataResult?: UserDataResult
  lenderData?: LenderData
  isLoading: boolean
  error: any
  refetch: () => void
  prices?: { [k: string]: number }
}

/**
 * Inner content that assumes LenderSelectionProvider is already mounted.
 * Uses the batch POST /v1/actions/allocate endpoint.
 */
const LenderOperationsBuilderInner: React.FC<{
  chainId: string
  flattenedPools: FlattenedPoolWithUserData[]
  positionTotals: PositionTotals
  userConfigs: UserConfigs
  prices?: { [k: string]: number }
}> = ({ flattenedPools, positionTotals, userConfigs, prices, chainId }) => {
  const { selections, addSelection } = useLenderSelection()
  const { address: account } = useAccount()
  const { send } = useSendLendingTransaction({ chainId, account })

  // Run the simulation based on current selections
  const { steps, finalAssetBalances } = useSimulatedLenderSelections(
    positionTotals,
    userConfigs,
    '0', // default subaccount
    prices
  )

  const stepsBySelectionId = useMemo(() => {
    const map: Record<string, SimulatedActionState> = {}
    for (const s of steps) {
      map[s.selectionId] = s
    }
    return map
  }, [steps])

  const [allocateResult, setAllocateResult] = useState<ApiActions | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [executing, setExecuting] = useState(false)

  // Fetch transaction data via batch allocate endpoint
  useEffect(() => {
    if (!account) return

    const validSelections = selections.filter(
      (sel) => sel.pool && sel.amount && parseFloat(sel.amount) > 0
    )

    if (validSelections.length === 0) {
      setAllocateResult(null)
      setFetchError(null)
      return
    }

    let cancelled = false

    async function doFetch() {
      const response = await fetchAllocateAction({
        chainId,
        operator: account!,
        selections: validSelections,
        finalAssetBalances,
      })

      if (cancelled) return

      if (!response.success) {
        setAllocateResult(null)
        console.error('Failed to fetch allocate data:', response.error)
        setFetchError(response.error ?? 'Failed to fetch allocate data')
        return
      }

      setAllocateResult(response.actions ?? null)
      setFetchError(null)
    }

    doFetch()
    return () => {
      cancelled = true
    }
  }, [account, selections, chainId, finalAssetBalances])

  const executeAll = useCallback(async () => {
    if (!account || !allocateResult) return

    setExecuting(true)
    try {
      for (const perm of allocateResult.permissions) {
        const { ok, error: txError } = await send(perm)
        if (!ok) {
          setFetchError(txError ?? 'Permission transaction failed')
          return
        }
      }

      for (const tx of allocateResult.transactions) {
        const { ok, error: txError } = await send(tx)
        if (!ok) {
          setFetchError(txError ?? 'Transaction failed')
          return
        }
      }
    } finally {
      setExecuting(false)
    }
  }, [account, allocateResult, send])

  return (
    <div className="space-y-3">
      {selections.length === 0 && (
        <div className="text-xs text-base-content/60">
          No operations yet. Use the button below to add one.
        </div>
      )}

      {selections.map((sel) => (
        <LenderOperationSelectionRow
          key={sel.id}
          selection={sel}
          pools={flattenedPools}
          simulated={stepsBySelectionId[sel.id]}
          price={prices?.[sel.pool?.asset.assetGroup ?? '']}
        />
      ))}

      {/* Add operation button */}
      <div className="pt-2 flex gap-2">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => addSelection()}>
          + Add operation
        </button>
      </div>

      <RunningBalancesOverview items={Object.values(finalAssetBalances)} />

      {fetchError && <div className="text-error text-sm">{fetchError}</div>}

      {/* Execute button */}
      <div className="pt-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!allocateResult || executing}
          onClick={executeAll}
        >
          {executing ? 'Executing...' : 'Execute'}
        </button>
      </div>
    </div>
  )
}

/**
 * High-level component:
 *  - Depends only on chainId & externally provided userPositions/lenderData
 *  - Flattens and wires into LenderSelectionProvider
 *  - By default shows one selection per pool where the user has a position
 */
export const LenderOperationsBuilder: React.FC<LenderOperationsBuilderProps> = ({
  chainId,
  prices,
  userDataResult,
  lenderData,
  isLoading,
  error,
  refetch,
}) => {
  // If still loading basic data
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <span className="loading loading-spinner loading-md" />
      </div>
    )
  }

  if (error || !lenderData || !userDataResult) {
    return (
      <div className="alert alert-error flex items-center justify-between">
        <div className="text-sm">
          Failed to load lending data
          {error instanceof Error && <>: {error.message}</>}
        </div>
        <button type="button" className="btn btn-sm" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    )
  }

  // Flatten per-chain lender data and attach user positions + configs
  const { flattenedPools, positionTotals, userConfigs } = useMemo(() => {
    const { result, positionTotals, userConfigs } = flattenLenderDataWithUser(
      lenderData,
      userDataResult,
      chainId
    )

    return {
      flattenedPools: result.sort((a, b) => {
        const aVal = getPrimaryExposureUSD(a)
        const bVal = getPrimaryExposureUSD(b)
        return bVal - aVal // largest first
      }),
      positionTotals,
      userConfigs,
    }
  }, [lenderData, userDataResult, chainId])

  // Default selections: all pools where user has any position
  const initialSelections = useMemo(
    () =>
      flattenedPools
        .filter((p) => !!p.userPosition && Object.values(p.userPosition ?? {}).length > 0)
        .map((p) => ({
          pool: p,
          amount: '', // empty default amount – user fills it
          operation: 'deposit' as const, // sensible default, user can change
        })),
    [flattenedPools, chainId, isLoading]
  )

  return (
    <LenderSelectionProvider initialSelections={initialSelections}>
      <LenderOperationsBuilderInner
        chainId={chainId}
        prices={prices}
        flattenedPools={flattenedPools}
        positionTotals={positionTotals}
        userConfigs={userConfigs}
      />
    </LenderSelectionProvider>
  )
}

// helper: max(depositsUSD, totalBorrowUSD) from FIRST sub-account only
function getPrimaryExposureUSD(pool: FlattenedPoolWithUserData): number {
  const map = pool.userPosition
  if (!map) return 0

  const firstKey = Object.keys(map)[0]
  if (!firstKey) return 0

  const pos = map[firstKey]
  if (!pos) return 0

  const deposits = pos.depositsUSD ?? 0
  const borrow = (pos.debtUSD ?? 0) + (pos.debtStableUSD ?? 0)

  return Math.max(deposits, borrow)
}
