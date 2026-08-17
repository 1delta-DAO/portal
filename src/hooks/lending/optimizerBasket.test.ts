import { describe, it, expect } from 'vitest'
import { normalisePairRow } from './useOptimizerPairs'

/**
 * `isBasketLong` on a pair row is not decoration — it qualifies the APR.
 *
 * On a Fluid smart-collateral pair, `depositAprLong` is the POSITION's rate,
 * value-weighted across both legs of the DEX LP (yield-tracer migration 0122).
 * The row still renders under ONE token's name, so without the flag the UI
 * states a rate that will not match a per-leg figure quoted anywhere else and
 * gives the user no way to tell why.
 */
const raw = (extra: Record<string, unknown> = {}) =>
  ({
    chainId: '1',
    lender: 'FLUID_1_77',
    depositAprLong: '10.33',
    borrowAprShort: '4.00',
    maxLeverage: '5',
    ...extra,
  }) as any

describe('optimizer pair row — auto-balanced collateral', () => {
  it('carries the flag and the leg rate it was blended from', () => {
    const row = normalisePairRow(raw({ isBasketLong: true, depositRateLongLeg: '11.81' }))
    expect(row.autoBalancedLong).toBe(true)
    // Both land as FRACTIONS, like every other APR on this row.
    expect(row.depositAprLong).toBeCloseTo(0.1033, 6)
    expect(row.depositAprLongLeg).toBeCloseTo(0.1181, 6)
    // The whole point: the position earns LESS than its best leg, which is the
    // 11.81 % vs 10.33 % misread that made "Best APR" wrong on vault #77.
    expect(row.depositAprLong).toBeLessThan(row.depositAprLongLeg!)
  })

  it('defaults to false when the field is absent', () => {
    // An older yield-tracer deployment does not project it. A missing field
    // must read as "ordinary market", never as truthy.
    const row = normalisePairRow(raw())
    expect(row.autoBalancedLong).toBe(false)
    expect(row.depositAprLongLeg).toBeUndefined()
  })

  it('is false, not true, for an explicit null', () => {
    const row = normalisePairRow(raw({ isBasketLong: null }))
    expect(row.autoBalancedLong).toBe(false)
  })
})
