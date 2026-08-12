import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../sdk/http'

export interface BridgeStatusData {
  bridge: string
  status:
    | 'PENDING'
    | 'DONE'
    | 'FAILED'
    | 'TRANSFER_REFUNDED'
    | 'INVALID'
    | 'NOT_FOUND'
    | 'PARTIAL_SUCCESS'
  message?: string
  fromHash?: string
  /** Destination-chain tx hash when the tracker exposes it */
  toHash?: string
}

const TERMINAL = new Set(['DONE', 'FAILED', 'TRANSFER_REFUNDED', 'INVALID'])

/**
 * Polls GET /v1/data/bridge/status for a submitted x-chain transfer every
 * 10s until it reaches a terminal state. `NOT_FOUND` is normal right after
 * submission (tracker indexing lag) — polling continues through it.
 * Stargate trackers are pool-keyed, hence tokenIn/tokenOut.
 */
export function useBridgeStatus({
  bridge,
  fromChainId,
  toChainId,
  txHash,
  tokenIn,
  tokenOut,
  enabled = true,
}: {
  bridge?: string
  fromChainId?: string
  toChainId?: string
  txHash?: string
  tokenIn?: string
  tokenOut?: string
  enabled?: boolean
}) {
  return useQuery<BridgeStatusData>({
    queryKey: ['bridgeStatus', bridge, fromChainId, txHash],
    enabled: enabled && !!bridge && !!fromChainId && !!toChainId && !!txHash,
    refetchInterval: (query) => (TERMINAL.has(query.state.data?.status ?? '') ? false : 10_000),
    queryFn: async () => {
      const qs = new URLSearchParams({
        bridge: bridge!,
        fromChainId: fromChainId!,
        toChainId: toChainId!,
        txHash: txHash!,
      })
      if (tokenIn) qs.set('tokenIn', tokenIn)
      if (tokenOut) qs.set('tokenOut', tokenOut)
      return apiFetch<BridgeStatusData>('/v1/data/bridge/status', {
        params: { bridge, fromChainId, toChainId, txHash, tokenIn, tokenOut },
      })
    },
  })
}
