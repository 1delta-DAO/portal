import { useCallback, useMemo } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchEarnPage,
  EMPTY_EXCLUSIONS,
  EMPTY_FACETS,
  type EarnAppliedDefaults,
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
  /** Zero-based page of the server's ordering. */
  page?: number
  /** Rows per page — the request's `limit`. */
  pageSize?: number
  enabled?: boolean
}

export interface UseEarnCatalogResult {
  /** The requested PAGE, in the server's order — not the listing. */
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
  /** Rows the filters match across the WHOLE listing, every page and chain. */
  total: number
  /** True only when nothing is on screen yet — not while a page is swapped. */
  isLoading: boolean
  isFetching: boolean
  /**
   * `items` are the PREVIOUS page or filter's rows, held while the one asked
   * for loads. A caller should mark them as such rather than blank the table.
   */
  isPlaceholderData: boolean
  /** Set only when there is nothing to show; a failed refetch keeps the rows. */
  error: Error | null
  refetch: () => void
  /**
   * The listing row for `earnUid` under the CURRENT filters, wherever it pages
   * — `undefined` when the filters exclude it. `asset` is the row's deposit
   * token; it narrows the lookup to a handful of rows.
   */
  findRow: (earnUid: string, chainId: string, asset?: string) => Promise<EarnMarket | undefined>
}

/** One query's worth of filters: the catalog request minus chain and page. */
export type EarnCatalogRequest = Omit<
  UseEarnCatalogParams,
  'chainIds' | 'enabled' | 'page' | 'pageSize'
>

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

/** The server's cap on `limit` — the widest a row lookup can ask for. */
const LOOKUP_LIMIT = 1000

/**
 * The unified earn listing — lending markets AND vaults — ONE PAGE of it.
 *
 * The endpoint filters, sorts across every chain in the CSV, counts and pages,
 * so this asks for the rows on screen and nothing else. It used to download the
 * whole catalogue per chain and sort and slice it here: ~1.4k rows and ~7 MB
 * with `terms=full` for Ethereum alone, re-read every minute, to show 15. That
 * was the load time, and with a wide chain selection it was also dozens of
 * concurrent cold requests the origin answers markedly slower than one.
 *
 * What a single request gives up is the per-chain cache entry: changing the
 * chain selection re-reads the page instead of only the added chain. A page is
 * small enough that this is the cheaper side of the trade, and the previous
 * rows stay up (`isPlaceholderData`) while it happens.
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
    page = 0,
    pageSize = 15,
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

  const filterKey = useMemo(() => earnRequestKey(request), [request])

  const queryEnabled = enabled && chains.length > 0

  const query = useQuery({
    queryKey: ['earnCatalog', chains.join(','), filterKey, page, pageSize],
    enabled: queryEnabled,
    // The SAME object the key was built from — see `request` above.
    queryFn: ({ signal }) =>
      fetchEarnPage({ ...request, chainIds: chains }, page * pageSize, pageSize, signal),
    // Paging, sorting or filtering swaps the rows in place instead of dropping
    // to a spinner and back.
    placeholderData: keepPreviousData,
    // Nothing downstream depends on row identity (the selected row is tracked
    // by `earnUid`), and the rows carry full term sheets — not worth the walk.
    structuralSharing: false,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  const findRow = useCallback(
    async (earnUid: string, chainId: string, asset?: string) => {
      // A different asset is already selected: the listing cannot hold the row.
      if (asset && request.asset && request.asset.toLowerCase() !== asset.toLowerCase()) {
        return undefined
      }
      const lookup: EarnCatalogRequest = { ...request, asset: asset ?? request.asset }
      const found = await queryClient.fetchQuery({
        queryKey: ['earnCatalogRow', chainId, earnRequestKey(lookup)],
        queryFn: ({ signal }) =>
          fetchEarnPage({ ...lookup, chainIds: [chainId] }, 0, LOOKUP_LIMIT, signal),
        staleTime: 30_000,
      })
      return found.items.find((m) => m.earnUid === earnUid)
    },
    [request, queryClient]
  )

  const { data, isFetching, isPlaceholderData, refetch } = query
  const error = data ? null : ((query.error as Error | null) ?? null)

  return useMemo(
    () => ({
      items: data?.items ?? [],
      facets: data?.facets ?? EMPTY_FACETS,
      sources: data?.sources ?? [],
      excluded: data?.excluded ?? EMPTY_EXCLUSIONS,
      appliedDefaults: data?.appliedDefaults,
      total: data?.total ?? 0,
      isLoading: queryEnabled && !data && !error,
      isFetching,
      isPlaceholderData,
      error,
      refetch: () => void refetch(),
      findRow,
    }),
    [data, error, isFetching, isPlaceholderData, queryEnabled, refetch, findRow]
  )
}
