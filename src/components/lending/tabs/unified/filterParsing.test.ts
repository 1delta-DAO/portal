import { describe, expect, it } from 'vitest'
import { formatUsdShort, parseMinTvl, resolveAssetFilter } from './filterParsing'
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
