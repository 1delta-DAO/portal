import { describe, it, expect } from 'vitest'
import { portfolioNetApr } from './portfolioApr'
import type { EarnPosition } from './positionTypes'

const vault = (netUsd: number, apr?: number): EarnPosition =>
  ({ venueKind: 'vault', netUsd, suppliedUsd: netUsd, borrowedUsd: 0, apr }) as EarnPosition

const lending = (suppliedUsd: number, borrowedUsd: number, apr?: number): EarnPosition =>
  ({
    venueKind: 'lending',
    suppliedUsd,
    borrowedUsd,
    netUsd: suppliedUsd - borrowedUsd,
    apr,
  }) as EarnPosition

describe('portfolioNetApr', () => {
  it('blends both halves, weighted by equity', () => {
    // 200 at 3.5 % + 300 at 10 % → (700 + 3000) / 500 = 7.4 %
    const r = portfolioNetApr([vault(200, 3.5), lending(1500, 1200, 10)])
    expect(r.apr).toBeCloseTo(7.4, 9)
    expect(r.coveredUsd).toBe(500)
    expect(r.excludedCount).toBe(0)
  })

  it('EXCLUDES a position with no apr instead of scoring it 0 %', () => {
    // The field's contract is "absent ⇒ not computable, which is not zero".
    // Counting it as zero would halve the headline here and look like a real
    // yield decision rather than missing data.
    const r = portfolioNetApr([vault(100, 4), vault(100, undefined)])
    expect(r.apr).toBe(4)
    expect(r.coveredUsd).toBe(100)
    expect(r.totalUsd).toBe(200)
    expect(r.excludedCount).toBe(1)
  })

  it('reports coverage so a partial figure can say so', () => {
    const r = portfolioNetApr([vault(900, 5), vault(100)])
    expect(r.coveredUsd).toBe(900)
    expect(r.totalUsd).toBe(1000)
  })

  it('drops a position with no equity rather than dividing by it', () => {
    // Borrowings matching supply leaves nothing to earn a return ON; including
    // it explodes the ratio or flips its sign.
    const r = portfolioNetApr([vault(100, 4), lending(500, 500, 99), lending(100, 300, 50)])
    expect(r.apr).toBe(4)
    expect(r.coveredUsd).toBe(100)
  })

  it('is undefined, never 0, when nothing is computable', () => {
    expect(portfolioNetApr([]).apr).toBeUndefined()
    expect(portfolioNetApr([vault(100)]).apr).toBeUndefined()
  })

  it('lets leverage raise it — that is what equity weighting means', () => {
    // $1.5K supplied / $1.2K borrowed = $300 equity. The position's own `apr`
    // is already net of borrow cost, so a big number here is the loop, not a
    // bug — and it is why coverage is reported beside it.
    const r = portfolioNetApr([lending(1500, 1200, 25)])
    expect(r.apr).toBe(25)
    expect(r.coveredUsd).toBe(300)
  })
})
