import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import type { TokenBalance } from './useTokenBalances'

import { BACKEND_BASE_URL } from '../../config/backend'

interface LendingBalancesApiResponse {
  success: boolean
  data: {
    chainId: string
    account: string
    count: number
    items: TokenBalance[]
  }
  error?: { code: string; message: string }
}

/** A lending-compatible wallet balance, tagged with the chain it sits on. */
export interface ChainTokenBalance extends TokenBalance {
  chainId: string
}

async function fetchLendingBalances(chainId: string, account: string): Promise<ChainTokenBalance[]> {
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
  if (!json.success) {
    throw new Error(json.error?.message ?? 'Lending balances API returned success: false')
  }

  // The endpoint echoes one chainId for the whole payload; stamp it per item so
  // merged multi-chain lists can tell rows apart and act on the right chain.
  return json.data.items.map((item) => ({ ...item, chainId }))
}

const BALANCES_QUERY_OPTIONS = {
  staleTime: 30_000,
  refetchInterval: 60_000,
  retry: 1,
  refetchOnWindowFocus: false,
} as const

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

  const { data, isLoading, isFetching, error, refetch } = useQuery<ChainTokenBalance[]>({
    queryKey: ['lendingBalances', chainId, account],
    enabled,
    queryFn: () => fetchLendingBalances(chainId, account!),
    ...BALANCES_QUERY_OPTIONS,
  })

  return {
    balances: data ?? [],
    isLoading,
    isFetching,
    error,
    refetch,
  }
}

/**
 * Multi-chain variant.
 *
 * `/token/balances/lending` is single-chain — passing a CSV returns
 * `INTERNAL_ERROR` — so this fans out one request per chain. Each chain is its
 * own query, so a chain that fails only removes its own rows and adding a
 * chain to the selection doesn't refetch the others.
 */
export function useLendingBalancesMultiChain(params: {
  chainIds: string[]
  account?: string
  enabled?: boolean
}) {
  const { account } = params
  const enabled = (params.enabled ?? true) && !!account && params.chainIds.length > 0
  const sortedChainIds = useMemo(() => [...params.chainIds].sort(), [params.chainIds])

  const results = useQueries({
    queries: sortedChainIds.map((chainId) => ({
      queryKey: ['lendingBalances', chainId, account],
      enabled,
      queryFn: () => fetchLendingBalances(chainId, account!),
      ...BALANCES_QUERY_OPTIONS,
    })),
  })

  return useMemo(() => {
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
  }, [results, sortedChainIds])
}
