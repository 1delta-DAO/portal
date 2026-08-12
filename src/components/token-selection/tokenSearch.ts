import type { RawCurrency } from '../../types/currency'

/**
 * Relevance ranking for the token search box.
 *
 * A plain `includes()` filter treats "USDe" and "PT-USDe-26JUN2025" as equally
 * good answers to the query "usde", and whatever the list order happens to be
 * decides which one the user sees first. On chains with a long tail of Pendle
 * PTs, LP receipts and wrappers, the token actually being searched for is
 * pushed below a dozen derivatives of it.
 *
 * So matches get a tier instead of a boolean. Lower is better:
 *
 *   0  symbol is exactly the query           "usdc"  -> USDC
 *   1  address is exactly the query          a pasted address
 *   2  name is exactly the query             "usd coin" -> USD Coin
 *   3  symbol starts with the query          "usdc"  -> USDC.e
 *   4  name starts with the query            "usd"   -> "USD Coin"
 *   5  a word of the name starts with it     "usdc"  -> "Bridged USDC"
 *   6  symbol contains the query             "usde"  -> PT-USDe, sUSDe
 *   7  name contains the query               "usde"  -> "Pendle PT USDe"
 *   8  address contains the query            an address fragment
 *
 * Case is never significant — every comparison runs on lowercased input.
 */
export const NO_MATCH = Number.POSITIVE_INFINITY

/** Highest tier a match can score; anything else sorts after it. */
export const BEST_MATCH = 0

export function normalizeTokenQuery(raw: string): string {
  return raw.trim().toLowerCase()
}

/** True when `query` starts a word inside `text` (word = run after a separator). */
function hasWordStartingWith(text: string, query: string): boolean {
  let from = 0
  for (;;) {
    const at = text.indexOf(query, from)
    if (at === -1) return false
    // Position 0 is covered by the startsWith tiers, but keeping it here makes
    // the helper correct on its own.
    if (at === 0 || !/[a-z0-9]/.test(text[at - 1])) return true
    from = at + 1
  }
}

/**
 * Score `token` against an already-normalized `query`.
 *
 * @param query - lowercased, trimmed. An empty query matches everything at the
 *   best tier, so callers can score unconditionally.
 * @param address - the token's address; matched separately from the metadata so
 *   a pasted address still wins even when symbol and name say nothing.
 * @returns the tier (lower is better), or `NO_MATCH` if the token should be
 *   hidden entirely.
 */
export function scoreTokenMatch(
  query: string,
  token: Pick<RawCurrency, 'symbol' | 'name'> | undefined,
  address: string
): number {
  if (!query) return BEST_MATCH
  if (!token) return NO_MATCH

  const symbol = (token.symbol ?? '').toLowerCase()
  const name = (token.name ?? '').toLowerCase()
  const addr = address.toLowerCase()

  if (symbol && symbol === query) return 0
  if (addr === query) return 1
  if (name && name === query) return 2
  if (symbol.startsWith(query)) return 3
  if (name.startsWith(query)) return 4
  if (hasWordStartingWith(name, query)) return 5
  if (symbol.includes(query)) return 6
  if (name.includes(query)) return 7
  if (addr.includes(query)) return 8

  return NO_MATCH
}

/**
 * Order two scored candidates. Tier decides first; a token from the chain's
 * curated (main) list or the user's own imports breaks ties, so the canonical
 * USDC outranks a same-symbol impostor from the long tail.
 */
export function compareTokenMatches(
  a: { score: number; isMainOrUser: boolean; symbol?: string },
  b: { score: number; isMainOrUser: boolean; symbol?: string }
): number {
  if (a.score !== b.score) return a.score - b.score
  if (a.isMainOrUser !== b.isMainOrUser) return a.isMainOrUser ? -1 : 1
  // Shorter symbols are the plainer token: USDC before USDC-LP-ABC.
  const lengthDiff = (a.symbol ?? '').length - (b.symbol ?? '').length
  if (lengthDiff !== 0) return lengthDiff
  return (a.symbol ?? '').localeCompare(b.symbol ?? '')
}
