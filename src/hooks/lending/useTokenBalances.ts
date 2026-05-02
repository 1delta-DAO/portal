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
  success: boolean
  data: {
    chainId: string
    account: string
    count: number
    items: TokenBalance[]
  }
  error?: { code: string; message: string }
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
      if (!json.success) {
        throw new Error(json.error?.message ?? 'Balances API returned success: false')
      }

      const map = new Map<string, TokenBalance>()
      for (const bal of json.data.items) {
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
