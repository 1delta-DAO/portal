import { describe, expect, it } from 'vitest'
import {
  isCollateralLegUid,
  marketUidParts,
  refCollateralIndex,
  refToken,
  shortMarketLabel,
} from './marketUid'

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const LENDER = 'MORPHO_MIDNIGHT_2A9AE59053A64E409E819D3B76750948E06065B3164278915EB80CB1B7474B65'

/**
 * Morpho Midnight keys a collateral leg as `<token>-c<index>`, because the
 * protocol stores collateral per leg index and one token can sit on both sides
 * of a market. Every place that renders a label off the ref must read through
 * these helpers, or it prints `…b48-c0` as if it were the tail of an address.
 */
describe('marketUid helpers', () => {
  it('splits a plain uid', () => {
    expect(marketUidParts(`AAVE_V3:1:${USDC}`)).toEqual({
      lenderKey: 'AAVE_V3',
      chainId: '1',
      ref: USDC,
    })
  })

  it('reads the token and leg index off a collateral-leg ref', () => {
    const ref = `${USDC}-c0`
    expect(refToken(ref)).toBe(USDC)
    expect(refCollateralIndex(ref)).toBe(0)
    expect(refCollateralIndex(`${USDC}-c12`)).toBe(12)
    expect(isCollateralLegUid(`${LENDER}:1:${ref}`)).toBe(true)
  })

  it('leaves a loan-side (bare token) ref alone', () => {
    expect(refToken(USDC)).toBe(USDC)
    expect(refCollateralIndex(USDC)).toBeUndefined()
    expect(isCollateralLegUid(`${LENDER}:1:${USDC}`)).toBe(false)
  })

  it('does not mistake a non-address ref for a leg (only a trailing -c<digits> counts)', () => {
    expect(refToken('cUSDC')).toBe('cUSDC')
    expect(refCollateralIndex('pool-c')).toBeUndefined()
    expect(refCollateralIndex('abc-cx1')).toBeUndefined()
  })

  it('labels a leg-keyed uid by token and leg, never by the raw ref tail', () => {
    expect(shortMarketLabel(`${LENDER}:1:${USDC}-c0`)).toBe(`${LENDER} · 0xa0b8…eb48 · leg 0`)
    expect(shortMarketLabel(`AAVE_V3:1:${USDC}`)).toBe('AAVE_V3 · 0xa0b8…eb48')
    expect(shortMarketLabel('AAVE_V3')).toBe('AAVE_V3')
  })
})
