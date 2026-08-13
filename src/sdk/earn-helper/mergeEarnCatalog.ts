import {
  EMPTY_FACETS,
  type EarnExclusions,
  type EarnFacetBucket,
  type EarnFacets,
  type EarnMarket,
  type EarnSourceStatus,
} from './types'

/**
 * Combine per-chain `/v1/data/earn` payloads into one listing.
 *
 * The sibling of {@link mergeEarnPositions}, and it exists for the same reason:
 * the endpoint takes a CSV of chains, but a single request makes the CHAIN
 * SELECTION part of the cache key, so adding a fourth chain discards the three
 * already on screen and re-reads all four. It also puts every chain behind the
 * slowest one — on the hosted API a three-chain listing is ~5 s before the
 * table renders its first row, when the fastest chain answered in ~2 s.
 *
 * Per-chain queries turn that into: each chain appears as it lands, removing a
 * chain costs no network, and a failing chain degrades to a named row instead
 * of an empty table.
 *
 * Pure and total: no fetching, no react-query, no ordering assumptions about
 * the inputs.
 */

export type EarnSortKey = 'rate' | 'marketRate' | 'tvl' | 'liquidity'

export interface MergedEarnCatalog {
  items: EarnMarket[]
  facets: EarnFacets
  sources: EarnSourceStatus[]
  excluded: EarnExclusions
  /** Rows the FILTERS match across every chain merged — see `items.length`. */
  total: number
}

export interface EarnCatalogChunk {
  items?: EarnMarket[]
  facets?: EarnFacets
  sources?: EarnSourceStatus[]
  excluded?: EarnExclusions
  total?: number
}

export const EMPTY_EXCLUSIONS: EarnExclusions = {
  passthrough: 0,
  illiquid: 0,
  lowTvl: 0,
  highRisk: 0,
}

const STATUS_RANK = { ok: 0, degraded: 1, failed: 2 } as const

/**
 * The value a row is ranked by, or `null` when it has none.
 *
 * This mirrors the server's `sort` parameter because the merge has to: with one
 * request per chain each response is sorted within itself, and concatenating
 * two sorted lists is not a sorted list. Rows with no value sort LAST rather
 * than as zero — an unpriced vault is unranked, not worthless.
 */
function sortValue(row: EarnMarket, key: EarnSortKey): number | null {
  const finite = (v: number | undefined | null) => (v != null && Number.isFinite(v) ? v : null)
  switch (key) {
    case 'rate':
      return finite(row.rate?.total)
    case 'marketRate':
      return finite(row.rate?.marketOwn) ?? finite(row.rate?.total)
    case 'tvl':
      return finite(row.tvl?.usd) ?? finite(row.tvl?.formatted)
    case 'liquidity':
      return finite(row.liquidity?.usd) ?? finite(row.liquidity?.formatted)
  }
}

/** Descending by the sort key, nulls last, `earnUid` as the stable tie-break. */
export function compareEarnRows(a: EarnMarket, b: EarnMarket, key: EarnSortKey): number {
  const av = sortValue(a, key)
  const bv = sortValue(b, key)
  if (av == null && bv == null) return a.earnUid < b.earnUid ? -1 : a.earnUid > b.earnUid ? 1 : 0
  if (av == null) return 1
  if (bv == null) return -1
  if (av !== bv) return bv - av
  // Without a deterministic tie-break, rows that tie (800.00% appears dozens of
  // times) would swap places every time another chain lands.
  return a.earnUid < b.earnUid ? -1 : a.earnUid > b.earnUid ? 1 : 0
}

/**
 * Merge facet dimensions by summing bucket counts.
 *
 * Dimension names are NOT enumerated: the server owns this vocabulary and a new
 * dimension has to reach the UI without a release here. Labels and descriptions
 * come from the first chain that supplied one — they describe the key, not the
 * chain.
 */
function mergeFacets(inputs: (EarnFacets | undefined)[]): EarnFacets {
  const byDimension = new Map<string, Map<string, EarnFacetBucket>>()

  for (const facets of inputs) {
    if (!facets) continue
    for (const [dimension, buckets] of Object.entries(
      facets as unknown as Record<string, unknown>
    )) {
      if (!Array.isArray(buckets)) continue
      let acc = byDimension.get(dimension)
      if (!acc) {
        acc = new Map()
        byDimension.set(dimension, acc)
      }
      for (const bucket of buckets as EarnFacetBucket[]) {
        if (!bucket?.key) continue
        const prev = acc.get(bucket.key)
        acc.set(bucket.key, {
          key: bucket.key,
          label: prev?.label ?? bucket.label,
          description: prev?.description ?? bucket.description,
          count: (prev?.count ?? 0) + (bucket.count ?? 0),
        })
      }
    }
  }

  const out: Record<string, EarnFacetBucket[]> = { ...EMPTY_FACETS }
  for (const [dimension, buckets] of byDimension) {
    // Biggest bucket first, as the server serves them — a merged dimension that
    // kept one chain's ordering would put a 3-row venue above a 1400-row one.
    out[dimension] = [...buckets.values()].sort((a, b) => b.count - a.count)
  }
  return out as unknown as EarnFacets
}

export function mergeEarnCatalog(
  chunks: (EarnCatalogChunk | undefined)[],
  sort: EarnSortKey
): MergedEarnCatalog {
  const items: EarnMarket[] = []
  const bySource = new Map<string, EarnSourceStatus>()
  const excluded: EarnExclusions = { ...EMPTY_EXCLUSIONS }
  let total = 0

  for (const chunk of chunks) {
    if (!chunk) continue
    if (chunk.items) items.push(...chunk.items)
    total += chunk.total ?? chunk.items?.length ?? 0

    if (chunk.excluded) {
      excluded.passthrough += chunk.excluded.passthrough ?? 0
      excluded.illiquid += chunk.excluded.illiquid ?? 0
      excluded.lowTvl += chunk.excluded.lowTvl ?? 0
      excluded.highRisk += chunk.excluded.highRisk ?? 0
    }

    for (const s of chunk.sources ?? []) {
      const prev = bySource.get(s.source)
      if (!prev) {
        bySource.set(s.source, { ...s })
        continue
      }
      // WORST status wins and the reasons accumulate — one chain's vault half
      // failing must not be erased by another chain's succeeding, or a listing
      // missing a chain reads as complete.
      bySource.set(s.source, {
        source: s.source,
        status: STATUS_RANK[s.status] > STATUS_RANK[prev.status] ? s.status : prev.status,
        rows: prev.rows + s.rows,
        error: [prev.error, s.error].filter(Boolean).join('; ') || undefined,
      })
    }
  }

  items.sort((a, b) => compareEarnRows(a, b, sort))

  return {
    items,
    facets: mergeFacets(chunks.map((c) => c?.facets)),
    sources: [...bySource.values()],
    excluded,
    total,
  }
}
