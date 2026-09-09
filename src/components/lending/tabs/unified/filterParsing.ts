import type { EarnFacetBucket } from '../../../../sdk/earn-helper'

/**
 * What the search box resolved to. `none` clears it; everything else searches.
 */
export type AssetFilter = { kind: 'none' } | { kind: 'search'; search: string }

/**
 * Resolve the search box to a filter.
 *
 * It SEARCHES, and it never quietly becomes something else. That sounds like a
 * non-decision; it is the fix for a real failure.
 *
 * This used to convert a query into an exact `assetSymbol` filter whenever the
 * text matched an asset in the facet list — `usdc` → asset USDC — and fell back
 * to search otherwise. The conversion is invisible: the box still reads
 * "svZCHF" while the listing is now filtered by a *different* question. And the
 * two questions genuinely differ, because a row's ASSET is what you deposit,
 * not what the row is called:
 *
 *   - the Frankencoin svZCHF vault has asset **ZCHF** — you deposit ZCHF;
 *   - two lending markets take **svZCHF** as collateral, so `svZCHF` is a real
 *     entry in the asset facet list.
 *
 * So typing `svZCHF` narrowed to asset = svZCHF, which is exactly the two
 * collateral legs — both holding no supply, both rendering $0 — while the vault
 * the user was looking for was filtered out for being an svZCHF vault over
 * ZCHF. The listing said "1 opportunity, $0" about a vault holding 1,731 svZCHF.
 *
 * The server's search already covers this: it matches name, brand, curator,
 * protocol, asset symbol, assetGroup, SHARE TOKEN symbol and address, and ranks
 * exact hits first. It runs on the merged catalogue, so it is complete across
 * pages — narrowing to a symbol bought nothing it does not already do better.
 *
 * Exact asset filtering still exists and is still useful. It lives on the
 * dropdown beside this box, where picking `USDC` is an explicit act rather than
 * a side effect of typing.
 */
export function resolveAssetFilter(raw: string, _options?: EarnFacetBucket[]): AssetFilter {
  const t = raw.trim()
  return t ? { kind: 'search', search: t } : { kind: 'none' }
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

/**
 * The vocabulary behind the "underlying" dropdown, and which server parameter
 * it addresses.
 */
export interface AssetVocabulary {
  /** The filter to send. Both are exact matches and the server takes ONE. */
  param: 'assetGroup' | 'assetSymbol'
  options: EarnFacetBucket[]
}

/**
 * Recover a readable label for an asset-group key.
 *
 * `facets.assetGroups` is the underlying axis — it is what merges WETH and ETH
 * into one 128-row `ETH` entry rather than two entries a user has to know to
 * check both of — but its keys are normalised for matching, not for reading:
 * they are upper-cased (`CBBTC`, `WSTETH`, `CRVUSD`) and, where the server
 * could not resolve a canonical group, they carry the token name as a prefix
 * (`PayPal USD::PYUSD`, `apxUSD::APXUSD`).
 *
 * So: take the symbol half, then borrow the natural casing from the SYMBOL
 * facet, which preserves it (`cbBTC`, `wstETH`, `crvUSD`). The raw key is
 * still what gets sent, and the dropdown puts it on the row's `title`, so
 * nothing is hidden — this only decides what the row reads as.
 */
export function assetGroupLabel(key: string, casingBySymbol: Map<string, string>): string {
  const i = key.lastIndexOf('::')
  const symbol = i >= 0 ? key.slice(i + 2) : key
  return casingBySymbol.get(symbol.toLowerCase()) ?? symbol
}

/**
 * Build the underlying-asset filter options from the server's facets.
 *
 * Prefers `assetGroups` — the UNDERLYING, which is the question people ask
 * ("USDC markets", "ETH markets"), and which collapses the ticker variants of
 * one asset into a single row. Falls back to `assets` (raw symbols) when a
 * response carries no groups, so the control degrades to the old behaviour
 * rather than to an empty menu.
 *
 * Ordering is by count, biggest first: with 246 symbols on Ethereum alone —
 * most of them on a single market — an alphabetical list would open on
 * whatever happens to start with "a" instead of on the assets people hold.
 */
export function assetFilterVocabulary(facets: {
  assets?: EarnFacetBucket[]
  assetGroups?: EarnFacetBucket[]
}): AssetVocabulary {
  const assets = facets.assets ?? []
  const groups = facets.assetGroups ?? []

  const casingBySymbol = new Map(assets.map((b) => [b.key.toLowerCase(), b.label ?? b.key]))

  const source = groups.length ? groups : assets
  const param: AssetVocabulary['param'] = groups.length ? 'assetGroup' : 'assetSymbol'

  const options = source
    .filter((b) => b.key && b.count > 0)
    .map((b) => ({
      ...b,
      label: param === 'assetGroup' ? assetGroupLabel(b.key, casingBySymbol) : (b.label ?? b.key),
    }))
    // Defensive: a merged multi-chain dimension is already count-ordered, but a
    // single response's ordering is the server's business, not this list's.
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

  return { param, options }
}
