// src/utils/flattenLenderDataWithUser.ts
import type { RawCurrency } from '@1delta/lib-utils'
import type { BalanceData, AprData, UserConfig } from '@1delta/margin-fetcher'
import type {
  UserDataResult,
  LenderUserDataEntry,
  UserPositionEntry,
} from './useUserData'
import { LenderData, PoolDataItem } from './usePoolData'

/**
 * One flattened entry: a single pool for a specific chain & lender,
 * plus the *per-pool* user position if it exists.
 */
export interface FlattenedPoolWithUserData {
  chainId: string
  lender: string
  marketUid: string
  asset: RawCurrency
  poolData: PoolDataItem
  /** The user's position for this pool (if any), keyed by sub-account ID */
  userPosition?: { [accountId: string]: UserPositionEntry }
}

export type PositionTotals = {
  [lender: string]: { [subAccount: string]: { balanceData: BalanceData; aprData: AprData } }
}

export type UserConfigs = { [lender: string]: { [subAccount: string]: UserConfig } }

/** Extract actual position objects from the positions array (INIT has a leading number) */
function extractPositions(positions: (UserPositionEntry | number)[]): UserPositionEntry[] {
  return positions.filter((p): p is UserPositionEntry => typeof p === 'object' && p !== null)
}

/**
 * Flattens LenderData for a single chain and attaches per-pool user data
 * from UserDataResult.raw. If a user position does not exist for a pool,
 * userPosition will be undefined.
 */
export function flattenLenderDataWithUser(
  lenderData: LenderData,
  userDataResult: UserDataResult | undefined,
  chainId: string
): {
  result: FlattenedPoolWithUserData[]
  positionTotals: PositionTotals
  userConfigs: UserConfigs
} {
  const result: FlattenedPoolWithUserData[] = []

  // Build a lender->entry map from the flat array, filtering by chainId
  const userDataForChain = new Map<string, LenderUserDataEntry>()
  if (userDataResult?.raw) {
    for (const entry of userDataResult.raw) {
      if (entry.chainId === chainId) {
        userDataForChain.set(entry.lender, entry)
      }
    }
  }

  let positionTotals: PositionTotals = {}
  let userConfigs: UserConfigs = {}

  for (const [lender, pools] of Object.entries(lenderData)) {
    const lenderUserData: LenderUserDataEntry | undefined = userDataForChain.get(lender)

    // Build a lookup: marketUid -> { [subAccountId]: UserPositionEntry }
    const positionsByPool: { [marketUid: string]: { [subAccountId: string]: UserPositionEntry } } = {}

    if (lenderUserData) {
      for (const sub of lenderUserData.data) {
        const positions = extractPositions(sub.positions)
        for (const pos of positions) {
          if (Number(pos.deposits) !== 0 || Number(pos.debt) !== 0) {
            if (!positionsByPool[pos.marketUid]) positionsByPool[pos.marketUid] = {}
            positionsByPool[pos.marketUid][sub.accountId] = pos
          }
        }

        // collect totals if nav nonzero
        if (sub.balanceData.nav !== 0) {
          if (!positionTotals[lender]) positionTotals[lender] = {}
          positionTotals[lender][sub.accountId] = {
            balanceData: sub.balanceData as unknown as BalanceData,
            aprData: sub.aprData as unknown as AprData,
          }
        }

        // collect config
        if (!userConfigs[lender]) userConfigs[lender] = {}
        userConfigs[lender][sub.accountId] = sub.userConfig as unknown as UserConfig
      }
    }

    for (const poolData of pools) {
      result.push({
        chainId,
        lender,
        marketUid: poolData.marketUid,
        asset: poolData.asset as RawCurrency,
        poolData,
        userPosition: positionsByPool[poolData.marketUid],
      })
    }
  }

  return { result, positionTotals, userConfigs }
}
