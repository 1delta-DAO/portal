import { useMemo } from 'react'
import { useQueries, useQueryClient, type QueryKey } from '@tanstack/react-query'
import {
  fetchEarnPages,
  mergeEarnCatalog,
  EMPTY_EXCLUSIONS,
  EMPTY_FACETS,
  type EarnAppliedDefaults,
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
  /** Underlying token address — the unambiguous asset filter. */
  asset?: string
  /** Free text over name / brand / curator / protocol / asset, ranked
   *  exact-first. The two filters above key on the deposit token only. */
  search?: string
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
   * The filters the server applied unasked. A control that needs to show the
   * floor in force reads it here rather than restating it locally — a copied
   * default drifts silently the moment the server's moves.
   */
  appliedDefaults?: EarnAppliedDefaults
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

/** One query's worth of filters: the catalog request minus the chain. */
export type EarnCatalogRequest = Omit<UseEarnCatalogParams, 'chainIds' | 'enabled'>

/**
 * A deterministic cache key for a catalog request.
 *
 * Derived from the request OBJECT rather than from a hand-written list of
 * fields, because the hand-written list is what broke: `search` was sent to the
 * server but left out of the key, so React Query kept serving the entry fetched
 * without it and never called the queryFn again. Typing a name did nothing
 * until some other control moved the key and dragged the search term along.
 * A parameter that is in the request but not the key is not a filter that
 * arrives late — it is one that never arrives.
 *
 * Field order is normalised away, and array values are sorted so that
 * re-ordering the same multi-select does not re-key (and so re-fetch) an
 * identical query. Everything else is taken verbatim.
 */
export function earnRequestKey(request: EarnCatalogRequest): string {
  return JSON.stringify(
    Object.keys(request)
      .sort()
      .map((field) => {
        const value = (request as Record<string, unknown>)[field]
        return [field, Array.isArray(value) ? [...value].map(String).sort() : (value ?? null)]
      })
  )
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
    asset,
    search,
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

  /**
   * Every server-visible parameter in ONE object, so the query key and the
   * request cannot disagree about what was asked for. Adding a filter means
   * adding it here, once — {@link earnRequestKey} picks it up for free, and
   * the queryFn spreads this same object.
   */
  const request = useMemo<EarnCatalogRequest>(
    () => ({
      brand,
      protocol,
      curator,
      venue,
      venueKind,
      assetGroup,
      assetSymbol,
      asset,
      search,
      terms,
      depositableOnly,
      includePassthrough,
      includeIlliquid,
      minTvlUsd,
      maxRiskScore,
      sort,
    }),
    // The array filters are depended on by their sorted CSV, not by identity:
    // a caller rebuilding `['a','b']` on every render must not re-key a query,
    // and neither must re-ordering the same selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      brandKey,
      protocolKey,
      curatorKey,
      venueKey,
      venueKind,
      assetGroup,
      assetSymbol,
      asset,
      search,
      terms,
      depositableOnly,
      includePassthrough,
      includeIlliquid,
      minTvlUsd,
      maxRiskScore,
      sort,
    ]
  )

  // The chain is prepended per query so that one chain's entry is addressable
  // on its own — which is what makes the streaming writes below land on the
  // right row.
  const filterKey = useMemo(() => earnRequestKey(request), [request])

  const queryEnabled = enabled && chains.length > 0

  const results = useQueries({
    queries: chains.map((chainId) => {
      const queryKey: QueryKey = ['earnCatalog', chainId, filterKey]
      return {
        queryKey,
        enabled: queryEnabled,
        queryFn: async ({ signal }: { signal: AbortSignal }): Promise<ChainChunk> => {
          const acc: ChainChunk = { items: [], total: 0, complete: false }

          // The SAME object the key was built from — see `request` above.
          for await (const page of fetchEarnPages({ ...request, chainIds: [chainId] }, signal)) {
            acc.items = [...(acc.items ?? []), ...page.items]
            acc.facets = page.facets ?? acc.facets
            acc.sources = page.sources ?? acc.sources
            acc.excluded = page.excluded ?? acc.excluded
            acc.appliedDefaults = page.appliedDefaults ?? acc.appliedDefaults
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
      appliedDefaults: merged.appliedDefaults,
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
