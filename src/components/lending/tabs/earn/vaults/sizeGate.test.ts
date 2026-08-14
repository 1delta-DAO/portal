import { describe, expect, it } from 'vitest'
import { passesSizeGate, tvlUsd, tvlUsdKnown } from './helpers'
import type { VaultEntry } from '../../../../../sdk/vaults-helper'

/**
 * The vault catalogue's size gate.
 *
 * It has hidden things three different ways, and every failure looked the same
 * from the outside — a table that renders fine and simply omits the row, with
 * no error and no count to notice it by:
 *
 *   - a real position in svZCHF (~3.5 ZCHF, ~$4) against the persisted 10,000
 *     default, so the vault could not be found from the tab it was deposited
 *     through, and restarting did not clear it;
 *   - unpriced vaults treated as worth zero, the client-side twin of the
 *     recorder's `total_assets_usd >= 0`, which dropped 27 of 78 chain-1
 *     savings vaults;
 *   - `minTvlUsd=0` meaning "no floor" only if nothing downstream re-reads it
 *     as a comparison.
 *
 * Tested on the pure predicate rather than through the component, so each rule
 * fails on its own terms.
 */

const vault = (over: Partial<VaultEntry> = {}): VaultEntry =>
  ({
    address: '0xe5f130253ff137f9917c0107659a4c5262abf6b0',
    underlying: '0xb58e61c3098d85632df34eecfb899a1ed80921cb',
    symbol: 'svZCHF',
    name: 'Savings ZCHF',
    provider: 'savings',
    decimals: 18,
    totalAssets: '3457566826516146600',
    totalSupply: '3400000000000000000',
    ...over,
  }) as unknown as VaultEntry

const gate = (over: Partial<Parameters<typeof passesSizeGate>[1]> = {}) => ({
  minTvlUsd: 10_000,
  requiresTvl: true,
  isExempt: () => false,
  decimalsFor: () => 18,
  ...over,
})

describe('tvlUsdKnown — unknown is distinguishable from zero', () => {
  it('is undefined when there is no USD and no underlying price', () => {
    const v = vault({ totalAssetsUsd: undefined, underlyingPriceUsd: undefined })
    expect(tvlUsdKnown(v, 18)).toBeUndefined()
    // `tvlUsd` still answers 0 so sorting and rendering have a number. That is
    // the whole reason the two exist separately: display wants a number,
    // filtering must not invent one.
    expect(tvlUsd(v, 18)).toBe(0)
  })

  it('derives from the underlying price when the backend has no USD', () => {
    const v = vault({ totalAssetsUsd: undefined, underlyingPriceUsd: 1.24 })
    expect(tvlUsdKnown(v, 18)).toBeCloseTo(3.4575668 * 1.24, 4)
  })
})

describe('passesSizeGate', () => {
  it('culls a dust vault under the floor', () => {
    // The behaviour the default is FOR — an unheld, unsearched $4 vault does
    // not belong in an unranked listing.
    expect(passesSizeGate(vault({ totalAssetsUsd: 4.3 }), gate())).toBe(false)
  })

  it('keeps a vault the user holds, however small', () => {
    // The svZCHF case. Without this, a deposit removes the row from the
    // catalogue it was made from.
    expect(
      passesSizeGate(vault({ totalAssetsUsd: 4.3 }), gate({ isExempt: () => true }))
    ).toBe(true)
  })

  it('keeps a vault the user explicitly searched for', () => {
    // Same exemption, different trigger: answering "no results" for a vault
    // that exists and was named is worse than showing a small one.
    expect(
      passesSizeGate(vault({ totalAssetsUsd: 4.3 }), gate({ isExempt: () => true }))
    ).toBe(true)
  })

  it('keeps an UNPRICED vault rather than reading it as zero', () => {
    // The NULL-is-not-zero rule. A floor cannot be applied to a size we do not
    // know, so the row survives and sorts last.
    const v = vault({
      totalAssetsUsd: undefined,
      underlyingPriceUsd: undefined,
      totalAssets: '364000000000000000000000000',
      totalSupply: '364000000000000000000000000',
    })
    expect(passesSizeGate(v, gate())).toBe(true)
  })

  it('still culls a genuinely EMPTY deployment', () => {
    // Unpriced and empty are different claims — `requiresTvl` targets the
    // second, and relaxing the first must not disable it.
    const v = vault({
      totalAssets: '0',
      totalSupply: '0',
      totalAssetsFormatted: 0,
      totalAssetsUsd: undefined,
      underlyingPriceUsd: undefined,
    })
    expect(passesSizeGate(v, gate())).toBe(false)
    // ...but an empty vault the user somehow holds is still shown, because a
    // position that renders nowhere is the worse failure.
    expect(passesSizeGate(v, gate({ isExempt: () => true }))).toBe(true)
  })

  it('treats a zero floor as no floor', () => {
    // `0` must not become a `>= 0` comparison anywhere. It is the same string
    // that, left truthy, built the server-side filter that culled $364M.
    expect(
      passesSizeGate(vault({ totalAssetsUsd: 4.3 }), gate({ minTvlUsd: 0 }))
    ).toBe(true)
    expect(
      passesSizeGate(vault({ totalAssetsUsd: 4.3 }), gate({ minTvlUsd: NaN }))
    ).toBe(true)
  })

  it('admits a vault comfortably over the floor', () => {
    expect(passesSizeGate(vault({ totalAssetsUsd: 1_000_000 }), gate())).toBe(true)
  })
})
