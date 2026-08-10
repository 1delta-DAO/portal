import { describe, expect, it } from 'vitest'
import { lenderToSlug, slugToLender } from './routes'

/**
 * The slug round-trip must be LOSSLESS. It silently was not: Sky/USDD market
 * keys embedded a Maker ilk that carries its own hyphen (`SKY_1_WBTC-A`), and
 * mapping both `_` and `-` onto `-` made `slugToLender` return `SKY_1_WBTC_A`
 * — a key no lender had, so the lending page fell back to whichever lender
 * sorted first and quietly showed the wrong protocol's markets.
 *
 * The real fix was upstream: lender keys now use `_` as their ONLY separator
 * (the ilk's `-` is re-spelled at construction), so the naive mapping is
 * correct again and `sky-1-wbtc-a` resolves properly. These tests pin the
 * invariant from this side.
 */
describe('lender slug round-trip', () => {
  const KEYS = [
    // plain brands
    'AAVE_V3',
    'MORPHO_BLUE',
    'COMPOUND_V3_USDC',
    'TERM_FINANCE',
    // per-market keys, numeric suffixes
    'RIVER_56_1',
    'EBISU_1_0',
    'LIQUITY_V2_1_0',
    // hex suffixes
    'FRANKENCOIN_1_194E0D684F1CC6D93843FEAD521F3D54A5879F4E',
    'INVERSE_63DF5E23DB45A2066508318F172BA45B9CD37035',
    // Maker ilks, in their canonical hyphen-free spelling
    'SKY_1_WBTC_A',
    'SKY_1_ETH_C',
    'SKY_1_WSTETH_B',
    'USDD_1_WBTC_A',
    'USDD_56_PSM_USDT_A',
  ]

  it.each(KEYS)('round-trips %s', (key) => {
    expect(slugToLender(lenderToSlug(key))).toBe(key)
  })

  it('every canonical key is hyphen-free, so the slug needs no escaping', () => {
    for (const key of KEYS) {
      expect(key).not.toContain('-')
      expect(lenderToSlug(key)).not.toContain('.')
    }
  })

  it('resolves the URL that regressed', () => {
    // The exact link from the bug report, now landing on the right lender.
    expect(slugToLender('sky-1-wbtc-a')).toBe('SKY_1_WBTC_A')
    expect(lenderToSlug('SKY_1_WBTC_A')).toBe('sky-1-wbtc-a')
  })

  it('leaves every hyphen-free key byte-identical (no URL breakage)', () => {
    expect(lenderToSlug('AAVE_V3')).toBe('aave-v3')
    expect(lenderToSlug('COMPOUND_V3_USDC')).toBe('compound-v3-usdc')
    expect(slugToLender('aave-v3')).toBe('AAVE_V3')
  })

  it('still round-trips a key that violates the invariant (safety net)', () => {
    // Defence in depth: if a hyphenated key ever reappears, it must resolve to
    // itself rather than silently collapse onto a different lender.
    expect(slugToLender(lenderToSlug('SKY_1_WBTC-A'))).toBe('SKY_1_WBTC-A')
  })
})
