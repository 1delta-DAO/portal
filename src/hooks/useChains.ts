import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../sdk/http'
import { getChainName } from '../lib/lib-utils'
import { chainLogoUrl } from '../config/assets'

export interface ChainMeta {
  chainId: string
  name: string
  logoURI: string
}

interface ChainsData {
  count: number
  items: unknown[]
}

const enrich = (chainId: string): ChainMeta => ({
  chainId,
  name: getChainName(chainId),
  logoURI: chainLogoUrl(chainId),
})

const DEFAULT_CHAINS: ChainMeta[] = [enrich('1')]

const isChainMeta = (v: unknown): v is ChainMeta =>
  typeof v === 'object' && v !== null && 'chainId' in v

export function useChains(): { chains: ChainMeta[]; isLoading: boolean } {
  const { data, isLoading } = useQuery<ChainMeta[]>({
    queryKey: ['chains'],
    queryFn: async () => {
      const data = await apiFetch<ChainsData>('/v1/data/chains')
      const items = data?.items
      if (!Array.isArray(items)) return DEFAULT_CHAINS

      return items.map((item) => {
        if (typeof item === 'string') return enrich(item)
        if (isChainMeta(item)) {
          return {
            chainId: String(item.chainId),
            name: item.name ?? getChainName(String(item.chainId)),
            logoURI: item.logoURI ?? chainLogoUrl(item.chainId),
          }
        }
        return enrich(String(item))
      })
    },
    staleTime: 5 * 60_000,
  })

  return { chains: data ?? DEFAULT_CHAINS, isLoading }
}
