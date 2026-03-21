import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import type { RawCurrency } from '../../types/currency'
import { BACKEND_BASE_URL } from '../../config/backend'

export interface BalanceEntry {
  value: number
  raw?: string
  balanceUSD: number
  priceUSD: number
}

type BalanceData = Record<string, Record<string, BalanceEntry>>

interface UseBalanceQueryParams {
  currencies: RawCurrency[]
  enabled?: boolean
}

/**
 * Fetches native/ERC-20 balances for a list of currencies via the backend.
 * Returns nested record: chainId -> lowercase address -> { value, raw }.
 */
export function useBalanceQuery({ currencies, enabled = true }: UseBalanceQueryParams) {
  const { address: account } = useAccount()

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
          const url =
            `${BACKEND_BASE_URL}/v1/data/token/balances` +
            `?chainId=${chainId}` +
            `&account=${account}` +
            `&assets=${encodeURIComponent(addresses.join(','))}`

          const res = await fetch(url)
          if (!res.ok) return

          const json = await res.json()
          if (!json.success) return

          const chainBalances: Record<string, BalanceEntry> = {}
          for (const item of json.data?.items ?? []) {
            const balVal = parseFloat(item.balance || '0')
            const balUSD = item.balanceUSD ?? 0
            chainBalances[item.address.toLowerCase()] = {
              value: balVal,
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
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}
