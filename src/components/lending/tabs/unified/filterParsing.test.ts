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

describe('resolveAssetFilter', () => {
  const list = opts('USDC', 'USDT', 'WETH', 'ZCHF', 'svZCHF')

  it('clears on empty input', () => {
    expect(resolveAssetFilter('', list)).toEqual({ kind: 'none' })
  })

  it('takes an address verbatim, lowercased', () => {
    // The unambiguous case, and the one the symbol dropdown cannot express:
    // three unrelated tokens ship as USD3 and three more as USDP.
    expect(resolveAssetFilter('0xE5F130253ff137F9917C0107659A4C5262ABf6b0', list)).toEqual({
      kind: 'address',
      asset: '0xe5f130253ff137f9917c0107659a4c5262abf6b0',
    })
  })

  it('does not mistake a short hex string for an address', () => {
    // Not 40 hex digits, so it is text — and text is a search, not an address.
    expect(resolveAssetFilter('0xdead', list)).toEqual({
      kind: 'search',
      search: '0xdead',
    })
  })

  it('resolves a symbol case-insensitively to its canonical facet key', () => {
    // Sending `usdc` verbatim would match nothing — the server compares
    // symbols exactly.
    expect(resolveAssetFilter('usdc', list)).toEqual({ kind: 'symbol', assetSymbol: 'USDC' })
  })

  it('prefers an EXACT hit over a substring one', () => {
    // `ZCHF` is a substring of `svZCHF`, so a substring-first rule would
    // resolve the exact token to the wrong one of the two.
    expect(resolveAssetFilter('ZCHF', list)).toEqual({ kind: 'symbol', assetSymbol: 'ZCHF' })
  })

  it('accepts a unique substring', () => {
    expect(resolveAssetFilter('svz', list)).toEqual({ kind: 'symbol', assetSymbol: 'svZCHF' })
    expect(resolveAssetFilter('wet', list)).toEqual({ kind: 'symbol', assetSymbol: 'WETH' })
  })

  it('searches rather than guessing when several assets match', () => {
    // `usd` hits USDC and USDT. Picking one would filter to an asset the user
    // did not name; refusing to send anything (the old behaviour) reported
    // "no match" for a query that matches most of the listing. Searching is
    // the only reading that is neither wrong nor a dead end.
    expect(resolveAssetFilter('usd', list)).toEqual({ kind: 'search', search: 'usd' })
  })

  it('searches when the query names something other than an asset', () => {
    // The whole point: a curator, a protocol or a vault's own name is not in
    // the asset facet list, and used to resolve to `unmatched` — so a listing
    // of vaults could not be searched by vault name at all.
    expect(resolveAssetFilter('Gauntlet', list)).toEqual({
      kind: 'search',
      search: 'Gauntlet',
    })
    expect(resolveAssetFilter('Savings Module', list)).toEqual({
      kind: 'search',
      search: 'Savings Module',
    })
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
