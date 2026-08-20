import { useCallback, useMemo } from 'react'
import {
  useQueries,
  experimental_streamedQuery as streamedQuery,
  type UseQueryResult,
} from '@tanstack/react-query'
import { apiFetch, type ApiParams } from '../../sdk/http'
import type { PoolEntry, PoolsFilters } from '../../sdk/lending-helper/poolTypes'

const endpointPools = '/v1/data/lending/pools'

/**
 * Default page size requested from the API. The backend caps `count` at 1000;
 * we stay well under that to keep individual requests reasonable while still
 * minimizing round-trips for the typical "fetch all matching pools" workload.
 */
const DEFAULT_PAGE_SIZE = 500

/** Numeric filters that pass straight through as query params. */
const NUMERIC_FILTER_KEYS = [
  'minYield',
  'maxYield',
  'minUtil',
  'maxUtil',
  'minTvlUsd',
  'maxTvlUsd',
  'minDeposits',
  'maxDeposits',
  'minDebt',
  'maxDebt',
  'minDebtUsd',
  'maxDebtUsd',
  'minLiquidity',
  'maxLiquidity',
  'minLiquidityUsd',
  'maxLiquidityUsd',
] as const satisfies readonly (keyof PoolsFilters)[]

function buildPoolsParams(
  chainId: string,
  lender: string | undefined,
  start: number,
  count: number,
  maxRiskScore: number | undefined,
  filters: PoolsFilters | undefined
): ApiParams {
  const params: ApiParams = {
    chainId,
    // `filters.lender` is the fallback for callers that pass it inside the
    // filter bag rather than as the dedicated argument.
    lender: lender || filters?.lender,
    start,
    count,
    maxRiskScore,
    includeExposures: 'true',
    underlyings: filters?.underlyings?.length ? filters.underlyings.join(',') : undefined,
    assetGroups: filters?.assetGroups?.length ? filters.assetGroups.join(',') : undefined,
    sortBy: filters?.sortBy,
    sortDir: filters?.sortDir ? String(filters.sortDir).toUpperCase() : undefined,
    includeFixedTerm: filters?.includeFixedTerm ? 'true' : undefined,
  }

  for (const key of NUMERIC_FILTER_KEYS) {
    const value = filters?.[key]
    if (typeof value === 'number' && Number.isFinite(value)) params[key] = value
  }

  return params
}

// ============================================================================
// Multi-chain
// ============================================================================

/**
 * Hard ceiling on pages fetched per chain. `/lending/pools` has no total-count
 * field, so paging only stops on a short page; without a budget a wide filter
 * across several chains could walk tens of thousands of rows into memory.
 * 4 × 500 = 2000 markets per chain is far past what any filter surfaces.
 */
const MAX_PAGES_PER_CHAIN = 4

/** One chain's merged pages, plus whether the page budget cut it short. */
interface ChainPoolsPage {
  items: PoolEntry[]
  truncated: boolean
}

/** A single page as it comes off the wire, before the reducer merges it. */
interface PoolsChunk {
  items: PoolEntry[]
  /** Set on the final chunk when the page budget cut the chain short. */
  truncated: boolean
}

/**
 * Stream one chain's pages.
 *
 * Two things here are deliberate, and both exist because Ethereum alone
 * returns ~2000 markets at the default risk ceiling — four full pages, several
 * MB of JSON:
 *
 *   1. **Yield per page instead of returning the merged list.** The table
 *      renders as soon as page 1 lands and grows underneath the user, rather
 *      than showing a spinner until the last page arrives. The view already
 *      surfaces `isPoolsFetching` as a "loading more" note.
 *   2. **Pages 2..N go out together, not one after another.** Paging is only
 *      sequential because a short page is the sole end-of-list signal — but
 *      once page 1 comes back full, the remaining pages of the budget can be
 *      requested at once. Cost of guessing wrong is a couple of empty
 *      responses (the backend answers those in ~0.5s); the win is that a
 *      four-page chain costs one round-trip of latency rather than four.
 */
export async function* streamPoolsForChain(
  chainId: string,
  lender: string | undefined,
  maxRiskScore: number | undefined,
  pageSize: number,
  filters: PoolsFilters | undefined,
  signal: AbortSignal | undefined
): AsyncGenerator<PoolsChunk> {
  const fetchPage = (start: number) =>
    apiFetch<{ items: PoolEntry[] }>(endpointPools, {
      params: buildPoolsParams(chainId, lender, start, pageSize, maxRiskScore, filters),
      signal,
    })

  const first = await fetchPage(0)
  yield { items: first.items, truncated: false }
  if (first.items.length < pageSize) return

  // Settle rather than await directly: once a short page tells us the list is
  // over, the speculative pages behind it are irrelevant, and an unobserved
  // rejection from one of them must not fail a query that already has the
  // complete result.
  const pending = Array.from({ length: MAX_PAGES_PER_CHAIN - 1 }, (_, i) =>
    fetchPage((i + 1) * pageSize).then(
      (data) => ({ ok: true as const, data }),
      (error) => ({ ok: false as const, error })
    )
  )

  let lastPageFull = true
  for (const p of pending) {
    const settled = await p
    if (!lastPageFull) continue // list already ended; drain and discard
    if (!settled.ok) throw settled.error
    lastPageFull = settled.data.items.length === pageSize
    yield { items: settled.data.items, truncated: false }
  }

  // Every page of the budget came back full, so there is more we did not ask
  // for. Flag it so the view can say the list is a capped slice.
  if (lastPageFull) yield { items: [], truncated: true }
}

const EMPTY_CHAIN_PAGE: ChainPoolsPage = { items: [], truncated: false }

/** Exported for the paging tests. */
export function mergeChunk(acc: ChainPoolsPage, chunk: PoolsChunk): ChainPoolsPage {
  return {
    items: chunk.items.length ? [...acc.items, ...chunk.items] : acc.items,
    truncated: acc.truncated || chunk.truncated,
  }
}

export interface MultiChainPoolsResult {
  pools: PoolEntry[]
  count: number
  isPoolsLoading: boolean
  isPoolsFetching: boolean
  /** Chains whose fetch failed this round — the rest still render. */
  failedChains: string[]
  /** Chains that hit the per-chain page budget, so their list is incomplete. */
  truncatedChains: string[]
  error: unknown
}

/**
 * Multi-chain variant of {@link useFlattenedPools}.
 *
 * `/v1/data/lending/pools` is single-chain server-side — a CSV, a repeated
 * `chainId` param and `chainIds` all come back empty — so this fans out one
 * query per chain and merges. That also buys two things a single merged query
 * couldn't: adding a chain to the selection refetches only that chain, and one
 * chain erroring degrades to a partial result instead of blanking the table.
 *
 * Push filters down through `filters` wherever possible; every row the server
 * prunes is a row that doesn't cross the wire N times.
 */
export function useFlattenedPoolsMultiChain(params: {
  chainIds: string[]
  lender?: string
  maxRiskScore?: number
  enabled?: boolean
  pageSize?: number
  filters?: PoolsFilters
}): MultiChainPoolsResult {
  const { chainIds } = params
  const lender = params.lender
  const maxRiskScore = params.maxRiskScore ?? 4
  const enabled = (params.enabled ?? true) && chainIds.length > 0
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const filters = params.filters

  const filtersKey = useMemo(() => (filters ? JSON.stringify(filters) : ''), [filters])
  // Sorted so a reordered selection reuses the same cache entries.
  const sortedChainIds = useMemo(() => [...chainIds].sort(), [chainIds])

  // Merge inside `combine` rather than a `useMemo` over the results array:
  // `useQueries` returns a NEW array identity every render, so a
  // `useMemo(..., [results])` never actually caches and the merge (which
  // concatenates thousands of pools) re-ran on every unrelated re-render.
  // `combine` is memoised against the underlying query state instead.
  const combine = useCallback(
    (results: UseQueryResult<ChainPoolsPage>[]): MultiChainPoolsResult => {
      const pools: PoolEntry[] = []
      const failedChains: string[] = []
      const truncatedChains: string[] = []

      results.forEach((r, i) => {
        const chainId = sortedChainIds[i]
        if (r.error) {
          failedChains.push(chainId)
          return
        }
        if (!r.data) return
        pools.push(...r.data.items)
        if (r.data.truncated) truncatedChains.push(chainId)
      })

      return {
        pools,
        count: pools.length,
        // Loading only while nothing is renderable; once one chain lands the
        // table shows partial data rather than a spinner over the whole view.
        isPoolsLoading: results.length > 0 && results.every((r) => r.isLoading),
        isPoolsFetching: results.some((r) => r.isFetching),
        failedChains,
        truncatedChains,
        error: failedChains.length === sortedChainIds.length ? results[0]?.error : undefined,
      }
    },
    [sortedChainIds]
  )

  return useQueries({
    queries: sortedChainIds.map((chainId) => ({
      queryKey: ['flattenedPoolsChain', chainId, lender ?? '', maxRiskScore, pageSize, filtersKey],
      enabled,
      // `replace` keeps the previous list on screen through a background
      // refetch — with `reset` the table would blank out every 8 minutes and
      // refill page by page.
      queryFn: streamedQuery<PoolsChunk, ChainPoolsPage>({
        streamFn: ({ signal }) =>
          streamPoolsForChain(chainId, lender, maxRiskScore, pageSize, filters, signal),
        reducer: mergeChunk,
        initialValue: EMPTY_CHAIN_PAGE,
        refetchMode: 'replace',
      }),
      refetchInterval: 8 * 60 * 1000,
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    })),
    combine,
  })
}
