import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../sdk/http'

interface ChainData {
  nativeCurrency?: { symbol: string; name: string; decimals: number }
}

interface ChainRegistryEntry {
  chainId: string
  data: ChainData
}

type ChainsRegistry = Record<string, ChainRegistryEntry>

/**
 * Fetches chain registry data (native currency info, etc.).
 * Falls back to empty object if unavailable.
 */
export function useChainsRegistry() {
  const { data, isLoading } = useQuery<ChainsRegistry>({
    queryKey: ['chainsRegistry'],
    queryFn: async () => {
      const data = await apiFetch<{
        items?: string[]
        chainData?: Record<string, ChainData>
      }>('/v1/data/chains')
      const registry: ChainsRegistry = {}
      for (const chainId of data?.items ?? []) {
        registry[chainId] = { chainId, data: data.chainData?.[chainId] ?? {} }
      }
      return registry
    },
    staleTime: 5 * 60_000,
  })

  return { data: data ?? {}, isLoading }
}
