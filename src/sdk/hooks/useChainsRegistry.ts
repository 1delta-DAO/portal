import { useQuery } from '@tanstack/react-query'
import { BACKEND_BASE_URL } from '../../config/backend'

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
      const res = await fetch(`${BACKEND_BASE_URL}/v1/data/chains`)
      const json = await res.json()
      if (!json.success) return {}
      const registry: ChainsRegistry = {}
      if (Array.isArray(json.data?.items)) {
        for (const chainId of json.data.items) {
          registry[chainId] = {
            chainId,
            data: json.data.chainData?.[chainId] ?? {},
          }
        }
      }
      return registry
    },
    staleTime: 5 * 60_000,
  })

  return { data: data ?? {}, isLoading }
}
