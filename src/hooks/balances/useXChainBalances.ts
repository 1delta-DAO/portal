import { useQuery } from '@tanstack/react-query'
import { useSpyAccount } from '../../contexts/SpyMode'
import { apiFetch } from '../../sdk/http'
import { executeRpcCallsWithRetry, type RpcCall } from '../lending/executeRpcCalls'

export interface XChainBalanceItem {
  address: string
  symbol: string
  name: string
  decimals: number
  balanceRaw: string
  balance: string
  priceUSD: number
  balanceUSD: number
}

export interface XChainBalances {
  /** chainId → non-zero balance items, USD-desc */
  chains: Record<string, XChainBalanceItem[]>
  /** chains whose RPC execution failed this round */
  missingChains: string[]
  totalUSD: number
}

// The backend returns { chainId, call: <full JSON-RPC object> } — the
// executor's toRpcBody unwraps that shape at runtime, but its RpcCall
// type only models the { to, data } descriptor, hence the cast below.
interface RpcCallEntry {
  chainId: string
  call: unknown
}

/**
 * Multi-chain main-token balances via the prepare/parse mechanic:
 *
 *  1. GET  /v1/data/token/balances/rpc-call?chains=…&account=…
 *     — the server scopes each chain to its curated `mainTokens`
 *       (full token lists can hold tens of thousands of entries; the
 *       curated set stays ~50-70 per chain), and returns one prepared
 *       eth_call per chain plus an rpcCallId
 *  2. execute each call client-side against the user's/public RPCs
 *     (with per-chain rotation on failure)
 *  3. POST /v1/data/token/balances/parse — server decodes + prices
 *
 * Chains whose RPC fails are simply reported in `missingChains`; the
 * rest still resolve.
 */
export function useXChainBalances({
  chains,
  enabled = true,
}: {
  chains: string[]
  enabled?: boolean
}) {
  const { address: account } = useSpyAccount()
  const chainsKey = [...chains].sort((a, b) => Number(a) - Number(b)).join(',')

  return useQuery<XChainBalances>({
    queryKey: ['xChainBalances', account, chainsKey],
    enabled: enabled && !!account && chains.length > 0,
    // No refetchInterval: every scan is one eth_call per chain against
    // public RPCs — refresh manually (card button) or after a swap.
    staleTime: 60_000,
    queryFn: async () => {
      // 1. prepare
      const { rpcCallId, rpcCalls } = await apiFetch<{
        rpcCallId: string
        rpcCalls: RpcCallEntry[]
      }>('/v1/data/token/balances/rpc-call', { params: { chains: chainsKey, account } })

      // 2. execute per chain in parallel; tolerate individual chain failures
      const settled = await Promise.allSettled(
        rpcCalls.map(async (entry) => {
          const [res] = await executeRpcCallsWithRetry(entry.chainId, [entry as unknown as RpcCall])
          return { chainId: entry.chainId, result: res.result }
        })
      )
      const rawResponses = settled
        .filter(
          (s): s is PromiseFulfilledResult<{ chainId: string; result: string }> =>
            s.status === 'fulfilled'
        )
        .map((s) => s.value)

      if (rawResponses.length === 0) throw new Error('All chain RPCs failed')

      // 3. parse
      const parsed = await apiFetch<{
        chains?: { chainId: string; items: XChainBalanceItem[] }[]
        missingChains?: string[]
      }>('/v1/data/token/balances/parse', { body: { rpcCallId, rawResponses } })

      const result: XChainBalances = { chains: {}, missingChains: [], totalUSD: 0 }
      for (const chain of parsed.chains ?? []) {
        const items = (chain.items as XChainBalanceItem[])
          .filter((i) => i.balanceRaw !== '0')
          .sort((a, b) => (b.balanceUSD ?? 0) - (a.balanceUSD ?? 0))
        if (items.length > 0) {
          result.chains[chain.chainId] = items
          result.totalUSD += items.reduce((a, i) => a + (i.balanceUSD ?? 0), 0)
        }
      }
      result.missingChains = parsed.missingChains ?? []
      return result
    },
  })
}
