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
  /** Maker address(es) at this price level (one, or several at the same tick). */
  makers?: string[]
}

/**
 * Walk the best-first offers to fill `amountTokens`, returning the aggregated
 * borrow cost: the effective (size-weighted average) APR you'd actually pay, the
 * worst (marginal) APR touched, how much was filled (capped at book depth), and
 * the ticks of the offers consumed (so the ladder can highlight them). Empty
 * offers or a non-positive amount → nulls.
 */
export function computeEffectiveBorrow(
  offers: LendingOffer[],
  amountTokens: number
): {
  aprPct: number | null
  worstAprPct: number | null
  filled: number
  /** True when the book can't fully cover the amount. */
  short: boolean
  consumedTicks: string[]
} {
  if (!offers.length || !(amountTokens > 0)) {
    return { aprPct: null, worstAprPct: null, filled: 0, short: false, consumedTicks: [] }
  }
  let remaining = amountTokens
  let weighted = 0
  let filled = 0
  let worst = 0
  const consumedTicks: string[] = []
  for (const o of offers) {
    if (remaining <= 1e-12) break
    const take = Math.min(o.assets, remaining)
    weighted += o.aprPct * take
    filled += take
    worst = o.aprPct // best-first → the last offer touched is the worst rate
    consumedTicks.push(o.tick)
    remaining -= take
  }
  return {
    aprPct: filled > 0 ? weighted / filled : null,
    worstAprPct: worst || null,
    filled,
    short: remaining > 1e-9,
    consumedTicks,
  }
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
  /**
   * Which ladder to read from the SAME order book:
   *  - `borrow` (default) → `offers` (bids): what a borrower takes / pays.
   *  - `lend`             → `lendOffers` (asks): what a lender takes / earns.
   */
  side?: 'borrow' | 'lend'
  /** Drop offers smaller than this USD size (dust). */
  minAssetsUsd?: number
  count?: number
  enabled?: boolean
}) {
  const { chainId, lender, side = 'borrow', minAssetsUsd, count = 25, enabled = true } = params

  const isOrderBook = !!lender && lender.toUpperCase().startsWith('MORPHO_MIDNIGHT')

  const query = useQuery<{ offers: LendingOffer[] }>({
    queryKey: ['lendingOffers', chainId, lender, side, count, minAssetsUsd],
    enabled: enabled && isOrderBook && !!chainId && !!lender,
    queryFn: async () => {
      const sp = new URLSearchParams()
      sp.set('chains', chainId!)
      sp.set('lenders', lender!)
      sp.set('includeOffers', 'true')
      sp.set('count', String(count))
      sp.set('maxRiskScore', '100')
      if (minAssetsUsd != null) sp.set('minAssetsUsd', String(minAssetsUsd))
      const r = await fetch(`${BACKEND_BASE_URL}/v1/data/lending/latest?${sp.toString()}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = (await r.json()) as { data?: { items?: any[] } }
      const items = json.data?.items ?? []
      const item = items.find(
        (it) => String(it?.lenderInfo?.key ?? '').toUpperCase() === lender!.toUpperCase()
      )
      // Both ladders hang off the loan (borrowable) leg: `offers` = bids (borrow),
      // `lendOffers` = asks (lend). Pick by side.
      const loan = (item?.markets ?? []).find(
        (m: any) => m?.config?.['0'] && !m.config['0'].debtDisabled
      )
      const raw = side === 'lend' ? loan?.lendOffers : loan?.offers
      return { offers: (raw ?? []) as LendingOffer[] }
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

/**
 * Both sides of an order-book market in ONE snapshot: `asks` (the lend/supply
 * ladder, best-yield first) and `bids` (the borrow/demand ladder, best-rate
 * first). Sourced from the same `/lending/latest?includeOffers` response as
 * {@link useLendingOffers} — a single fetch, so the two-sided book stays
 * internally consistent (no split fetches drifting a refresh apart).
 *
 * Provider-agnostic; enablement keys off the Midnight lender prefix (the only
 * order-book lender today).
 */
export function useMidnightBook(params: {
  chainId?: string
  lender?: string
  minAssetsUsd?: number
  count?: number
  enabled?: boolean
}) {
  const { chainId, lender, minAssetsUsd, count = 25, enabled = true } = params

  const isOrderBook = !!lender && lender.toUpperCase().startsWith('MORPHO_MIDNIGHT')

  const query = useQuery<{ asks: LendingOffer[]; bids: LendingOffer[] }>({
    queryKey: ['midnightBook', chainId, lender, count, minAssetsUsd],
    enabled: enabled && isOrderBook && !!chainId && !!lender,
    queryFn: async () => {
      const sp = new URLSearchParams()
      sp.set('chains', chainId!)
      sp.set('lenders', lender!)
      sp.set('includeOffers', 'true')
      sp.set('count', String(count))
      sp.set('maxRiskScore', '100')
      if (minAssetsUsd != null) sp.set('minAssetsUsd', String(minAssetsUsd))
      const r = await fetch(`${BACKEND_BASE_URL}/v1/data/lending/latest?${sp.toString()}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = (await r.json()) as { data?: { items?: any[] } }
      const items = json.data?.items ?? []
      const item = items.find(
        (it) => String(it?.lenderInfo?.key ?? '').toUpperCase() === lender!.toUpperCase()
      )
      const loan = (item?.markets ?? []).find(
        (m: any) => m?.config?.['0'] && !m.config['0'].debtDisabled
      )
      return {
        asks: (loan?.lendOffers ?? []) as LendingOffer[],
        bids: (loan?.offers ?? []) as LendingOffer[],
      }
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
    retry: 1,
  })

  return {
    asks: query.data?.asks ?? [],
    bids: query.data?.bids ?? [],
    isLoading: query.isLoading,
    error: query.error,
  }
}
