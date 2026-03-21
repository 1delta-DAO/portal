import { useQuery } from '@tanstack/react-query'
import type { RawCurrency } from '../../types/currency'
import { BACKEND_BASE_URL } from '../../config/backend'

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
          const url =
            `${BACKEND_BASE_URL}/v1/data/token/prices` +
            `?chainId=${chainId}` +
            `&assets=${encodeURIComponent(addresses.join(','))}`

          const res = await fetch(url)
          if (!res.ok) return

          const json = await res.json()
          if (!json.success) return

          const chainPrices: Record<string, PriceEntry> = {}
          for (const item of json.data?.items ?? []) {
            chainPrices[item.address.toLowerCase()] = { usd: item.priceUSD ?? item.price ?? 0 }
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
