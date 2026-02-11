import { useState } from 'react'
import { parseUnits } from 'viem'
import type { PoolDataItem } from '../../../hooks/lending/usePoolData'
import type { UserSubAccount } from '../../../hooks/lending/useUserData'
import {
  fetchLendingAction,
  fetchLendingActionWithSimulation,
  type LendingActionBody,
  type LendingActionResponseWithSimulation,
  type LendingActionSimulation,
} from '../../../sdk/lending-helper/fetchLendingAction'
import { useSendLendingTransaction } from '../../../hooks/useSendLendingTransaction'
import type { ActionType } from './types'

function buildSimulationBody(sub: UserSubAccount): LendingActionBody {
  const bd = sub.balanceData
  const ad = sub.aprData
  return {
    balanceData: {
      deposits: bd.deposits,
      debt: bd.debt,
      adjustedDebt: bd.adjustedDebt,
      collateral: bd.collateral,
      collateralAllActive: bd.collateralAllActive,
      borrowDiscountedCollateral: bd.borrowDiscountedCollateral,
      borrowDiscountedCollateralAllActive: bd.borrowDiscountedCollateralAllActive,
      nav: bd.nav,
      deposits24h: bd.deposits24h,
      debt24h: bd.debt24h,
      nav24h: bd.nav24h,
      rewards: bd.rewards,
    },
    aprData: {
      apr: ad.apr,
      depositApr: ad.depositApr,
      borrowApr: ad.borrowApr,
      rewardApr: ad.rewardApr,
      rewardDepositApr: ad.rewardDepositApr,
      rewardBorrowApr: ad.rewardBorrowApr,
      intrinsicApr: ad.stakingApr,
      intrinsicDepositApr: ad.stakingDepositApr,
      intrinsicBorrowApr: ad.stakingBorrowApr,
      rewards: ad.rewards,
    },
    modeId: sub.userConfig.selectedMode,
  }
}

export function useActionExecution(params: {
  actionType: ActionType
  pool: PoolDataItem | null
  account?: string
  amount: string
  isAll: boolean
  /** For Deposit / Repay: address of the token to pay with */
  payAsset?: string
  /** For Withdraw / Borrow: address of the token to receive */
  receiveAsset?: string
  /** Sub-account ID for multi-account lenders */
  accountId?: string
  /** Chain ID string for query invalidation */
  chainId?: string
  /** Active sub-account — when provided, uses POST for simulation */
  subAccount?: UserSubAccount
}) {
  const { actionType, pool, account, amount, isAll, payAsset, receiveAsset, accountId, chainId, subAccount } =
    params
  const { send } = useSendLendingTransaction({ chainId: chainId ?? '', account })

  const [result, setResult] = useState<LendingActionResponseWithSimulation | null>(null)
  const [loading, setLoading] = useState(false)
  const [executingPermission, setExecutingPermission] = useState(false)
  const [executingMain, setExecutingMain] = useState(false)
  /** Number of permissions that have been successfully executed */
  const [permissionsCompleted, setPermissionsCompleted] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const permissions = result?.permissions ?? []
  const hasPermissions = permissions.length > 0
  const allPermissionsDone = hasPermissions && permissionsCompleted >= permissions.length
  const executing = executingPermission || executingMain
  const simulation: LendingActionSimulation | undefined = result?.simulation

  const resetState = () => {
    setResult(null)
    setError(null)
    setPermissionsCompleted(0)
  }

  const fetchAction = async () => {
    if (!account || !pool) return
    setLoading(true)
    setError(null)
    setResult(null)
    setPermissionsCompleted(0)

    const decimals = pool.asset.decimals ?? 18
    const parsedAmount = parseUnits(amount || '0', decimals)

    const actionParams = {
      marketUid: pool.marketUid,
      operator: account,
      amount: parsedAmount.toString(),
      actionType,
      receiver: account,
      isAll: isAll || undefined,
      payAsset,
      receiveAsset,
      accountId,
    }

    const response = subAccount
      ? await fetchLendingActionWithSimulation(actionParams, buildSimulationBody(subAccount))
      : await fetchLendingAction(actionParams)

    setLoading(false)
    if (!response.success) {
      setError(response.error ?? 'Failed to fetch transaction data')
      return
    }
    setResult(response.data ?? null)
  }

  /** Execute the next pending permission transaction */
  const executeNextPermission = async () => {
    if (!hasPermissions || permissionsCompleted >= permissions.length) return
    setExecutingPermission(true)
    setError(null)

    const perm = permissions[permissionsCompleted]
    const { ok, error: txError } = await send(perm)
    if (ok) {
      setPermissionsCompleted((prev) => prev + 1)
    } else {
      setError(txError ?? 'Permission transaction failed')
    }
    setExecutingPermission(false)
  }

  const executeMain = async () => {
    if (!result) return
    setExecutingMain(true)
    setError(null)

    const { ok, error: txError } = await send(result.transaction)
    if (!ok) {
      setError(txError ?? 'Transaction failed')
    }
    setExecutingMain(false)
  }

  return {
    result,
    simulation,
    loading,
    executing,
    executingPermission,
    executingMain,
    permissions,
    hasPermissions,
    permissionsCompleted,
    allPermissionsDone,
    error,
    fetchAction,
    executeNextPermission,
    executeMain,
    resetState,
  }
}
