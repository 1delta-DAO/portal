// src/components/lending/LenderOperationsBuilder.tsx
import React, { useMemo } from "react"
import type { Chain } from "viem" // if you use it, otherwise remove
import { LenderSelectionProvider, useLenderSelection } from "../../contexts/LenderSelectionContext"
// import type { FlattenedPoolWithUserData } from "../../utils/flattenLenderDataWithUser"
// import { flattenLenderDataWithUser } from "../../utils/flattenLenderDataWithUser"
import { LenderOperationSelectionRow } from "./LenderOperationSelectionRow"
import { useMarginData, UserPositions } from "../../hooks/lending/useMarginData" // adjust path
import { FlattenedPoolWithUserData, flattenLenderDataWithUser } from "../../hooks/lending/prepareMixedData"
import { BaseLendingPosition, LenderData } from "@1delta/margin-fetcher"

interface LenderOperationsBuilderProps {
    chainId: string
    userPositions?: UserPositions
    // account: string
    lenderData?: LenderData
    isLoading: boolean
    error: any
    refetch: () => void
}

/**
 * Inner content that assumes LenderSelectionProvider is already mounted.
 * Gets flattened pool data from props and renders the dynamic rows.
 */
const LenderOperationsBuilderInner: React.FC<{
    flattenedPools: FlattenedPoolWithUserData[]
}> = ({ flattenedPools }) => {
    const { selections, addSelection } = useLenderSelection()

    return (
        <div className="space-y-3">
            {/* Dynamic list of rows */}
            {selections.length === 0 && <div className="text-xs text-base-content/60">No operations yet. Use the button below to add one.</div>}

            {selections.map((sel) => (
                <LenderOperationSelectionRow key={sel.id} selection={sel} pools={flattenedPools} />
            ))}

            {/* Add operation button */}
            <div className="pt-2">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => addSelection()}>
                    + Add operation
                </button>
            </div>
        </div>
    )
}

/**
 * High-level component:
 *  - Depends only on chainId & account
 *  - Uses useMarginData to fetch user + public data
 *  - Flattens and wires into LenderSelectionProvider
 *  - By default shows one selection per pool where the user has a position
 */
export const LenderOperationsBuilder: React.FC<LenderOperationsBuilderProps> = ({
    chainId,
    // account,
    userPositions,
    lenderData,
    isLoading,
    error,
    refetch,
}) => {
    // const { userPositions, lenderData, isLoading, error, refetch } = useMarginData(chainId, account)

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

    // Flatten per-chain lender data and attach user positions
    const flattenedPools: FlattenedPoolWithUserData[] = useMemo(
        () =>
            flattenLenderDataWithUser(lenderData, userPositions, chainId).sort((a, b) => {
                const aVal = getPrimaryExposureUSD(a)
                const bVal = getPrimaryExposureUSD(b)
                return bVal - aVal // largest first
            }),
        [lenderData, userPositions, chainId]
    )

    // Default selections: all pools where user has any position
    const initialSelections = useMemo(
        () =>
            flattenedPools
                .filter((p) => !!p.userPosition && Object.values(p.userPosition ?? {}).length > 0)
                .map((p) => ({
                    pool: p,
                    amount: "", // empty default amount – user fills it
                    operation: "deposit" as const, // sensible default, user can change
                })),
        [flattenedPools, chainId]
    )

    return (
        <LenderSelectionProvider initialSelections={initialSelections}>
            <LenderOperationsBuilderInner flattenedPools={flattenedPools} />
        </LenderSelectionProvider>
    )
}

// helper: max(depositsUSD, totalBorrowUSD) from FIRST sub-account only
function getPrimaryExposureUSD(pool: FlattenedPoolWithUserData): number {
    const map = pool.userPosition as Record<string, BaseLendingPosition> | undefined
    if (!map) return 0

    const firstKey = Object.keys(map)[0]
    if (!firstKey) return 0

    const pos = map[firstKey]
    if (!pos) return 0

    const deposits = pos.depositsUSD ?? 0
    const borrow = (pos.debtUSD ?? 0) + (pos.debtStableUSD ?? 0)

    return Math.max(deposits, borrow)
}
