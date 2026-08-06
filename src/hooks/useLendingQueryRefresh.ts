import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * The post-transaction data-refresh cadence, shared by every send path
 * (single transaction and EIP-5792 atomic batch alike).
 *
 * Invalidate immediately so anything mounted refetches, then force two delayed
 * refetches — the backend indexes a block or two behind the receipt, so an
 * immediate refetch alone often reads pre-transaction state.
 */
export function useLendingQueryRefresh(params: { chainId: string; account?: string }) {
  const { chainId, account } = params
  const queryClient = useQueryClient()

  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['userData', chainId, account] })
    queryClient.invalidateQueries({
      queryKey: ['tokenBalances', chainId, account],
      exact: false,
    })
    queryClient.invalidateQueries({ queryKey: ['lendingBalances', chainId, account] })
    queryClient.invalidateQueries({
      queryKey: ['userVaults', chainId, account],
      exact: false,
    })
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
      queryKey: ['userVaults', chainId, account],
      exact: false,
    })
    queryClient.refetchQueries({
      queryKey: ['balanceQuery', account],
      exact: false,
    })
  }, [queryClient, chainId, account])

  /** Invalidate now, then force refetch after 4s / 10s to catch indexing lag. */
  const refreshAfterTx = useCallback(() => {
    invalidateQueries()
    setTimeout(refetchQueries, 4_000)
    setTimeout(refetchQueries, 10_000)
  }, [invalidateQueries, refetchQueries])

  return { invalidateQueries, refetchQueries, refreshAfterTx }
}
