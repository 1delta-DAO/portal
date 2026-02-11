import { useState } from 'react'
import { Address, Hex, parseUnits } from 'viem'
import { useWalletClient, useChainId } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import type { PoolDataItem } from '../../../hooks/lending/usePoolData'
import {
  fetchLendingAction,
  type LendingActionResponse,
} from '../../../sdk/lending-helper/fetchLendingAction'
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
  const { data: signer } = useWalletClient()
  const walletChainId = useChainId()
  const queryClient = useQueryClient()

  /** Verify wallet is on the expected chain before sending any transaction */
  const assertChain = () => {
    if (chainId && walletChainId !== Number(chainId)) {
      throw new Error(
        `Wallet is on chain ${walletChainId} but expected chain ${chainId}. Please switch chains.`
      )
    }
  }

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
    if (!signer || !hasPermissions || permissionsCompleted >= permissions.length) return
    setExecutingPermission(true)
    setError(null)

    try {
      assertChain()
      const perm = permissions[permissionsCompleted]
      await signer.sendTransaction({
        to: perm.to as Address,
        data: perm.data as Hex,
        value: BigInt(perm.value ?? 0),
      })
      setPermissionsCompleted((prev) => prev + 1)
    } catch (e: any) {
      console.error('Permission tx failed:', e)
      setError(e.message ?? 'Permission transaction failed')
    } finally {
      setExecutingPermission(false)
    }
  }

  const executeMain = async () => {
    if (!signer || !result) return
    setExecutingMain(true)
    setError(null)

    try {
      assertChain()
      await signer.sendTransaction({
        to: result.transaction.to as Address,
        data: result.transaction.data as Hex,
        value: BigInt(result.transaction.value ?? 0),
      })

      // Invalidate all user-scoped queries for this chain after successful tx
      const cid = chainId ?? String(signer.chain.id)
      queryClient.invalidateQueries({ queryKey: ['userData', cid, account] })
      queryClient.invalidateQueries({ queryKey: ['tokenBalances', cid, account], exact: false })
      queryClient.invalidateQueries({ queryKey: ['lendingBalances', cid, account] })
    } catch (e: any) {
      console.error('Execution failed:', e)
      setError(e.message ?? 'Transaction failed')
    } finally {
      setExecutingMain(false)
    }
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
