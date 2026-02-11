import { useQuery } from '@tanstack/react-query'

import { BACKEND_BASE_URL } from '../../config/backend'

export interface TokenBalance {
  address: string
  symbol: string
  name: string
  decimals: number
  balanceRaw: string
  balance: string
  balanceUSD: number
}

interface BalancesApiResponse {
  ok: boolean
  chainId: string
  account: string
  count: number
  balances: TokenBalance[]
}

/**
 * Fetches wallet token balances for a list of asset addresses.
 * Returns a Map keyed by lowercase address for easy lookup.
 */
export function useTokenBalances(params: {
  chainId: string
  account?: string
  assets: string[]
  enabled?: boolean
}) {
  const { chainId, account, assets } = params
  const enabled = (params.enabled ?? true) && !!account && assets.length > 0

  // Stable key from sorted assets to avoid refetches on reorder
  const assetsKey = [...assets].sort().join(',')

  const { data, isLoading, error } = useQuery<Map<string, TokenBalance>>({
    queryKey: ['tokenBalances', chainId, account, assetsKey],
    enabled,
    queryFn: async () => {
      const url =
        `${BACKEND_BASE_URL}/v1/data/token/balances` +
        `?chainId=${chainId}` +
        `&account=${account}` +
        `&assets=${encodeURIComponent(assets.join(','))}`

      const res = await fetch(url)
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Balances HTTP ${res.status}: ${text || res.statusText}`)
      }
      const json = (await res.json()) as BalancesApiResponse
      if (!json.ok) {
        throw new Error('Balances API returned ok: false')
      }

      const map = new Map<string, TokenBalance>()
      for (const bal of json.balances) {
        map.set(bal.address.toLowerCase(), bal)
      }
      return map
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })

  return {
    balances: data ?? new Map<string, TokenBalance>(),
    isBalancesLoading: isLoading,
    balancesError: error,
  }
}
