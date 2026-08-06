import { useState, useCallback } from 'react'
import { Address, Hex } from 'viem'
import { useWalletClient } from 'wagmi'
import { useSyncChain } from './useSyncChain'
import { useLendingQueryRefresh } from './useLendingQueryRefresh'
import { getIndependentPublicClient } from '../lib/lib-utils'

export interface LendingTx {
  to: string
  data: string
  value: string
  /** Human label the backend attaches to permission / setup steps. */
  description?: string
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
  const { syncChain } = useSyncChain()
  const { refreshAfterTx } = useLendingQueryRefresh({ chainId, account })

  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => setError(null), [])

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
          value: BigInt(tx.value || 0),
        })

        try {
          const publicClient = getIndependentPublicClient(chainId)
          if (publicClient) {
            await publicClient.waitForTransactionReceipt({ hash, confirmations: 2, pollingInterval: 4_000 })
          }
        } catch (receiptErr) {
          // Receipt polling can fail on some RPCs; continue to invalidate anyway
          console.warn('Receipt polling failed:', receiptErr)
        }

        refreshAfterTx()
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
    [walletClient, chainId, syncChain, refreshAfterTx]
  )

  return { send, sending, error, clearError }
}
