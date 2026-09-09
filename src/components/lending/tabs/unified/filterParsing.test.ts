import { describe, expect, it } from 'vitest'
import {
  assetFilterVocabulary,
  formatUsdShort,
  parseMinTvl,
  resolveAssetFilter,
} from './filterParsing'
import type { EarnFacetBucket } from '../../../../sdk/earn-helper'

const opts = (...keys: string[]): EarnFacetBucket[] =>
  keys.map((key) => ({ key, count: 1 }) as EarnFacetBucket)

describe('parseMinTvl — three states, not two', () => {
  it('reads an empty box as "use the server default"', () => {
    // Distinct from 0. Sending 0 here would silently disable a floor the user
    // never touched.
    expect(parseMinTvl('')).toBeUndefined()
    expect(parseMinTvl('   ')).toBeUndefined()
  })

  it('preserves an explicit zero as a real value', () => {
    // The whole reason this is a number and not a boolean. `0` has been
    // mishandled twice: read as falsy it re-applies the default, and passed
    // into SQL as `>= 0` it deletes every unpriced row.
    expect(parseMinTvl('0')).toBe(0)
  })

  it('accepts grouped and spaced digits', () => {
    expect(parseMinTvl('25,000')).toBe(25_000)
    expect(parseMinTvl('1 000 000')).toBe(1_000_000)
  })

  it('rejects garbage and negatives rather than filtering by NaN', () => {
    // `null` tells the control to revert. Sending NaN would serialise to an
    // absent param, so the server would re-apply its default under a box
    // showing something else entirely.
    expect(parseMinTvl('abc')).toBeNull()
    expect(parseMinTvl('-5')).toBeNull()
  })
})

describe('resolveAssetFilter — the box SEARCHES, and only searches', () => {
  const list = opts('USDC', 'USDT', 'WETH', 'ZCHF', 'svZCHF')

  it('clears on empty input', () => {
    expect(resolveAssetFilter('', list)).toEqual({ kind: 'none' })
    expect(resolveAssetFilter('   ', list)).toEqual({ kind: 'none' })
  })

  it('never converts a query into an asset filter', () => {
    // THE REGRESSION. Typing `svZCHF` used to narrow the listing to
    // asset = svZCHF, because svZCHF really is an asset — of the two lending
    // markets that take it as COLLATERAL, both holding no supply and both
    // rendering $0. The Frankencoin svZCHF vault's asset is ZCHF, so it was
    // filtered out of a search for its own name, and the table reported
    // "1 opportunity, $0" about a vault holding 1,731 svZCHF.
    //
    // The conversion was invisible: the box still read "svZCHF" while the
    // listing answered a different question.
    expect(resolveAssetFilter('svZCHF', list)).toEqual({ kind: 'search', search: 'svZCHF' })
    expect(resolveAssetFilter('usdc', list)).toEqual({ kind: 'search', search: 'usdc' })
    expect(resolveAssetFilter('svz', list)).toEqual({ kind: 'search', search: 'svz' })
  })

  it('searches an address rather than filtering by it', () => {
    // Same rule, and it matters MORE here: two live contracts are both named
    // `SavingsVault ZCHF` with ticker `svZCHF`, so an address is the only
    // query that separates them — and `searchTier` matches both the asset and
    // the SHARE address, so this finds the vault that IS the token as well as
    // the markets that take it.
    expect(resolveAssetFilter('0xE5F130253ff137F9917C0107659A4C5262ABf6b0', list)).toEqual({
      kind: 'search',
      search: '0xE5F130253ff137F9917C0107659A4C5262ABf6b0',
    })
  })

  it('passes anything else straight through', () => {
    // A curator, a protocol or a vault's own name is not in the asset facet
    // list at all — a box that could only match deposit assets could not
    // search a listing of vaults by vault name.
    expect(resolveAssetFilter('Gauntlet', list)).toEqual({ kind: 'search', search: 'Gauntlet' })
    expect(resolveAssetFilter('usd', list)).toEqual({ kind: 'search', search: 'usd' })
    expect(resolveAssetFilter('Savings Module', list)).toEqual({
      kind: 'search',
      search: 'Savings Module',
    })
  })

  it('trims but does not otherwise rewrite the query', () => {
    // Case is preserved: the server ranks an exact field hit first and lowers
    // both sides itself, so mangling the input here would only lose signal.
    expect(resolveAssetFilter('  svZCHF  ', list)).toEqual({ kind: 'search', search: 'svZCHF' })
  })
})

describe('formatUsdShort', () => {
  it('keeps a round thousand round', () => {
    expect(formatUsdShort(10_000)).toBe('10k')
  })
  it('scales up', () => {
    expect(formatUsdShort(12_345)).toBe('12.3k')
    expect(formatUsdShort(2_500_000)).toBe('2.5m')
    expect(formatUsdShort(1_200_000_000)).toBe('1.2b')
  })
  it('leaves small numbers alone', () => {
    expect(formatUsdShort(0)).toBe('0')
    expect(formatUsdShort(250)).toBe('250')
  })
})

describe('assetFilterVocabulary — filtering by the underlying', () => {
  // Shapes taken from a live /v1/data/earn response for chain 1: group keys are
  // upper-cased and sometimes carry the token NAME as a prefix, while the
  // symbol facet keeps the casing people recognise.
  const assets: EarnFacetBucket[] = [
    { key: 'USDC', count: 282 },
    { key: 'WETH', count: 99 },
    { key: 'cbBTC', count: 49 },
    { key: 'ETH', count: 29 },
    { key: 'PYUSD', count: 22 },
    { key: 'wstETH', count: 21 },
  ]
  const assetGroups: EarnFacetBucket[] = [
    { key: 'USDC', count: 282 },
    { key: 'ETH', count: 128 },
    { key: 'CBBTC', count: 49 },
    { key: 'PayPal USD::PYUSD', count: 22 },
    { key: 'WSTETH', count: 21 },
  ]

  it('prefers the group axis, so WETH and ETH are ONE entry', () => {
    // The whole point of filtering by underlying: 99 + 29 rows behind one
    // choice, instead of two entries a user has to know to check both of.
    const v = assetFilterVocabulary({ assets, assetGroups })
    expect(v.param).toBe('assetGroup')
    expect(v.options.find((o) => o.key === 'ETH')?.count).toBe(128)
  })

  it('sends the raw key and only prettifies the label', () => {
    const v = assetFilterVocabulary({ assets, assetGroups })
    const cbbtc = v.options.find((o) => o.key === 'CBBTC')
    // The server matches the group key EXACTLY and is case-sensitive —
    // labelling must never leak into what is sent.
    expect(cbbtc?.key).toBe('CBBTC')
    expect(cbbtc?.label).toBe('cbBTC')
  })

  it('strips the name prefix the server uses for unresolved groups', () => {
    const v = assetFilterVocabulary({ assets, assetGroups })
    const pyusd = v.options.find((o) => o.key === 'PayPal USD::PYUSD')
    expect(pyusd?.label).toBe('PYUSD')
  })

  it('falls back to raw symbols when a response carries no groups', () => {
    // Degrades to the previous behaviour rather than to an empty menu.
    const v = assetFilterVocabulary({ assets, assetGroups: [] })
    expect(v.param).toBe('assetSymbol')
    expect(v.options.map((o) => o.key)).toEqual(['USDC', 'WETH', 'cbBTC', 'ETH', 'PYUSD', 'wstETH'])
  })

  it('orders by row count, not alphabetically', () => {
    // The list is 246 long on one chain; opening it on whatever starts with "a"
    // buries the assets anyone actually holds.
    const v = assetFilterVocabulary({ assets, assetGroups })
    expect(v.options.map((o) => o.label)).toEqual(['USDC', 'ETH', 'cbBTC', 'PYUSD', 'wstETH'])
  })

  it('survives an empty facet payload', () => {
    expect(assetFilterVocabulary({}).options).toEqual([])
  })
})
