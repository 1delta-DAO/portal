import { useQuery } from '@tanstack/react-query'
import type { RawCurrency } from '../../types/currency'
import { apiFetch } from '../../sdk/http'

interface PriceEntry {
  usd: number
}

type PriceData = Record<string, Record<string, PriceEntry>>

interface UsePriceQueryParams {
  currencies: RawCurrency[]
  enabled?: boolean
}

/**
 * Fetches USD prices for a list of currencies via the backend.
 * Returns nested record: chainId -> lowercase address -> { usd }.
 */
export function usePriceQuery({ currencies, enabled = true }: UsePriceQueryParams) {
  const assetsKey = currencies
    .map((c) => `${c.chainId}:${c.address.toLowerCase()}`)
    .sort()
    .join(',')

  return useQuery<PriceData>({
    queryKey: ['priceQuery', assetsKey],
    enabled: enabled && currencies.length > 0,
    queryFn: async () => {
      const byChain: Record<string, string[]> = {}
      for (const c of currencies) {
        const chain = c.chainId
        if (!byChain[chain]) byChain[chain] = []
        byChain[chain].push(c.address.toLowerCase())
      }

      const result: PriceData = {}

      await Promise.all(
        Object.entries(byChain).map(async ([chainId, addresses]) => {
          // One chain failing must not blank the whole price map — the other
          // chains' prices are still correct and still worth rendering. This
          // is the one place a swallowed error is intended; everywhere else
          // `apiFetch` throwing is what surfaces the failure.
          let items: unknown
          try {
            const data = await apiFetch<{ items?: unknown }>('/v1/data/token/prices', {
              params: { chainId, assets: addresses.join(',') },
            })
            items = data?.items
          } catch {
            return
          }

          const chainPrices: Record<string, PriceEntry> = {}
          if (items && typeof items === 'object') {
            if (Array.isArray(items)) {
              for (const item of items as {
                address: string
                priceUSD?: number
                price?: number
              }[]) {
                chainPrices[item.address.toLowerCase()] = { usd: item.priceUSD ?? item.price ?? 0 }
              }
            } else {
              // items is a Record<address, price>
              for (const [addr, price] of Object.entries(items)) {
                chainPrices[addr.toLowerCase()] = { usd: price as number }
              }
            }
          }
          result[chainId] = chainPrices
        })
      )

      return result
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}
