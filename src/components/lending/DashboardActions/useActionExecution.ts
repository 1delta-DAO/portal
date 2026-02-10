import { useState } from 'react'
import { Address, Hex, parseUnits } from 'viem'
import { useWalletClient } from 'wagmi'
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
  const { actionType, pool, account, amount, isAll, payAsset, receiveAsset, accountId, chainId } = params
  const { data: signer } = useWalletClient()
  const queryClient = useQueryClient()

  const [result, setResult] = useState<LendingActionResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetState = () => {
    setResult(null)
    setError(null)
  }

  const fetchAction = async () => {
    if (!account || !pool) return
    setLoading(true)
    setError(null)
    setResult(null)

    const decimals = pool.asset.decimals ?? 18
    const parsedAmount = parseUnits(amount || '0', decimals)

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

  const execute = async () => {
    if (!signer || !result) return
    setExecuting(true)
    setError(null)

    try {
      if (result.permission) {
        await signer.sendTransaction({
          to: result.permission.to as Address,
          data: result.permission.data as Hex,
          value: BigInt(result.permission.value ?? 0),
        })
      }
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
      setExecuting(false)
    }
  }

  return { result, loading, executing, error, fetchAction, execute, resetState }
}
