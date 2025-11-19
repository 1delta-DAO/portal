// src/utils/flattenLenderDataWithUser.ts
import type { RawCurrency } from "@1delta/lib-utils"
import { BaseLendingPosition, BasicReserveResponse, LenderData, PoolData } from "@1delta/margin-fetcher"
import { UserPositions } from "./useMarginData"

/**
 * One flattened entry: a single pool for a specific chain & lender,
 * plus the *per-pool* user position if it exists.
 */
export interface FlattenedPoolWithUserData {
    chainId: string
    lender: string
    poolId: string
    asset: RawCurrency
    poolData: PoolData
    /** The user's position for this pool (if any) */
    userPosition?: { [accountId: string]: BaseLendingPosition }
}

/**
 * Flattens LenderData for a single chain and attaches per-pool user data
 * from UserPositions.userData. If a user position does not exist for a pool,
 * userPosition will be undefined.
 *
 * Assumptions:
 * - Only one chainId is relevant at a time and is provided explicitly.
 * - All public mappings (chainId, lender, poolId) exist in LenderData.
 */
export function flattenLenderDataWithUser(
    lenderData: LenderData,
    userPositions: UserPositions | undefined,
    chainId: string
): FlattenedPoolWithUserData[] {
    const result: FlattenedPoolWithUserData[] = []

    const chainEntry = lenderData[chainId]
    if (!chainEntry) {
        // no data for this chain
        return result
    }

    const userDataForChain:
        | {
              [lender: string]: { [a: string]: BasicReserveResponse }
          }
        | undefined = userPositions?.userData?.[chainId]

    // lenderData[chainId].data: { [lender: string]: { data: { [poolId]: PoolData } } }
    for (const [lender, lenderEntry] of Object.entries(chainEntry.data)) {
        const poolsMap = lenderEntry.data
        const userForLender: { [a: string]: BasicReserveResponse } | undefined = userDataForChain?.[lender]

        for (const [poolId, poolData] of Object.entries(poolsMap)) {
            // Find per-pool user position in BasicReserveResponse.lendingPositions
            let userPosition: { [accountId: string]: BaseLendingPosition } = {}

            // over accounts - expect only one here
            Object.entries(userForLender ?? {}).forEach(([account, d]) => {
                // lendingPositions: { [subAccountId: string]: { [poolId: string]: BaseLendingPosition } }
                for (const subAccountId of Object.keys(d.lendingPositions)) {
                    const byPool = d.lendingPositions[subAccountId]
                    const pos = byPool[poolId]
                    if (pos && (Number(pos.debt) !== 0 || Number(pos.deposits) !== 0)) {
                        userPosition = { ...userPosition, [subAccountId]: pos }
                        break
                    }
                }
            })

            result.push({
                chainId,
                lender,
                poolId,
                asset: poolData.asset as RawCurrency,
                poolData,
                userPosition, // will be undefined if no user data exists for this pool
            })
        }
    }

    return result
}
