import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchVaultAction,
  fetchVaultWithdrawals,
  vaultFamily,
  type VaultActionVerb,
  type VaultProvider,
  type VaultWithdrawalRequest,
} from '../../sdk/vaults-helper'
import { useSendLendingTransaction } from '../useSendLendingTransaction'

export interface UseVaultWithdrawalsParams {
  chainId?: string
  account?: string
  enabled?: boolean
}

export interface UseVaultWithdrawalsResult {
  requests: VaultWithdrawalRequest[]
  isLoading: boolean
  isFetching: boolean
  error: Error | null
  refetch: () => void
}

/**
 * Lists the user's pending/claimable async-vault withdrawals (lst, gmx,
 * lagoon). Polls on the same cadence as positions so a request flips to
 * "claimable" without a manual refresh.
 */
export function useVaultWithdrawals(
  params: UseVaultWithdrawalsParams
): UseVaultWithdrawalsResult {
  const { chainId, account, enabled = true } = params
  const queryEnabled = enabled && !!chainId && !!account

  const { data, isLoading, isFetching, error, refetch } = useQuery<
    VaultWithdrawalRequest[]
  >({
    queryKey: ['vaultWithdrawals', chainId ?? '', account ?? ''],
    enabled: queryEnabled,
    queryFn: async () => {
      if (!chainId || !account) return []
      const res = await fetchVaultWithdrawals({ chainId, account })
      if (!res.success) throw new Error(res.error ?? 'Failed to load withdrawals')
      return res.requests ?? []
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  return {
    requests: data ?? [],
    isLoading,
    isFetching,
    error: error as Error | null,
    refetch,
  }
}

/**
 * The protocol-native reference fields a withdrawal request carries, forwarded
 * verbatim into the claim/cancel builder. Kept loose because each protocol uses
 * a different subset.
 */
function refFromRequest(
  req: VaultWithdrawalRequest
): Record<string, string | number | undefined> {
  return {
    requestId: req.requestId,
    requestIds: req.requestIds,
    hints: req.hints,
    amounts: req.amounts,
    tokenId: req.tokenId,
    id: req.id,
    shares: req.shares,
    assets: req.assets,
    controller: req.controller,
    user: req.user,
    recipient: req.recipient,
    outputAsset: req.outputAsset,
  }
}

export interface UseVaultRequestActionParams {
  chainId: string
  account?: string
}

export interface UseVaultRequestActionResult {
  /** Build + run a claim/cancel for one request, in strict step order. */
  run: (
    verb: Extract<VaultActionVerb, 'claim' | 'cancel'>,
    provider: VaultProvider,
    req: VaultWithdrawalRequest
  ) => Promise<boolean>
  busyKey: string | null
  error: string | null
  reset: () => void
}

/** Stable per-request key so the UI can show a spinner on the row being acted on. */
export function withdrawalKey(req: VaultWithdrawalRequest): string {
  return `${req.lst}:${req.requestId ?? req.tokenId ?? req.id ?? ''}`
}

/**
 * Imperative runner for the claim/cancel half of the async withdrawal lifecycle.
 * Builds the calldata from a `/withdrawals` entry and sends permissions →
 * transactions → postTransactions in order.
 */
export function useVaultRequestAction(
  params: UseVaultRequestActionParams
): UseVaultRequestActionResult {
  const { chainId, account } = params
  const { send } = useSendLendingTransaction({ chainId, account })
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => setError(null), [])

  const run = useCallback(
    async (
      verb: Extract<VaultActionVerb, 'claim' | 'cancel'>,
      provider: VaultProvider,
      req: VaultWithdrawalRequest
    ): Promise<boolean> => {
      if (!account) {
        setError('Connect a wallet to continue')
        return false
      }
      // Async lifecycle only exists for these families; guard against misuse.
      const family = vaultFamily(provider)
      if (family !== 'lst' && family !== 'gmx' && family !== 'lagoon') {
        setError(`${provider} has no claimable withdrawals`)
        return false
      }

      setBusyKey(withdrawalKey(req))
      setError(null)
      try {
        const built = await fetchVaultAction({
          verb,
          provider,
          chainId,
          vault: req.lst,
          operator: account,
          ref: refFromRequest(req),
        })
        if (!built.success || !built.data) {
          setError(built.error ?? 'Failed to build transaction')
          return false
        }

        const steps = [
          ...built.data.permissions,
          ...built.data.transactions,
          ...built.data.postTransactions,
        ]
        for (const tx of steps) {
          const { ok, error: txError } = await send(tx)
          if (!ok) {
            setError(txError ?? 'Transaction failed')
            return false
          }
        }
        return true
      } catch (err: any) {
        setError(err?.message ?? 'Unknown error')
        return false
      } finally {
        setBusyKey(null)
      }
    },
    [account, chainId, send]
  )

  return { run, busyKey, error, reset }
}
