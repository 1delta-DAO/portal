import { useQuery } from '@tanstack/react-query'
import type { TokenBalance } from './useTokenBalances'

import { BACKEND_BASE_URL } from '../../config/backend'

interface LendingBalancesApiResponse {
  ok: boolean
  chainId: string
  account: string
  count: number
  balances: TokenBalance[]
}

/**
 * Fetches wallet balances for tokens that are compatible with lending protocols.
 * Unlike useTokenBalances, this does not require specifying asset addresses upfront.
 */
export function useLendingBalances(params: {
  chainId: string
  account?: string
  enabled?: boolean
}) {
  const { chainId, account } = params
  const enabled = (params.enabled ?? true) && !!account

  const { data, isLoading, error } = useQuery<TokenBalance[]>({
    queryKey: ['lendingBalances', chainId, account],
    enabled,
    queryFn: async () => {
      const url =
        `${BACKEND_BASE_URL}/v1/data/token/balances/lending` +
        `?chainId=${chainId}` +
        `&account=${account}`

      const res = await fetch(url)
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Lending balances HTTP ${res.status}: ${text || res.statusText}`)
      }
      const json = (await res.json()) as LendingBalancesApiResponse
      if (!json.ok) {
        throw new Error('Lending balances API returned ok: false')
      }

      return json.balances
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })

  return {
    balances: data ?? [],
    isLoading,
    error,
  }
}
