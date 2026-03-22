import { useState, useEffect, useRef } from 'react'
import { parseUnits } from 'viem'
import type { PoolDataItem } from '../../../hooks/lending/usePoolData'
import type { UserSubAccount } from '../../../hooks/lending/useUserData'
import {
  fetchLendingAction,
  type LendingActionResponseWithSimulation,
  type LendingActionSimulation,
  type RateImpactEntry,
} from '../../../sdk/lending-helper/fetchLendingAction'
import { useSendLendingTransaction } from '../../../hooks/useSendLendingTransaction'
import { useDebounce } from '../../../hooks/useDebounce'
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
  /** Active sub-account — when provided, enables simulation via `simulate` param */
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
  const [txSuccess, setTxSuccess] = useState<{
    actionType: ActionType
    amount: string
    symbol: string
    hash?: string
  } | null>(null)

  const debouncedAmount = useDebounce(amount, 500)
  const fetchIdRef = useRef(0)
  const shouldSimulate = !!subAccount

  const permissions = result?.permissions ?? []
  const hasPermissions = permissions.length > 0
  const allPermissionsDone = hasPermissions && permissionsCompleted >= permissions.length
  const executing = executingPermission || executingMain
  const simulation: LendingActionSimulation | undefined = result?.simulation
  const rateImpact: RateImpactEntry[] | undefined = result?.rateImpact

  const resetState = () => {
    setResult(null)
    setError(null)
    setPermissionsCompleted(0)
    setTxSuccess(null)
    fetchIdRef.current++
  }

  const dismissSuccess = () => {
    setTxSuccess(null)
    setResult(null)
    setPermissionsCompleted(0)
  }

  // Auto-fetch when debounced inputs change
  useEffect(() => {
    if (!account || !pool) {
      setResult(null)
      setError(null)
      return
    }

    const parsedAmt = parseFloat(debouncedAmount || '0')
    if (parsedAmt <= 0 && !isAll) {
      setResult(null)
      setError(null)
      setLoading(false)
      return
    }

    const fetchId = ++fetchIdRef.current
    const decimals = pool.asset.decimals ?? 18

    const doFetch = async () => {
      setLoading(true)
      setError(null)
      setPermissionsCompleted(0)

      const parsedAmount = parseUnits(debouncedAmount || '0', decimals)

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
        simulate: shouldSimulate,
      })

      if (fetchIdRef.current !== fetchId) return

      setLoading(false)
      if (!response.success) {
        setError(response.error ?? 'Failed to fetch transaction data')
        return
      }
      setResult(response.data ?? null)
    }

    doFetch()
  }, [debouncedAmount, pool?.marketUid, account, isAll, payAsset, receiveAsset, accountId, actionType, shouldSimulate])

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
    if (!result || !pool) return
    setExecutingMain(true)
    setError(null)

    let lastHash: string | undefined
    for (const tx of result.transactions) {
      const { ok, error: txError, hash } = await send(tx)
      if (!ok) {
        setError(txError ?? 'Transaction failed')
        setExecutingMain(false)
        return
      }
      lastHash = hash
    }

    setExecutingMain(false)
    setTxSuccess({
      actionType,
      amount,
      symbol: pool.asset.symbol ?? '',
      hash: lastHash,
    })
  }

  return {
    result,
    simulation,
    rateImpact,
    loading,
    executing,
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
  }
}
