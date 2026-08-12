import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '../../sdk/http'

export interface TokenBalance {
  address: string
  symbol: string
  name: string
  decimals: number
  balanceRaw: string
  balance: string
  balanceUSD: number
}

interface BalancesData {
  chainId: string
  account: string
  count: number
  items: TokenBalance[]
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

  const { data, isLoading, isFetching, error, refetch } = useQuery<Map<string, TokenBalance>>({
    queryKey: ['tokenBalances', chainId, account, assetsKey],
    enabled,
    queryFn: async () => {
      // Hard guard — never hit the endpoint with an empty assets list. The
      // `enabled` flag should already prevent this, but a stale `refetch()`
      // call could otherwise produce a `?assets=` URL that 4xx's.
      if (assets.length === 0 || !account) {
        return new Map<string, TokenBalance>()
      }

      const data = await apiFetch<BalancesData>('/v1/data/token/balances', {
        params: { chainId, account, assets: assets.join(',') },
      })

      const map = new Map<string, TokenBalance>()
      for (const bal of data.items) {
        map.set(bal.address.toLowerCase(), bal)
      }
      return map
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  })

  return {
    balances: data ?? new Map<string, TokenBalance>(),
    isBalancesLoading: isLoading,
    isBalancesFetching: isFetching,
    balancesError: error,
    refetchBalances: refetch,
  }
}
