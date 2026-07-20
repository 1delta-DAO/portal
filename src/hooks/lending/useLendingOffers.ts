import { useQuery } from '@tanstack/react-query'
import { BACKEND_BASE_URL } from '../../config/backend'

/** One live maker offer (a level of a market's order book). */
export interface LendingOffer {
  /** Maker-signed tick (price point) — opaque, for keys/debug. */
  tick: string
  /** Fixed borrow APR of THIS offer, percent. */
  aprPct: number
  /** Fillable size, loan-token units. */
  assets: number
  /** USD value of `assets`, or null when no price was available. */
  assetsUsd: number | null
  /** Credit/debt units. */
  units: string
  /** Running total size from the best offer through this one. */
  cumulativeAssets: number
}

/**
 * Live order-book ladder for a lending market — the full set of maker offers
 * (not the single top-of-book snapshot). Sourced from the SAME lending endpoint
 * as the rest of the market data (`/lending/latest`), which is order-book-aware:
 * `includeOffers=true` attaches the live ladder to an order-book market's loan
 * leg. Plain pool markets return no offers (their single rate suffices).
 *
 * Provider-agnostic — Morpho Midnight is currently the only order-book lender,
 * so enablement keys off its lender prefix; add others here as they land.
 */
export function useLendingOffers(params: {
  chainId?: string
  /** Market/lender key (e.g. `MORPHO_MIDNIGHT_<id>`, or a marketUid's first segment). */
  lender?: string
  /** Drop offers smaller than this USD size (dust). */
  minAssetsUsd?: number
  count?: number
  enabled?: boolean
}) {
  const { chainId, lender, minAssetsUsd, count = 25, enabled = true } = params

  const isOrderBook =
    !!lender && lender.toUpperCase().startsWith('MORPHO_MIDNIGHT')

  const query = useQuery<{ offers: LendingOffer[] }>({
    queryKey: ['lendingOffers', chainId, lender, count, minAssetsUsd],
    enabled: enabled && isOrderBook && !!chainId && !!lender,
    queryFn: async () => {
      const sp = new URLSearchParams()
      sp.set('chains', chainId!)
      sp.set('lenders', lender!)
      sp.set('includeOffers', 'true')
      sp.set('count', String(count))
      sp.set('maxRiskScore', '100')
      if (minAssetsUsd != null) sp.set('minAssetsUsd', String(minAssetsUsd))
      const r = await fetch(
        `${BACKEND_BASE_URL}/v1/data/lending/latest?${sp.toString()}`,
      )
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = (await r.json()) as { data?: { items?: any[] } }
      const items = json.data?.items ?? []
      const item = items.find(
        (it) =>
          String(it?.lenderInfo?.key ?? '').toUpperCase() ===
          lender!.toUpperCase(),
      )
      // The loan (borrowable) leg carries the enriched `offers` array.
      const loan = (item?.markets ?? []).find(
        (m: any) => m?.config?.['0'] && !m.config['0'].debtDisabled,
      )
      return { offers: (loan?.offers ?? []) as LendingOffer[] }
    },
    // A live order book — refresh often, but let stale data serve instantly.
    refetchInterval: 30_000,
    staleTime: 10_000,
    retry: 1,
  })

  return {
    offers: query.data?.offers ?? [],
    // The server count-caps; there's no explicit "more" flag on this shape.
    hasMore: false,
    isLoading: query.isLoading,
    error: query.error,
  }
}
