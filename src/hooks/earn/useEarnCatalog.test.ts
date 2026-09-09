import { describe, expect, it } from 'vitest'
import { earnRequestKey, type EarnCatalogRequest } from './useEarnCatalog'

/**
 * A request with EVERY filter set, so the coverage test below can vary one
 * field at a time. Add a field to `EarnCatalogRequest` and this object stops
 * type-checking until it is listed here — which is the point.
 */
const FULL: Required<EarnCatalogRequest> = {
  brand: ['Aave'],
  protocol: ['Morpho'],
  curator: ['Gauntlet'],
  venue: ['aave-v3'],
  venueKind: 'lending',
  assetGroup: 'usd',
  assetSymbol: 'USDC',
  asset: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  search: 'aave',
  terms: 'full',
  depositableOnly: true,
  includePassthrough: true,
  includeIlliquid: true,
  minTvlUsd: 25_000,
  maxRiskScore: 3,
  sort: 'rate',
}

/** A different value for each field — anything the server would treat as a
 *  different question. */
const OTHER: Required<EarnCatalogRequest> = {
  brand: ['Compound'],
  protocol: ['Euler'],
  curator: ['Steakhouse'],
  venue: ['aave-v4'],
  venueKind: 'vault',
  assetGroup: 'eth',
  assetSymbol: 'USDT',
  asset: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  search: 'morpho',
  terms: 'digest',
  depositableOnly: false,
  includePassthrough: false,
  includeIlliquid: false,
  minTvlUsd: 0,
  maxRiskScore: 4,
  sort: 'tvl',
}

describe('earnRequestKey — the cache key covers the whole request', () => {
  // The regression this file exists for: `search` reached the server but not
  // the key, so React Query kept serving the rows fetched WITHOUT it. Typing a
  // name changed nothing until another control moved the key.
  it('changes when the search term changes', () => {
    expect(earnRequestKey({ search: 'aave' })).not.toBe(earnRequestKey({ search: 'morpho' }))
    expect(earnRequestKey({ search: 'aave' })).not.toBe(earnRequestKey({}))
  })

  it.each(Object.keys(FULL) as (keyof EarnCatalogRequest)[])(
    'changes when %s changes — every parameter sent is a parameter keyed',
    (field) => {
      expect(earnRequestKey({ ...FULL, [field]: OTHER[field] })).not.toBe(earnRequestKey(FULL))
      // Dropping a filter is a different question too.
      expect(earnRequestKey({ ...FULL, [field]: undefined })).not.toBe(earnRequestKey(FULL))
    }
  )

  it('is stable when a multi-select is re-ordered', () => {
    // Same selection, different order: re-keying here would throw away a
    // rendered listing and re-fetch every chain for nothing.
    expect(earnRequestKey({ brand: ['a', 'b'], venue: ['x', 'y'] })).toBe(
      earnRequestKey({ brand: ['b', 'a'], venue: ['y', 'x'] })
    )
  })

  it('is stable when the fields are written in a different order', () => {
    expect(earnRequestKey({ search: 'aave', sort: 'rate' })).toBe(
      earnRequestKey({ sort: 'rate', search: 'aave' })
    )
  })

  it('distinguishes an explicit zero floor from no floor at all', () => {
    // `0` disables the server's default minimum TVL; `undefined` keeps it.
    // Collapsing the two would serve a filtered listing for an unfiltered ask.
    expect(earnRequestKey({ minTvlUsd: 0 })).not.toBe(earnRequestKey({}))
  })
})
