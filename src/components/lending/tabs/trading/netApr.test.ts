import { describe, expect, it } from 'vitest'
import { computeNetApr, type NetAprLeg } from './QuoteCard'

/**
 * The quote card reported an 8.8x leveraged loop at its UNLEVERAGED rate.
 *
 * Live figures from the Euler V2 RLUSD/USDC loop that surfaced it: $0.92 of
 * USDC margin, $8.07 of RLUSD collateral at 13.87 % and $7.15 of USDC debt at
 * 3.19 %, i.e. +$0.89/yr on $0.92 of equity ≈ +97 % APR. The card showed
 * +11.05 % — $0.89/yr divided by the $8.07 POSITION — because the basis test
 * carried an absolute $1 equity floor, and a real margin of $0.92 fell under
 * it. The pair-book row for the same market read ~82 % (its own max-leverage
 * figure), so the two disagreed by the whole leverage multiple.
 */
const eulerLoop: NetAprLeg[] = [
  { side: 'deposit', usd: 8.07, annual: (8.07 * 13.87) / 100, annualNoRwd: (8.07 * 13.87) / 100 },
  { side: 'borrow', usd: 7.15, annual: (-7.15 * 3.19) / 100, annualNoRwd: (-7.15 * 3.19) / 100 },
]

describe('computeNetApr', () => {
  it('prices a small-margin loop on the margin, not the position', () => {
    const net = computeNetApr(eulerLoop)!
    expect(net.annualUsd).toBeCloseTo(0.891, 2)
    expect(net.equity).toBeCloseTo(0.92, 2)
    expect(net.hasEquity).toBe(true)
    expect(net.aprPct!).toBeCloseTo(96.9, 0)
  })

  it('scales with the position, not with its dollar size', () => {
    const big = eulerLoop.map((l) => ({
      ...l,
      usd: l.usd * 1000,
      annual: l.annual * 1000,
      annualNoRwd: l.annualNoRwd * 1000,
    }))
    expect(computeNetApr(big)!.aprPct!).toBeCloseTo(computeNetApr(eulerLoop)!.aprPct!, 4)
  })

  it('falls back to the position basis when no net equity is added', () => {
    // Pure leverage on an existing position: the collateral gained is paid for
    // entirely by the debt taken, so equity is noise around zero.
    const pure: NetAprLeg[] = [
      { side: 'deposit', usd: 100, annual: 10, annualNoRwd: 10 },
      { side: 'borrow', usd: 99.98, annual: -3, annualNoRwd: -3 },
    ]
    const net = computeNetApr(pure)!
    expect(net.hasEquity).toBe(false)
    expect(net.basis).toBe(100)
    expect(net.aprPct!).toBeCloseTo(7, 6)
  })

  it('never divides by a negative equity (slippage-funded leverage)', () => {
    const lossy: NetAprLeg[] = [
      { side: 'deposit', usd: 100, annual: 10, annualNoRwd: 10 },
      { side: 'borrow', usd: 101, annual: -3, annualNoRwd: -3 },
    ]
    const net = computeNetApr(lossy)!
    expect(net.hasEquity).toBe(false)
    expect(net.aprPct!).toBeGreaterThan(0)
  })

  it('has no rate at all for a dust trade', () => {
    const dust: NetAprLeg[] = [{ side: 'deposit', usd: 0.001, annual: 0.0001, annualNoRwd: 0.0001 }]
    expect(computeNetApr(dust)!.aprPct).toBeNull()
  })
})
