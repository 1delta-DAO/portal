import { useQuery } from '@tanstack/react-query'
import { BACKEND_BASE_URL } from '../config/backend'

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
      const res = await fetch(`${BACKEND_BASE_URL}/v1/data/bridge/status?${qs}`)
      if (!res.ok) throw new Error(`status HTTP ${res.status}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error?.message ?? 'status failed')
      return json.data as BridgeStatusData
    },
  })
}
