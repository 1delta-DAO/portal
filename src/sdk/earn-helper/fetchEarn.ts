import { apiFetchLoose, errorMessage } from '../http'
import { EMPTY_FACETS, type EarnFacets, type EarnMarket, type EarnResponse } from './types'

const ENDPOINT = '/v1/data/earn'

/** Server caps `limit` at 1000; page until a short page comes back. */
const PAGE_SIZE = 1000

/**
 * The first page is deliberately smaller — it is the one the user waits on.
 *
 * Measured on the hosted API (chain 1, `terms=full`, median of 3): ~4.1 s for
 * 200 rows against ~5.1 s for 1000, with time-to-first-byte ~1 s either way.
 * So most of the wait is the server computing the listing, and the page size
 * only buys back the transfer — about a second. The real point is that 200 rows
 * is ~13 screens at the default page size, so the table is browsable while the
 * tail streams in behind it.
 */
const FIRST_PAGE_SIZE = 200

export interface FetchEarnParams {
  /** One or more chains. Sent as a CSV — the endpoint merges across them. */
  chainIds: string[]
  /**
   * Optional filters. **Every value here comes from a previous response's
   * `facets`, never from a constant in this app.** That is the whole point of
   * the unified endpoint: a venue this app has never heard of still filters
   * correctly, because the app only ever echoes back what the server offered.
   */
  brand?: string[]
  /** Protocol display names, e.g. `['Morpho']`. */
  protocol?: string[]
  /** Curator names — only rows a third party actually runs. */
  curator?: string[]
  venue?: string[]
  venueKind?: string
  assetGroup?: string
  /** Underlying symbol, e.g. `USDC`. */
  assetSymbol?: string
  /**
   * Underlying token ADDRESS — the unambiguous asset filter.
   *
   * `assetSymbol` is an exact string match, so it cannot separate two tokens
   * that share a ticker (three unrelated USD3s, three USDPs), and it cannot be
   * used at all for a token whose symbol the user does not know. An address
   * identifies exactly one token on one chain.
   */
  asset?: string
  /**
   * Free text, matched across a row's name, brand, curator, protocol and asset
   * symbol and returned ranked exact-first.
   *
   * The two filters above both key on the DEPOSIT TOKEN, so neither can find a
   * row by what it is called — "svZCHF", "Gauntlet", "Savings Module" all
   * returned an empty table while the rows sat in the listing. Sent as `q`.
   */
  search?: string
  /** Hide rows that cannot be entered right now. Opt-in — see below. */
  depositableOnly?: boolean
  /**
   * Include rows whose whole yield is the asset's own (an LST market paying
   * 0 % of its own). The endpoint hides these by default — see
   * `EarnRate.passthrough`.
   */
  includePassthrough?: boolean
  /** Show rows that claim an instant exit but report zero liquidity. */
  includeIlliquid?: boolean
  /** Override the server's default TVL floor. `0` disables it. */
  minTvlUsd?: number
  /** Override the server's default risk ceiling (higher is worse). */
  maxRiskScore?: number
  sort?: 'rate' | 'marketRate' | 'tvl' | 'liquidity'
  /**
   * Term-sheet depth. `digest` is the server default and is all the table
   * needs; the detail panel asks for `full` to get the prose and the
   * counterparty/availability blocks.
   */
  terms?: 'none' | 'digest' | 'full'
}

export interface FetchEarnResult {
  success: boolean
  items?: EarnMarket[]
  facets?: EarnFacets
  sources?: EarnResponse['sources']
  excluded?: EarnResponse['excluded']
  error?: string
}

/**
 * Fetch the unified earn listing.
 *
 * Note what this function does NOT do: it does not enumerate providers, does
 * not branch on venue, and does not decide which rows are vaults. It sends the
 * chains, pages until done, and returns what came back.
 */
/**
 * Guarantee every facet dimension is an ARRAY.
 *
 * The server owns this vocabulary and may serve fewer dimensions than this
 * client knows about — an older worker, or the origin's SQL route, which
 * groups a different set than the edge merge does. A missing dimension then
 * arrives as `undefined`, and one `facets.assets.length` downstream takes the
 * whole tab out with a render error rather than dropping one dropdown.
 *
 * Unknown dimensions are kept, not stripped: a NEW server-side facet must
 * reach the UI without a release here, which is the entire point of publishing
 * the vocabulary.
 */
function withEveryDimension(raw: EarnResponse['facets'] | undefined): EarnFacets | undefined {
  if (!raw) return undefined
  const merged = { ...EMPTY_FACETS, ...raw } as Record<string, unknown>
  for (const key of Object.keys(merged)) if (!Array.isArray(merged[key])) merged[key] = []
  return merged as unknown as EarnFacets
}

/** One page, plus the listing-wide blocks the server repeats on every page. */
export interface EarnPage {
  items: EarnMarket[]
  facets?: EarnFacets
  sources?: EarnResponse['sources']
  excluded?: EarnResponse['excluded']
  /**
   * The filters the server applied WITHOUT being asked. Surfaced so a control
   * can show the floor actually in force instead of restating it as a local
   * constant that would drift the moment the server's default moved.
   */
  appliedDefaults?: EarnResponse['appliedDefaults']
  /** Rows matching the filters across the WHOLE listing, not just this page. */
  total: number
  /** No further pages — this one came back short. */
  last: boolean
}

async function fetchEarnPage(
  params: FetchEarnParams,
  start: number,
  limit: number,
  signal?: AbortSignal
): Promise<EarnPage> {
  const page = await apiFetchLoose<EarnResponse>(ENDPOINT, {
    signal,
    params: {
      chainId: params.chainIds.join(','),
      start,
      limit,
      sort: params.sort,
      venueKind: params.venueKind,
      brand: params.brand?.length ? params.brand.join(',') : undefined,
      protocol: params.protocol?.length ? params.protocol.join(',') : undefined,
      curator: params.curator?.length ? params.curator.join(',') : undefined,
      venue: params.venue?.length ? params.venue.join(',') : undefined,
      assetGroup: params.assetGroup,
      assetSymbol: params.assetSymbol,
      asset: params.asset,
      q: params.search,
      terms: params.terms,
      depositable: params.depositableOnly ? 'true' : undefined,
      passthrough: params.includePassthrough ? 'include' : undefined,
      illiquid: params.includeIlliquid ? 'include' : undefined,
      maxRiskScore: params.maxRiskScore,
      minTvlUsd: params.minTvlUsd,
    },
  })
  const items = Array.isArray(page?.items) ? page.items : []
  return {
    items,
    // Facets and source health describe the whole listing, not the page.
    facets: withEveryDimension(page?.facets),
    sources: page?.sources,
    excluded: page?.excluded,
    appliedDefaults: page?.appliedDefaults,
    total: page?.total ?? items.length,
    // Two ways to know this was the last page. `total` is the cheap one and
    // saves the empty round trip a listing whose size divides exactly by the
    // page size would otherwise make; the short-page check still backstops a
    // server that omits or miscounts it.
    last: items.length < limit || start + items.length >= (page?.total ?? 0),
  }
}

/**
 * Page through the listing, yielding each page AS IT ARRIVES.
 *
 * The listing is big — a 1/56/8453 selection is ~1.3k rows and ~2.6 MB with
 * `terms=full`, about 5 s on the hosted API, and that is one page of two.
 * Accumulating every page before returning means the table renders nothing for
 * the whole time, when the first screen needs 15 rows. The generator lets the
 * caller show page one and keep filling in behind it.
 *
 * Pages are SMALL FIRST, then large: the first is sized for time-to-first-row,
 * the rest for throughput, so streaming does not turn one 5 s request into
 * seven 1 s ones.
 */
export async function* fetchEarnPages(
  params: FetchEarnParams,
  signal?: AbortSignal
): AsyncGenerator<EarnPage> {
  let start = 0
  let limit = FIRST_PAGE_SIZE
  for (;;) {
    const page = await fetchEarnPage(params, start, limit, signal)
    yield page
    if (page.last) return
    start += limit
    limit = PAGE_SIZE
  }
}

export async function fetchEarn(params: FetchEarnParams): Promise<FetchEarnResult> {
  try {
    const items: EarnMarket[] = []
    let facets: EarnFacets = EMPTY_FACETS
    let sources: EarnResponse['sources'] = []
    let excluded: EarnResponse['excluded'] = {
      passthrough: 0,
      illiquid: 0,
      lowTvl: 0,
      highRisk: 0,
    }

    for await (const page of fetchEarnPages(params)) {
      items.push(...page.items)
      facets = page.facets ?? facets
      sources = page.sources ?? sources
      excluded = page.excluded ?? excluded
    }

    return { success: true, items, facets, sources, excluded }
  } catch (err) {
    return { success: false, error: errorMessage(err) }
  }
}
