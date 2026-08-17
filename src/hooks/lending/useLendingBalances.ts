import { useCallback, useMemo } from 'react'
import { useQueries, type UseQueryResult } from '@tanstack/react-query'
import type { TokenBalance } from './useTokenBalances'

import { apiFetch } from '../../sdk/http'

interface LendingBalancesData {
  chainId: string
  account: string
  count: number
  items: TokenBalance[]
}

/** A lending-compatible wallet balance, tagged with the chain it sits on. */
export interface ChainTokenBalance extends TokenBalance {
  chainId: string
}

async function fetchLendingBalances(
  chainId: string,
  account: string
): Promise<ChainTokenBalance[]> {
  const data = await apiFetch<LendingBalancesData>('/v1/data/token/balances/lending', {
    params: { chainId, account },
  })

  // The endpoint echoes one chainId for the whole payload; stamp it per item so
  // merged multi-chain lists can tell rows apart and act on the right chain.
  return data.items.map((item) => ({ ...item, chainId }))
}

const BALANCES_QUERY_OPTIONS = {
  staleTime: 30_000,
  refetchInterval: 60_000,
  retry: 1,
  refetchOnWindowFocus: false,
} as const

/**
 * Wallet balances for tokens that are compatible with lending protocols.
 * Unlike `useTokenBalances`, this does not require specifying asset addresses
 * upfront.
 *
 * `/token/balances/lending` is single-chain — passing a CSV returns
 * `INTERNAL_ERROR` — so this fans out one request per chain. Each chain is its
 * own query, so a chain that fails only removes its own rows and adding a
 * chain to the selection doesn't refetch the others. For a single chain, pass
 * a one-element `chainIds`.
 */
export function useLendingBalancesMultiChain(params: {
  chainIds: string[]
  account?: string
  enabled?: boolean
}) {
  const { account } = params
  const enabled = (params.enabled ?? true) && !!account && params.chainIds.length > 0
  const sortedChainIds = useMemo(() => [...params.chainIds].sort(), [params.chainIds])

  // `combine`, not a `useMemo` over the results array — `useQueries` hands back
  // a new array identity every render, so the memo would never hit. Same
  // reasoning as `useFlattenedPoolsMultiChain`.
  const combine = useCallback(
    (results: UseQueryResult<ChainTokenBalance[]>[]) => {
      const balances: ChainTokenBalance[] = []
      const failedChains: string[] = []

      results.forEach((r, i) => {
        if (r.error) {
          failedChains.push(sortedChainIds[i])
          return
        }
        if (r.data) balances.push(...r.data)
      })

      return {
        balances,
        failedChains,
        isLoading: results.length > 0 && results.every((r) => r.isLoading),
        isFetching: results.some((r) => r.isFetching),
        // Surface an error only when nothing at all came back; a partial result
        // renders with a "couldn't reach chain X" note instead.
        error: failedChains.length === sortedChainIds.length ? results[0]?.error : undefined,
        refetch: () => results.forEach((r) => r.refetch()),
      }
    },
    [sortedChainIds]
  )

  return useQueries({
    queries: sortedChainIds.map((chainId) => ({
      queryKey: ['lendingBalances', chainId, account],
      enabled,
      queryFn: () => fetchLendingBalances(chainId, account!),
      ...BALANCES_QUERY_OPTIONS,
    })),
    combine,
  })
}
