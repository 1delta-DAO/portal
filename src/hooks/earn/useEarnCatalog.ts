import { useMemo } from 'react'
import { useQueries, useQueryClient, type QueryKey } from '@tanstack/react-query'
import {
  fetchEarnPages,
  mergeEarnCatalog,
  EMPTY_EXCLUSIONS,
  EMPTY_FACETS,
  type EarnCatalogChunk,
  type EarnFacets,
  type EarnMarket,
  type EarnSortKey,
  type EarnSourceStatus,
} from '../../sdk/earn-helper'

export interface UseEarnCatalogParams {
  chainIds: string[]
  /** Server-side filters. Values must come from `facets`, never a constant. */
  brand?: string[]
  protocol?: string[]
  curator?: string[]
  venue?: string[]
  venueKind?: string
  assetGroup?: string
  assetSymbol?: string
  terms?: 'none' | 'digest' | 'full'
  depositableOnly?: boolean
  includePassthrough?: boolean
  includeIlliquid?: boolean
  minTvlUsd?: number
  maxRiskScore?: number
  sort?: EarnSortKey
  enabled?: boolean
}

export interface UseEarnCatalogResult {
  items: EarnMarket[]
  /** The server's filter vocabulary — build every dropdown from this. */
  facets: EarnFacets
  /** Per-origin health. A `degraded`/`failed` entry means the list is partial. */
  sources: EarnSourceStatus[]
  /** Per-default removal counts, so each toggle can show its own number. */
  excluded: { passthrough: number; illiquid: number; lowTvl: number; highRisk: number }
  /**
   * Rows the filters match across the chains that have ANSWERED.
   * `total > items.length` means pages are still streaming in.
   */
  total: number
  /**
   * Chains with nothing on screen yet. **Non-empty ⇒ the listing is partial**;
   * a caller must say so rather than presenting it as the whole market.
   */
  pendingChains: string[]
  /** Chains whose request failed outright. Their rows are missing entirely. */
  failedChains: string[]
  /** True only when NOTHING has resolved yet — not while a chain fills in. */
  isLoading: boolean
  isFetching: boolean
  /** Set only when every chain failed; a partial result reports per-chain. */
  error: Error | null
  refetch: () => void
}

/** What a chain's query holds while it is still streaming pages. */
interface ChainChunk extends EarnCatalogChunk {
  /** False until the last page has landed. */
  complete: boolean
}

/**
 * The unified earn listing — lending markets AND vaults, per selected chain.
 *
 * Two things this does that a single `useQuery` over a CSV of chains cannot:
 *
 * **One query PER CHAIN.** Chain selection is something users change
 * constantly, and a multi-chain key makes the selection part of the cache
 * identity — adding a fourth chain throws away the three already rendered and
 * re-reads all four. Keyed per chain, removing a chain costs no network,
 * adding one fetches only that chain, and a slow or failing chain degrades to
 * a named row rather than blanking the table. It also unblocks the fast chains:
 * the hosted API answers chain 56 in ~2 s and the 1/56/8453 CSV in ~5 s, and
 * the old shape showed nothing until the 5 s one was done.
 *
 * **Pages stream.** `fetchEarnPages` yields as it goes and each page is written
 * into this query's cache entry immediately, so the table fills from the first
 * ~200 rows instead of waiting for all ~1.3k (~2.5 MB with `terms=full`). The
 * query still RESOLVES with the complete set, so a cache read after the fact —
 * a remount, a refetch — never sees a truncated listing.
 *
 * The cost is a client-side merge: rows from N chains have to be re-sorted here
 * because each response is only sorted within itself. `mergeEarnCatalog` keeps
 * the server's ordering rule, so a one-chain selection and a five-chain one
 * order identically.
 */
export function useEarnCatalog(params: UseEarnCatalogParams): UseEarnCatalogResult {
  const {
    chainIds,
    brand,
    protocol,
    curator,
    venue,
    venueKind,
    assetGroup,
    assetSymbol,
    terms,
    depositableOnly,
    includePassthrough,
    includeIlliquid,
    minTvlUsd,
    maxRiskScore,
    sort = 'rate',
    enabled = true,
  } = params

  const queryClient = useQueryClient()

  // Sorted + de-duplicated so a reorder never re-keys a query.
  const chains = useMemo(
    () => [...new Set(chainIds)].sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chainIds.join(',')]
  )

  const venueKey = venue?.length ? [...venue].sort().join(',') : ''
  const brandKey = brand?.length ? [...brand].sort().join(',') : ''
  const protocolKey = protocol?.length ? [...protocol].sort().join(',') : ''
  const curatorKey = curator?.length ? [...curator].sort().join(',') : ''

  // Everything except the chain. The chain is prepended per query so that one
  // chain's entry is addressable on its own — which is what makes the streaming
  // writes below land on the right row.
  const filterKey = useMemo(
    () => [
      brandKey,
      protocolKey,
      curatorKey,
      venueKey,
      venueKind ?? '',
      assetGroup ?? '',
      assetSymbol ?? '',
      terms ?? '',
      depositableOnly ? '1' : '0',
      includePassthrough ? '1' : '0',
      includeIlliquid ? '1' : '0',
      String(minTvlUsd ?? ''),
      String(maxRiskScore ?? ''),
      sort,
    ],
    [
      brandKey,
      protocolKey,
      curatorKey,
      venueKey,
      venueKind,
      assetGroup,
      assetSymbol,
      terms,
      depositableOnly,
      includePassthrough,
      includeIlliquid,
      minTvlUsd,
      maxRiskScore,
      sort,
    ]
  )

  const queryEnabled = enabled && chains.length > 0

  const results = useQueries({
    queries: chains.map((chainId) => {
      const queryKey: QueryKey = ['earnCatalog', chainId, ...filterKey]
      return {
        queryKey,
        enabled: queryEnabled,
        queryFn: async ({ signal }: { signal: AbortSignal }): Promise<ChainChunk> => {
          const acc: ChainChunk = { items: [], total: 0, complete: false }

          for await (const page of fetchEarnPages(
            {
              chainIds: [chainId],
              brand,
              protocol,
              curator,
              venue,
              venueKind,
              assetGroup,
              assetSymbol,
              terms,
              depositableOnly,
              includePassthrough,
              includeIlliquid,
              minTvlUsd,
              maxRiskScore,
              sort,
            },
            signal
          )) {
            acc.items = [...(acc.items ?? []), ...page.items]
            acc.facets = page.facets ?? acc.facets
            acc.sources = page.sources ?? acc.sources
            acc.excluded = page.excluded ?? acc.excluded
            acc.total = page.total

            // Publish the partial listing NOW. React Query overwrites this with
            // the return value when the generator finishes, so the cache ends
            // up holding the complete set either way — this only decides
            // whether the user waits for it.
            if (!page.last) queryClient.setQueryData(queryKey, { ...acc, items: [...acc.items!] })
          }

          return { ...acc, complete: true }
        },
        // Structural sharing deep-compares old data against new to preserve
        // object identity. Over ~1.3k rows carrying full term sheets that walk
        // costs more than it saves — and it runs on EVERY streamed page, not
        // just on refetch. Nothing downstream depends on row identity: the
        // selected row is tracked by `earnUid`, and the merge builds a new
        // sorted array regardless.
        structuralSharing: false,
        // A background refetch of a listing this size is not free: the rows are
        // a browsing surface, not a balance.
        staleTime: 30_000,
        refetchInterval: 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      }
    }),
  })

  // Identity of the per-chain results, as a primitive. The merge re-sorts every
  // row it holds — ~1.3k on a three-chain selection — and `useQueries` hands
  // back a fresh array on every render, so keying the memo on that array would
  // re-sort the whole listing each time the parent re-rendered for any reason
  // (a hover, a selection, a page change). `dataUpdatedAt` moves only when a
  // chain actually publishes something, streamed pages included.
  const signature = results
    .map((r) => `${r.dataUpdatedAt}:${r.errorUpdatedAt}:${r.isPending ? 1 : 0}`)
    .join('|')
  const fetching = results.some((r) => r.isFetching)

  return useMemo(() => {
    const merged = mergeEarnCatalog(
      results.map((r) => r.data as ChainChunk | undefined),
      sort
    )

    const pendingChains: string[] = []
    const failedChains: string[] = []
    results.forEach((r, i) => {
      if (r.error) failedChains.push(chains[i])
      // "Pending" is about the SCREEN, not the request: a chain that has
      // streamed its first page is on screen, and calling it pending would keep
      // a "still loading" note up for the whole tail.
      else if (!r.data?.items?.length && r.isPending) pendingChains.push(chains[i])
    })

    return {
      items: merged.items,
      facets: merged.facets ?? EMPTY_FACETS,
      sources: merged.sources,
      excluded: merged.excluded ?? EMPTY_EXCLUSIONS,
      total: merged.total,
      pendingChains,
      failedChains,
      // Nothing on screen at all — distinct from "some chains still arriving".
      isLoading: queryEnabled && merged.items.length === 0 && results.some((r) => r.isPending),
      isFetching: fetching,
      error:
        failedChains.length === chains.length && chains.length > 0
          ? ((results.find((r) => r.error)?.error as Error) ?? null)
          : null,
      refetch: () => results.forEach((r) => r.refetch()),
    }
    // `results` is deliberately not a dependency — `signature` stands in for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, fetching, chains, sort, queryEnabled])
}
