import { useState, useCallback } from 'react'
import { Address, Hex } from 'viem'
import { useWalletClient, usePublicClient } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { useSyncChain } from './useSyncChain'

export interface LendingTx {
  to: string
  data: string
  value: string
}

interface SendResult {
  ok: boolean
  error?: string
  hash?: string
}

export function useSendLendingTransaction(params: {
  chainId: string
  account?: string
}) {
  const { chainId, account } = params
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()
  const { syncChain } = useSyncChain()

  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => setError(null), [])

  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['userData', chainId, account] })
    queryClient.invalidateQueries({
      queryKey: ['tokenBalances', chainId, account],
      exact: false,
    })
    queryClient.invalidateQueries({ queryKey: ['lendingBalances', chainId, account] })
    queryClient.invalidateQueries({
      queryKey: ['balanceQuery', account],
      exact: false,
    })
  }, [queryClient, chainId, account])

  /** Force refetch (bypasses staleTime, always hits network) */
  const refetchQueries = useCallback(() => {
    queryClient.refetchQueries({ queryKey: ['userData', chainId, account] })
    queryClient.refetchQueries({
      queryKey: ['tokenBalances', chainId, account],
      exact: false,
    })
    queryClient.refetchQueries({ queryKey: ['lendingBalances', chainId, account] })
    queryClient.refetchQueries({
      queryKey: ['balanceQuery', account],
      exact: false,
    })
  }, [queryClient, chainId, account])

  const send = useCallback(
    async (tx: LendingTx): Promise<SendResult> => {
      if (!walletClient) {
        const msg = 'Wallet not connected'
        setError(msg)
        return { ok: false, error: msg }
      }

      setSending(true)
      setError(null)

      try {
        const synced = await syncChain(Number(chainId))
        if (!synced) {
          const msg = `Failed to switch to chain ${chainId}`
          setError(msg)
          return { ok: false, error: msg }
        }

        const hash = await walletClient.sendTransaction({
          to: tx.to as Address,
          data: tx.data as Hex,
          value: BigInt(tx.value ?? 0),
        })

        try {
          if (publicClient) {
            await publicClient.waitForTransactionReceipt({ hash, confirmations: 2, pollingInterval: 4_000 })
          }
        } catch (receiptErr) {
          // Receipt polling can fail on some RPCs; continue to invalidate anyway
          console.warn('Receipt polling failed:', receiptErr)
        }

        // Invalidate immediately, then force refetch after delays to catch backend indexing lag
        invalidateQueries()
        setTimeout(refetchQueries, 4_000)
        setTimeout(refetchQueries, 10_000)
        return { ok: true, hash }
      } catch (e: any) {
        const msg = e.shortMessage ?? e.message ?? 'Transaction failed'
        console.error('Transaction failed:', e)
        setError(msg)
        return { ok: false, error: msg }
      } finally {
        setSending(false)
      }
    },
    [walletClient, publicClient, chainId, syncChain, invalidateQueries]
  )

  return { send, sending, error, clearError }
}
