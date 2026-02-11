import { useState } from 'react'
import { parseUnits } from 'viem'
import type { PoolDataItem } from '../../../hooks/lending/usePoolData'
import {
  fetchLendingAction,
  type LendingActionResponse,
} from '../../../sdk/lending-helper/fetchLendingAction'
import { useSendLendingTransaction } from '../../../hooks/useSendLendingTransaction'
import type { ActionType } from './types'

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
}) {
  const { actionType, pool, account, amount, isAll, payAsset, receiveAsset, accountId, chainId } =
    params
  const { send } = useSendLendingTransaction({ chainId: chainId ?? '', account })

  const [result, setResult] = useState<LendingActionResponse | null>(null)
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
    console.log('pool', pool)
    const response = await fetchLendingAction({
      marketUid: pool.marketUid,
      operator: account,
      amount: parsedAmount.toString(),
      actionType,
      receiver: account,
      isAll: isAll || undefined,
      payAsset,
      receiveAsset,
      accountId,
    })

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
