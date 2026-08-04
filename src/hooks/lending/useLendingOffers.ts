import { useQuery } from '@tanstack/react-query'
import { BACKEND_BASE_URL } from '../../config/backend'

/** How a book's levels compose into an executed rate. `marginal` = each level
 *  is an independent lot filled at its own APR (Midnight offers, Term
 *  listings) — the effective rate is the size-weighted average. `uniform` =
 *  ONE curve rate applies to the WHOLE trade at its final size (Exactly fixed
 *  pools) — the effective rate is the level covering the amount; never
 *  average across levels. */
export type BookPricing = 'marginal' | 'uniform'

/** One live maker offer (a level of a market's order book). */
export interface LendingOffer {
  /** Maker-signed tick (price point) — opaque, for keys/debug. Synthesized
   *  (`lvl-<i>`) for books whose levels have no tick (Term, Exactly). */
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
  amountTokens: number,
  pricing: BookPricing = 'marginal'
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
  // Uniform pricing (Exactly curve): the WHOLE amount executes at the rate of
  // the level covering it — pick that level, don't average. Highlight the run
  // up to it so the ladder reads the same as marginal books.
  if (pricing === 'uniform') {
    const consumedTicks: string[] = []
    let boundary: LendingOffer | null = null
    for (const o of offers) {
      consumedTicks.push(o.tick)
      boundary = o
      if (o.cumulativeAssets >= amountTokens - 1e-12) break
    }
    const depth = offers[offers.length - 1].cumulativeAssets
    const short = amountTokens > depth + 1e-12
    const aprPct = boundary?.aprPct ?? null
    return {
      aprPct,
      worstAprPct: aprPct,
      filled: Math.min(amountTokens, depth),
      short,
      consumedTicks,
    }
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
   * Full `lender:chainId:asset` marketUid. REQUIRED for cross-margin lenders
   * whose single key spans many assets (Exactly): the key alone cannot say
   * which asset's fixed pool to ladder. When given it also supplies
   * lender/chainId, so callers need not split it themselves.
   */
  marketUid?: string
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
  /** Exactly: fixed-pool maturity to ladder (defaults to the nearest live). */
  termId?: number
}) {
  const { marketUid, side = 'borrow', minAssetsUsd, count = 25, enabled = true, termId } = params
  const [uidLender, uidChain] = (marketUid ?? '').split(':')
  const lender = params.lender || uidLender || ''
  const chainId = params.chainId || uidChain || ''

  // Every lender the unified /book endpoint serves — Midnight (offer book),
  // Term (secondary listings), Exactly (synthetic utilization-curve levels).
  const key = (lender ?? '').toUpperCase()
  const isOrderBook =
    key.startsWith('MORPHO_MIDNIGHT') || key.startsWith('TERM_FINANCE') || key.startsWith('EXACTLY')

  const query = useQuery<{ offers: LendingOffer[]; pricing: BookPricing }>({
    queryKey: ['lendingOffers', chainId, lender, marketUid, side, count, minAssetsUsd, termId],
    enabled: enabled && isOrderBook && !!chainId && !!lender,
    queryFn: async () => {
      const sp = new URLSearchParams()
      sp.set('lender', lender!)
      sp.set('chainId', chainId!)
      // Carries the asset segment — the only way to pick a market on a
      // cross-margin lender (Exactly).
      if (marketUid) sp.set('marketUid', marketUid)
      sp.set('side', side)
      sp.set('count', String(count))
      if (minAssetsUsd != null) sp.set('minAssetsUsd', String(minAssetsUsd))
      if (termId != null) sp.set('termId', String(termId))
      const r = await fetch(`${BACKEND_BASE_URL}/v1/data/lending/book?${sp.toString()}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = (await r.json()) as {
        data?: { levels?: any[]; pricing?: BookPricing }
      }
      const raw = json.data?.levels ?? []
      // Levels without a tick (Term/Exactly) get a synthetic stable key so the
      // ladder's consumed-set / React keys keep working unchanged.
      const offers = raw.map((o: any, i: number) => ({
        ...o,
        tick: o.tick ?? `lvl-${i}`,
      })) as LendingOffer[]
      return { offers, pricing: json.data?.pricing ?? 'marginal' }
    },
    // A live order book — refresh often, but let stale data serve instantly.
    refetchInterval: 30_000,
    staleTime: 10_000,
    retry: 1,
  })

  return {
    offers: query.data?.offers ?? [],
    pricing: (query.data?.pricing ?? 'marginal') as BookPricing,
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
