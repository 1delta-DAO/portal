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
