import type { EarnFacetBucket } from '../../../../sdk/earn-helper'

/**
 * What an asset query resolved to.
 *
 * `kind: 'none'` clears the filter; `'unmatched'` is reported to the user
 * rather than sent, because the server matches symbols EXACTLY — a query it
 * cannot match returns an empty table that looks identical to "this asset has
 * no markets", which is the wrong answer to a typo.
 */
export type AssetFilter =
  | { kind: 'none' }
  | { kind: 'address'; asset: string }
  | { kind: 'symbol'; assetSymbol: string }
  | { kind: 'search'; search: string }

/**
 * Resolve free text to an asset filter.
 *
 * An ADDRESS is taken verbatim — it names exactly one token on one chain, and
 * that is the whole reason this accepts addresses at all: three unrelated
 * tokens ship as `USD3` and three more as `USDP`, so a symbol cannot always
 * name the thing the user means, and a token whose ticker they do not know
 * cannot be named by symbol at all.
 *
 * A SYMBOL is resolved against the facet list — the server's own vocabulary
 * for this listing — with an exact case-insensitive hit preferred over a
 * unique substring, because `assetSymbol` is an exact server-side equality and
 * sending `usdc` verbatim would return nothing.
 *
 * ANYTHING ELSE becomes a full-text `search`, which the server matches across
 * a row's name, brand, curator, protocol and asset and ranks exact-first. That
 * used to be `unmatched` — a dead end that reported "no match" for every query
 * naming something other than a deposit asset, so a listing full of vaults
 * could not be searched by vault name. A query is only unresolvable now if it
 * is empty.
 */
export function resolveAssetFilter(raw: string, options: EarnFacetBucket[]): AssetFilter {
  const t = raw.trim()
  if (!t) return { kind: 'none' }

  if (/^0x[0-9a-fA-F]{40}$/.test(t)) {
    return { kind: 'address', asset: t.toLowerCase() }
  }

  const q = t.toLowerCase()
  const exact = options.find((o) => o.key.toLowerCase() === q)
  if (exact) return { kind: 'symbol', assetSymbol: exact.key }

  const partial = options.filter((o) => o.key.toLowerCase().includes(q))
  if (partial.length === 1) return { kind: 'symbol', assetSymbol: partial[0].key }

  // Two or more assets match, or none does. Either way the honest reading is
  // "the user is searching", not "the user meant one asset and mistyped it" —
  // and the server can rank a search where an exact-equality filter cannot
  // express one at all.
  return { kind: 'search', search: t }
}

/**
 * Parse the min-TVL box into the three states the server distinguishes.
 *
 * `undefined` = send nothing, so the server applies its own default.
 * `0`         = an explicit floor of zero, i.e. no floor.
 * `null`      = unparseable; the caller reverts rather than filtering.
 *
 * The `undefined`/`0` split is the one that matters and the one that has
 * already gone wrong twice: `0` treated as falsy re-applies the default under
 * a control that reads "0", and `0` passed into a SQL `>= 0` deletes every
 * unpriced row. Neither is what "no floor" means.
 */
export function parseMinTvl(raw: string): number | undefined | null {
  const t = raw.trim()
  if (t === '') return undefined
  const n = Number(t.replace(/[, _]/g, ''))
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

/** `12345` → `12.3k`. Compact enough for a placeholder, exact enough to trust. */
export function formatUsdShort(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}b`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}m`
  if (n >= 1e3) return `${(n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1)}k`
  return String(n)
}
