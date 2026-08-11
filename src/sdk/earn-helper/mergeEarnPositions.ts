import {
  EMPTY_POSITION_TOTALS,
  type EarnPosition,
  type EarnPositionSourceStatus,
  type EarnPositionTotals,
} from './positionTypes'
import type { FetchEarnPositionsResult } from './fetchEarnPositions'

/**
 * Combine per-chain `/v1/data/earn/positions` payloads into one portfolio.
 *
 * **Why this exists when the endpoint is already multi-chain.** It is — one
 * request can take every chain, and the server does the discovery, the
 * normalization and the merge. But a single request also makes the CHAIN
 * SELECTION part of the cache key, so adding a fourth chain discards the three
 * the user was already looking at and re-reads every position on all four.
 * Fetching per chain makes chain membership the cache boundary it actually is:
 * removing a chain costs no network at all, adding one fetches only the chain
 * that was added, and a slow chain never blocks the rest.
 *
 * **This is not the client-side merge the unified tab exists to avoid.** That
 * one meant re-implementing venue matrices, withdrawal routing and rate
 * normalization in the browser. This concatenates already-normalized rows and
 * re-adds five numbers — the server still decides what every row means.
 *
 * Pure and total: no fetching, no react-query, no ordering assumptions about
 * the inputs.
 */
export interface MergedEarnPositions {
  items: EarnPosition[]
  totals: EarnPositionTotals
  sources: EarnPositionSourceStatus[]
  partial: boolean
  stale: boolean
}

const STATUS_RANK = { ok: 0, degraded: 1, failed: 2 } as const

/**
 * Totals over the ROWS PRESENT, re-derived rather than summed from the
 * per-chain `totals`.
 *
 * The two only differ while a chain is still loading or has failed — and in
 * exactly that case the per-chain sum would describe a portfolio the table is
 * not showing. Deriving from the rows keeps the header and the table the same
 * statement, and the caller reports the missing chains separately.
 */
export function totalsFromPositions(items: EarnPosition[]): EarnPositionTotals {
  if (items.length === 0) return EMPTY_POSITION_TOTALS
  let suppliedUsd = 0
  let borrowedUsd = 0
  let lendingUsd = 0
  let vaultUsd = 0
  for (const it of items) {
    suppliedUsd += it.suppliedUsd
    borrowedUsd += it.borrowedUsd
    if (it.venueKind === 'vault') vaultUsd += it.netUsd
    else lendingUsd += it.netUsd
  }
  return {
    suppliedUsd,
    borrowedUsd,
    netUsd: suppliedUsd - borrowedUsd,
    lendingUsd,
    vaultUsd,
  }
}

/**
 * Merge per-chain results.
 *
 * Ordering mirrors the server's: net asset value descending, tie-broken on
 * gross size. Keeping the rule identical on both sides means a one-chain
 * selection and a five-chain one order the same way, so the list does not
 * reshuffle for a reason the user cannot see.
 */
export function mergeEarnPositions(
  results: (FetchEarnPositionsResult | undefined)[]
): MergedEarnPositions {
  const items: EarnPosition[] = []
  const bySource = new Map<string, EarnPositionSourceStatus>()
  let partial = false
  let stale = false

  for (const res of results) {
    if (!res?.success) continue
    if (res.items) items.push(...res.items)
    if (res.partial) partial = true
    if (res.stale) stale = true

    for (const s of res.sources ?? []) {
      const prev = bySource.get(s.source)
      if (!prev) {
        bySource.set(s.source, { ...s })
        continue
      }
      // WORST status wins, and the reasons accumulate — one chain's vault half
      // failing must not be erased by another chain's succeeding, or the user
      // reads a portfolio missing a chain as a complete one.
      bySource.set(s.source, {
        source: s.source,
        status: STATUS_RANK[s.status] > STATUS_RANK[prev.status] ? s.status : prev.status,
        rows: prev.rows + s.rows,
        error: [prev.error, s.error].filter(Boolean).join('; ') || undefined,
      })
    }
  }

  items.sort(
    (a, b) => b.netUsd - a.netUsd || b.suppliedUsd + b.borrowedUsd - (a.suppliedUsd + a.borrowedUsd)
  )

  return {
    items,
    totals: totalsFromPositions(items),
    sources: [...bySource.values()],
    partial,
    stale,
  }
}
