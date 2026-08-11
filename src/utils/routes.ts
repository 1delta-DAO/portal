import type { SubTab } from '../components/lending/LendingTab'

export type { SubTab }

/** URL slug → internal tab key */
const SLUG_TO_TAB: Record<string, SubTab> = {
  earn: 'earn',
  unified: 'unified',
  lending: 'lending',
  loop: 'trading',
  swap: 'swap',
  'x-chain': 'xswap',
  optimize: 'optimize',
}

/** Internal tab key → URL slug */
const TAB_TO_SLUG: Record<SubTab, string> = {
  earn: 'earn',
  unified: 'unified',
  lending: 'lending',
  trading: 'loop',
  swap: 'swap',
  xswap: 'x-chain',
  optimize: 'optimize',
}

export function tabFromSlug(slug: string | undefined): SubTab {
  if (!slug) return 'earn'
  return SLUG_TO_TAB[slug.toLowerCase()] ?? 'earn'
}

// ---------------------------------------------------------------------------
// Chain selection
//
// The `:chainId` route segment carries a CSV so a tab can browse several chains
// at once (`/earn/1,8453,42161`). A single id parses to a one-element list, so
// every pre-existing deep link keeps working unchanged.
// ---------------------------------------------------------------------------

/**
 * How many chains a multi-chain tab may select at once.
 *
 * `/lending/pools` is single-chain server-side, so Earn fans out one request
 * per selected chain — the cap is what keeps that fan-out (and the optimizer's
 * cross-chain ranking) bounded. 48 chains are wired in `wagmi.ts`.
 */
export const MAX_MULTI_CHAINS = 5

/**
 * Whether a tab's chain selection is one chain, several, or not applicable.
 *
 * `xswap` is `none`: the bridge panel carries its own from/to chain pickers on
 * each currency, so a global selector there would be a second, conflicting
 * source of truth.
 */
export type ChainMode = 'single' | 'multi' | 'none'

export const TAB_CHAIN_MODE: Record<SubTab, ChainMode> = {
  earn: 'multi',
  // The earn endpoint merges across chains server-side in one request, so the
  // multi-chain selector costs nothing extra here.
  unified: 'multi',
  optimize: 'multi',
  lending: 'single',
  trading: 'single',
  swap: 'single',
  xswap: 'none',
}

/** Parse a `:chainId` route segment (`"1"` or `"1,8453"`) into chain ids. */
export function parseChainIds(segment: string | undefined): string[] {
  if (!segment) return []
  return Array.from(
    new Set(
      segment
        .split(',')
        .map((s) => s.trim())
        // Chain ids are numeric; anything else (notably the old "all"
        // sentinel, which every backend endpoint answers with zero rows) is
        // dropped rather than forwarded into a query that silently returns
        // nothing.
        .filter((s) => s.length > 0 && /^\d+$/.test(s))
    )
  )
}

/** Serialize chain ids back into a route segment. */
export function serializeChainIds(chainIds: string[]): string {
  return chainIds.join(',')
}

export function slugFromTab(tab: SubTab): string {
  return TAB_TO_SLUG[tab]
}

/**
 * Convert an internal lender key to a URL-friendly slug: `AAVE_V3` → `aave-v3`.
 *
 * **Lender keys use `_` as their only separator** — verified across all ~9k
 * keys in `lender-labels.json`. That invariant is what makes this mapping
 * reversible, and it is enforced upstream: Sky/USDD market keys embed a Maker
 * ilk whose own `-` is re-spelled at construction (`WBTC-A` →
 * `SKY_1_WBTC_A`, see margin-fetcher's `dssLenderKey`), precisely because a
 * key mixing both separators cannot survive this round-trip.
 *
 * The `.` escape below is a SAFETY NET for a key that violates the invariant
 * anyway: without it, a stray hyphen collapses into the `_` mapping and
 * `slugToLender` returns a key matching no lender, so the page silently falls
 * back to whichever lender sorts first rather than failing loudly. It never
 * fires today, and it leaves every hyphen-free key byte-identical, so all
 * existing links are unaffected.
 */
export function lenderToSlug(lenderKey: string): string {
  return lenderKey.toLowerCase().replace(/-/g, '.').replace(/_/g, '-')
}

/**
 * Convert a URL slug back to the internal lender key: `aave-v3` → `AAVE_V3`,
 * `sky-1-wbtc-a` → `SKY_1_WBTC_A`. Inverse of {@link lenderToSlug}; the order
 * of the two replacements is load-bearing in both directions.
 */
export function slugToLender(slug: string): string {
  return slug.toUpperCase().replace(/-/g, '_').replace(/\./g, '-')
}

export function buildPath(
  tab: SubTab,
  chainId?: string | string[],
  lender?: string,
  query?: Record<string, string | number | undefined | null>
): string {
  const parts = ['', slugFromTab(tab)]
  const chainSegment = Array.isArray(chainId) ? serializeChainIds(chainId) : chainId
  if (chainSegment) {
    parts.push(chainSegment)
    if (lender) parts.push(lenderToSlug(lender))
  }
  let path = parts.join('/')
  if (query) {
    const search = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue
      search.set(k, String(v))
    }
    const qs = search.toString()
    if (qs) path += `?${qs}`
  }
  return path
}

/**
 * Query-param keys used to deep-link from the optimizer into Lending / Loop.
 * Centralised so producers and consumers can't drift.
 *
 * `colMarket` / `debtMarket` carry the pair's **market UIDs** and are the
 * primary handle; `collateral` / `debt` carry token addresses and remain as the
 * fallback (and keep older shared links working). An address is ambiguous on
 * vault lenders — Euler runs many vaults over the same underlying, so resolving
 * a hand-off by address lands on whichever vault happens to be first, which is
 * usually not the one whose rate was on screen. A UID names exactly one market.
 */
export const OPTIMIZER_DEEPLINK_KEYS = {
  collateral: 'col',
  debt: 'debt',
  colMarket: 'colm',
  debtMarket: 'debtm',
  action: 'action',
  config: 'config',
  amount: 'amt',
} as const

export type LendingDeepLinkAction = 'deposit' | 'withdraw' | 'borrow' | 'repay'
