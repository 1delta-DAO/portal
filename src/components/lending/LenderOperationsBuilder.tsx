// src/components/lending/LenderOperationsBuilder.tsx
import React, { useEffect, useMemo, useState } from 'react'
import type { Chain } from 'viem' // if you use it, otherwise remove
import { LenderSelectionProvider, useLenderSelection } from '../../contexts/LenderSelectionContext'
import { LenderOperationSelectionRow } from './LenderOperationSelectionRow'
import type { UserPositions } from '../../hooks/lending/useMarginData' // type-only
import {
  FlattenedPoolWithUserData,
  flattenLenderDataWithUser,
  type PositionTotals,
  type UserConfigs,
} from '../../hooks/lending/prepareMixedData'
import { BaseLendingPosition } from '@1delta/margin-fetcher'
import { LenderData } from '../../hooks/lending/usePoolData'
import { useSimulatedLenderSelections } from '../../hooks/lending/useSimulatedLenderSelections'
import type { SimulatedActionState } from '../../contexts/Simulation/simulateLenderSelections'
import { RunningBalancesOverview } from './RunningBlanacesOverview'
import { generateAllocationActionsForApi } from '../../sdk/lending-helper/toApiParams'
import { useConnection } from 'wagmi'
import { fetchTransactionData } from '../../sdk/lending-helper/fetchFromApi'

interface LenderOperationsBuilderProps {
  chainId: string
  userPositions?: UserPositions
  lenderData?: LenderData
  isLoading: boolean
  error: any
  refetch: () => void
  prices?: { [k: string]: number }
}

const CALLDATA_ENDPOINT = `https://transaction.1delta.io/allocate`

/**
 * Inner content that assumes LenderSelectionProvider is already mounted.
 * Gets flattened pool data + simulation info from props and renders the rows.
 */
const LenderOperationsBuilderInner: React.FC<{
  chainId: string
  flattenedPools: FlattenedPoolWithUserData[]
  positionTotals: PositionTotals
  userConfigs: UserConfigs
  prices?: { [k: string]: number }
}> = ({ flattenedPools, positionTotals, userConfigs, prices, chainId }) => {
  const { selections, addSelection } = useLenderSelection()

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

  const [txn, setTxn] = useState<any>({})

  const { address: account } = useConnection()
  useEffect(() => {
    if (account) {
      async function getCalldata() {
        const params = generateAllocationActionsForApi({
          selections,
          finalAssetBalances,
          receiver: account,
        })
        const response = await fetchTransactionData(CALLDATA_ENDPOINT, {
          chainId,
          operator: account!,
          actions: params,
        })

        if (!response.success) {
          console.error('Error:', response.error)
          return
        }

        setTxn(response.data)
      }
      getCalldata()
    }
  }, [account, selections, finalAssetBalances])


  return (
    <div className="space-y-3">
      {/* Dynamic list of rows */}
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

      {/* Execute button – hook your tx logic here later */}
      <div className="pt-2">
        <button type="button" className="btn btn-primary btn-sm">
          Execute
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
  userPositions,
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

  if (error || !lenderData || !userPositions) {
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
      userPositions,
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
  }, [lenderData, userPositions, chainId])

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
  const map = (pool.userPosition as Record<string, BaseLendingPosition> | undefined) ?? undefined
  if (!map) return 0

  const firstKey = Object.keys(map)[0]
  if (!firstKey) return 0

  const pos = map[firstKey]
  if (!pos) return 0

  const deposits = pos.depositsUSD ?? 0
  const borrow = (pos.debtUSD ?? 0) + (pos.debtStableUSD ?? 0)

  return Math.max(deposits, borrow)
}
