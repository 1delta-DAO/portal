import { createPublicClient, http, fallback, type PublicClient } from 'viem'
import { LIST_OVERRIDES } from '@1delta/providers'
import { evmChainWagmi } from '../../wagmi'

const clientCache = new Map<string, PublicClient>()

/**
 * Returns a viem PublicClient for the given chain that is independent of wagmi's
 * transports. RPC URLs come from `LIST_OVERRIDES` and are wrapped in viem's
 * `fallback` transport so failing endpoints rotate automatically — avoiding the
 * problem where wagmi's default mainnet client hammers `eth.merkle.io` (which
 * returns CORS errors in the browser) without rotation.
 */
export function getIndependentPublicClient(chainId: string): PublicClient | null {
  const cached = clientCache.get(chainId)
  if (cached) return cached

  const chain = evmChainWagmi.find((c) => String(c.id) === chainId)
  if (!chain) return null

  const urls = LIST_OVERRIDES[chainId] ?? []
  if (urls.length === 0) return null

  const client = createPublicClient({
    chain,
    transport: fallback(
      urls.map((u) => http(u, { batch: true, retryCount: 1 })),
      { rank: false, retryCount: 2 }
    ),
  }) as PublicClient

  clientCache.set(chainId, client)
  return client
}
