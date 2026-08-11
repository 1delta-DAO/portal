import { BACKEND_BASE_URL } from '../../config/backend'
import { EMPTY_FACETS, type EarnFacets, type EarnMarket, type EarnResponse } from './types'

const ENDPOINT = `${BACKEND_BASE_URL}/v1/data/earn`

/** Server caps `limit` at 1000; page until a short page comes back. */
const PAGE_SIZE = 1000

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
    let start = 0

    for (;;) {
      const qs = new URLSearchParams()
      qs.set('chainId', params.chainIds.join(','))
      qs.set('start', String(start))
      qs.set('limit', String(PAGE_SIZE))
      if (params.sort) qs.set('sort', params.sort)
      if (params.venueKind) qs.set('venueKind', params.venueKind)
      if (params.brand?.length) qs.set('brand', params.brand.join(','))
      if (params.protocol?.length) qs.set('protocol', params.protocol.join(','))
      if (params.curator?.length) qs.set('curator', params.curator.join(','))
      if (params.venue?.length) qs.set('venue', params.venue.join(','))
      if (params.assetGroup) qs.set('assetGroup', params.assetGroup)
      if (params.assetSymbol) qs.set('assetSymbol', params.assetSymbol)
      if (params.terms) qs.set('terms', params.terms)
      if (params.depositableOnly) qs.set('depositable', 'true')
      if (params.includePassthrough) qs.set('passthrough', 'include')
      if (params.includeIlliquid) qs.set('illiquid', 'include')
      if (params.maxRiskScore != null) qs.set('maxRiskScore', String(params.maxRiskScore))
      if (params.minTvlUsd != null) qs.set('minTvlUsd', String(params.minTvlUsd))

      const res = await fetch(`${ENDPOINT}?${qs}`)
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return { success: false, error: `HTTP ${res.status}: ${text || res.statusText}` }
      }

      const json = await res.json()
      if (json.success === false) {
        return { success: false, error: json.error?.message ?? 'Earn listing failed' }
      }

      const page: EarnResponse = json.data ?? json
      const pageItems = Array.isArray(page.items) ? page.items : []
      items.push(...pageItems)
      // Facets and source health describe the whole listing, not the page —
      // the last page's copy is as good as the first's.
      facets = page.facets ?? facets
      sources = page.sources ?? sources
      excluded = page.excluded ?? excluded

      if (pageItems.length < PAGE_SIZE) break
      start += PAGE_SIZE
    }

    return { success: true, items, facets, sources, excluded }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' }
  }
}
