import { describe, it, expect } from 'vitest'
import {
  defaultLegMode,
  deriveTotalShares,
  exitRequestFor,
  legRequest,
  sideHasRatio,
  suggestedCounterAmount,
  toRawUnits,
} from './smartLegForm'
import type { FluidSideInfo } from '../../../sdk/lending-helper/fluidSmart'

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const ETH = '0x0000000000000000000000000000000000000000'

/** 1e18 shares ⇒ 1.2 USDC (6dp) + 0.3 ETH (18dp). */
const side: FluidSideInfo = {
  assets: [
    { underlying: USDC, decimals: 6 },
    { underlying: ETH, decimals: 18 },
  ],
  dex: '0xdex',
  perShare: ['1200000', '300000000000000000'],
}

/** An empty pool — 18 live sides report exactly this. */
const emptySide: FluidSideInfo = { ...side, perShare: ['0', '0'] }

describe('defaultLegMode', () => {
  it('opens BALANCED when the wallet can cover the second leg', () => {
    expect(defaultLegMode({ hasRatio: true, secondaryBalance: '5', requiresBalance: true })).toBe(
      'balanced'
    )
  })

  it('opens SINGLE when the second leg cannot be paid for', () => {
    // A form that pre-fills an amount the wallet cannot cover is worse than one
    // that defaults to the more expensive route.
    expect(defaultLegMode({ hasRatio: true, secondaryBalance: '0', requiresBalance: true })).toBe(
      'single'
    )
    expect(defaultLegMode({ hasRatio: true, requiresBalance: true })).toBe('single')
  })

  it('IGNORES the balance on a side that RECEIVES', () => {
    // A borrow or a withdraw hands you both tokens — a wallet balance is
    // irrelevant, and defaulting to single-sided over one would make the user
    // pay the pool's imbalance fee for no reason at all.
    expect(defaultLegMode({ hasRatio: true, requiresBalance: false })).toBe('balanced')
    expect(defaultLegMode({ hasRatio: true, secondaryBalance: '0', requiresBalance: false })).toBe(
      'balanced'
    )
  })

  it('opens SINGLE when there is no ratio, whatever else is true', () => {
    for (const requiresBalance of [true, false]) {
      expect(defaultLegMode({ hasRatio: false, secondaryBalance: '999', requiresBalance })).toBe(
        'single'
      )
    }
  })
})

describe('sideHasRatio', () => {
  it('is false for an empty pool and true for a live one', () => {
    expect(sideHasRatio(side, 0)).toBe(true)
    expect(sideHasRatio(emptySide, 0)).toBe(false)
  })
})

describe('suggestedCounterAmount', () => {
  it('crosses decimals correctly', () => {
    // 1200 USDC pairs with 300 ETH at this ratio.
    expect(suggestedCounterAmount(side, 0, '1200')).toBe('300')
    expect(suggestedCounterAmount(side, 1, '300')).toBe('1200')
  })

  it('gives nothing to pre-fill rather than a misleading zero', () => {
    expect(suggestedCounterAmount(side, 0, '')).toBeNull()
    expect(suggestedCounterAmount(side, 0, '0')).toBeNull()
    expect(suggestedCounterAmount(side, 0, 'abc')).toBeNull()
    expect(suggestedCounterAmount(emptySide, 0, '10')).toBeNull()
  })
})

describe('legRequest', () => {
  it('sends both fields or neither — never an amount without its asset', () => {
    expect(legRequest('balanced', ETH, '1.5', 18)).toEqual({
      asset1: ETH,
      amount1: '1500000000000000000',
    })
    expect(legRequest('single', ETH, '1.5', 18)).toEqual({})
    expect(legRequest('balanced', ETH, '', 18)).toEqual({})
    expect(legRequest('balanced', ETH, 'nonsense', 18)).toEqual({})
  })
})

describe('deriveTotalShares', () => {
  it('derives the share count from a leg balance', () => {
    // 1.2 USDC of a side whose perShare is 1.2 USDC ⇒ exactly 1e18 shares.
    expect(deriveTotalShares(side, 0, '1.2', 6)).toBe(10n ** 18n)
  })

  it('parses without a float — 18 decimals survive intact', () => {
    // Going through parseFloat would lose the tail of this number.
    expect(toRawUnits('1.234567890123456789', 18)).toBe(1234567890123456789n)
    // Over-long fractions are truncated to the token's precision, not rounded
    // up into a bigger burn than the user asked for.
    expect(toRawUnits('1.9999999', 6)).toBe(1999999n)
  })

  it('returns null rather than a guess when it cannot be read', () => {
    expect(deriveTotalShares(side, 0, '0', 6)).toBeNull()
    expect(deriveTotalShares(side, 0, '', 6)).toBeNull()
    expect(deriveTotalShares(emptySide, 0, '1.2', 6)).toBeNull()
  })
})

describe('exitRequestFor', () => {
  const total = 1_000_000_000_000_000_000n

  it('makes 100% a FULL-EXIT request, not a sized one', () => {
    // A full exit is share-precise via `isAll`; the token-sized form cannot
    // express it, so this must never degrade into "burn all the shares I think
    // you have".
    expect(exitRequestFor(100, total)).toEqual({ isAll: true })
    // …even when the share count could not be derived at all.
    expect(exitRequestFor(100, null)).toEqual({ isAll: true })
  })

  it('sizes a partial exit in shares', () => {
    expect(exitRequestFor(50, total)).toEqual({ isAll: false, shares: '500000000000000000' })
    expect(exitRequestFor(25, total)).toEqual({ isAll: false, shares: '250000000000000000' })
  })

  it('sends NO size when the share count is unknown', () => {
    // Better a request the server rejects than a burn amount invented here.
    expect(exitRequestFor(50, null)).toEqual({ isAll: false })
  })

  it('handles a fractional percentage without float drift', () => {
    expect(exitRequestFor(33.33, total)).toEqual({ isAll: false, shares: '333300000000000000' })
  })
})
