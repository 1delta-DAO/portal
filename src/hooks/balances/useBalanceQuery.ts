import { useQuery } from '@tanstack/react-query'
import { useSpyAccount } from '../../contexts/SpyMode'
import type { RawCurrency } from '../../types/currency'
import { apiFetch } from '../../sdk/http'

export interface BalanceEntry {
  value: number
  /** Human-readable balance string (e.g. "1.5") — preserves full precision */
  balance: string
  raw?: string
  balanceUSD: number
  priceUSD: number
}

type BalanceData = Record<string, Record<string, BalanceEntry>>

/** One row as the balances endpoint serves it. */
interface BalanceItem {
  address: string
  balance?: string
  balanceRaw?: string
  balanceUSD?: number
  priceUSD?: number
}

interface UseBalanceQueryParams {
  currencies: RawCurrency[]
  enabled?: boolean
}

/**
 * Fetches native/ERC-20 balances for a list of currencies via the backend.
 * Returns nested record: chainId -> lowercase address -> { value, raw }.
 */
export function useBalanceQuery({ currencies, enabled = true }: UseBalanceQueryParams) {
  const { address: account } = useSpyAccount()

  const assetsKey = currencies
    .map((c) => `${c.chainId}:${c.address.toLowerCase()}`)
    .sort()
    .join(',')

  return useQuery<BalanceData>({
    queryKey: ['balanceQuery', account, assetsKey],
    enabled: enabled && !!account && currencies.length > 0,
    queryFn: async () => {
      // Group by chain
      const byChain: Record<string, string[]> = {}
      for (const c of currencies) {
        const chain = c.chainId
        if (!byChain[chain]) byChain[chain] = []
        byChain[chain].push(c.address.toLowerCase())
      }

      const result: BalanceData = {}

      await Promise.all(
        Object.entries(byChain).map(async ([chainId, addresses]) => {
          // Partial results are useful here: one chain's RPC being down should
          // not hide the balances we did get. Deliberate, unlike the silent
          // `return` this replaced — see the same note in usePriceQuery.
          let items: BalanceItem[] = []
          try {
            const data = await apiFetch<{ items?: BalanceItem[] }>('/v1/data/token/balances', {
              params: { chainId, account, assets: addresses.join(',') },
            })
            items = data?.items ?? []
          } catch {
            return
          }

          const chainBalances: Record<string, BalanceEntry> = {}
          for (const item of items) {
            const balStr: string = item.balance || '0'
            const balVal = parseFloat(balStr)
            const balUSD = item.balanceUSD ?? 0
            chainBalances[item.address.toLowerCase()] = {
              value: balVal,
              balance: balStr,
              raw: item.balanceRaw,
              balanceUSD: balUSD,
              priceUSD: item.priceUSD ?? (balVal > 0 ? balUSD / balVal : 0),
            }
          }
          result[chainId] = chainBalances
        })
      )

      return result
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}
