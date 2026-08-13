import { describe, expect, it } from 'vitest'
import { compareEarnRows, mergeEarnCatalog } from './mergeEarnCatalog'
import type { EarnMarket } from './types'

/**
 * The merge exists because the listing is now fetched one query per chain, and
 * each response is only sorted WITHIN itself. Everything here is a property the
 * single-request version got for free from the server and that the client is
 * now responsible for.
 */

const row = (earnUid: string, over: Partial<EarnMarket> = {}): EarnMarket =>
  ({
    earnUid,
    chainId: '1',
    venue: 'v',
    venueKind: 'lending',
    ref: 'r',
    asset: { address: '0x0', symbol: 'USDC', decimals: 6 },
    rate: { total: 1, kind: 'variable-curve', source: 'chain' },
    tvl: { usd: 1 },
    exit: { mode: 'instant' },
    availability: { canDeposit: true, canWithdraw: true },
    capabilities: [],
    ...over,
  }) as EarnMarket

const chunk = (items: EarnMarket[], over = {}) => ({ items, total: items.length, ...over })

describe('mergeEarnCatalog', () => {
  it('interleaves chains by rate rather than concatenating them', () => {
    // The bug this prevents: chain A's 3% row sitting above chain B's 40% row
    // purely because A resolved first.
    const a = chunk([
      row('a1', { rate: { total: 5, kind: 'k', source: 's' } }),
      row('a2', { rate: { total: 1, kind: 'k', source: 's' } }),
    ])
    const b = chunk([
      row('b1', { rate: { total: 9, kind: 'k', source: 's' } }),
      row('b2', { rate: { total: 3, kind: 'k', source: 's' } }),
    ])
    expect(mergeEarnCatalog([a, b], 'rate').items.map((r) => r.earnUid)).toEqual([
      'b1',
      'a1',
      'b2',
      'a2',
    ])
  })

  it('sorts unranked rows last instead of treating them as zero', () => {
    const items = mergeEarnCatalog(
      [
        chunk([
          row('none', { liquidity: undefined }),
          row('some', { liquidity: { formatted: 0, usd: 4 } }),
          row('zero', { liquidity: { formatted: 0, usd: 0 } }),
        ]),
      ],
      'liquidity'
    ).items
    expect(items.map((r) => r.earnUid)).toEqual(['some', 'zero', 'none'])
  })

  it('is stable across ties, so a late chain does not reshuffle the table', () => {
    // 800.00% appears dozens of times in the real listing; without a
    // deterministic tie-break those rows swap places on every arrival.
    const tied = (uid: string) => row(uid, { rate: { total: 800, kind: 'k', source: 's' } })
    const first = mergeEarnCatalog([chunk([tied('x'), tied('y')])], 'rate')
    const later = mergeEarnCatalog([chunk([tied('y')]), chunk([tied('x')])], 'rate')
    expect(later.items.map((r) => r.earnUid)).toEqual(first.items.map((r) => r.earnUid))
  })

  it('falls back to the total rate when a row has no venue-own rate', () => {
    const withOwn = row('own', { rate: { total: 9, marketOwn: 2, kind: 'k', source: 's' } })
    const totalOnly = row('tot', { rate: { total: 5, kind: 'k', source: 's' } })
    expect(compareEarnRows(withOwn, totalOnly, 'marketRate')).toBeGreaterThan(0)
  })

  it('sums facet counts per key and keeps the first label', () => {
    const a = chunk([], {
      facets: { protocols: [{ key: 'Morpho Blue', label: 'Morpho Blue', count: 10 }] },
    })
    const b = chunk([], {
      facets: {
        protocols: [
          { key: 'Morpho Blue', count: 4 },
          { key: 'Venus', count: 30 },
        ],
      },
    })
    const { facets } = mergeEarnCatalog([a, b], 'rate')
    // Biggest first, as the server serves them.
    expect(facets.protocols).toEqual([
      { key: 'Venus', label: undefined, description: undefined, count: 30 },
      { key: 'Morpho Blue', label: 'Morpho Blue', description: undefined, count: 14 },
    ])
  })

  it('keeps a facet dimension this client has never heard of', () => {
    // The vocabulary is the server's; a new dimension must reach the UI without
    // a release here.
    const { facets } = mergeEarnCatalog(
      [chunk([], { facets: { somethingNew: [{ key: 'x', count: 2 }] } })],
      'rate'
    )
    expect((facets as unknown as Record<string, unknown>).somethingNew).toEqual([
      { key: 'x', label: undefined, description: undefined, count: 2 },
    ])
  })

  it('never drops a known dimension, even when no chain reported it', () => {
    const { facets } = mergeEarnCatalog([chunk([])], 'rate')
    expect(Array.isArray(facets.protocols)).toBe(true)
  })

  it('sums exclusion counts across chains', () => {
    const excluded = { passthrough: 1, illiquid: 2, lowTvl: 3, highRisk: 4 }
    const { excluded: merged } = mergeEarnCatalog(
      [chunk([], { excluded }), chunk([], { excluded })],
      'rate'
    )
    expect(merged).toEqual({ passthrough: 2, illiquid: 4, lowTvl: 6, highRisk: 8 })
  })

  it('lets the worst source status win and accumulates the reasons', () => {
    const { sources } = mergeEarnCatalog(
      [
        chunk([], { sources: [{ source: 'vaults', status: 'ok', rows: 5 }] }),
        chunk([], {
          sources: [{ source: 'vaults', status: 'failed', rows: 0, error: 'upstream 500' }],
        }),
      ],
      'rate'
    )
    // A chain succeeding must not erase another chain's failure, or a listing
    // missing a chain reads as complete.
    expect(sources).toEqual([
      { source: 'vaults', status: 'failed', rows: 5, error: 'upstream 500' },
    ])
  })

  it('ignores chains that have not answered yet', () => {
    const merged = mergeEarnCatalog([undefined, chunk([row('a')])], 'rate')
    expect(merged.items).toHaveLength(1)
    expect(merged.total).toBe(1)
  })

  it('reports the server total, not the rows in hand, while pages stream', () => {
    // `total > items.length` is what tells the UI it is still filling.
    const merged = mergeEarnCatalog([chunk([row('a')], { total: 900 })], 'rate')
    expect(merged.total).toBe(900)
    expect(merged.items).toHaveLength(1)
  })
})
