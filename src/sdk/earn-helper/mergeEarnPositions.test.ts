import { describe, expect, it } from 'vitest'
import { mergeEarnPositions, totalsFromPositions } from './mergeEarnPositions'
import type { FetchEarnPositionsResult } from './fetchEarnPositions'
import type { EarnPosition } from './positionTypes'

/**
 * Positions are fetched per chain so a chain toggle does not discard the rest
 * of the portfolio. What this merge must not do while that is in flight is
 * present a partial portfolio as a complete one — so the properties defended
 * here are: totals follow the ROWS, and a degraded source survives a healthy
 * one on another chain.
 */

const lending = (over: Partial<any> = {}): EarnPosition =>
  ({
    positionUid: 'AAVE_V3:1',
    chainId: '1',
    venue: 'AAVE_V3',
    venueKind: 'lending',
    lender: 'AAVE_V3',
    account: '0xuser',
    health: 1.8,
    leverage: 1.5,
    depositApr: 4,
    borrowApr: 3,
    crossMargin: true,
    legs: [],
    subAccounts: [],
    suppliedUsd: 1000,
    borrowedUsd: 400,
    netUsd: 600,
    ...over,
  }) as EarnPosition

const vault = (over: Partial<any> = {}): EarnPosition =>
  ({
    positionUid: 'vault.morpho:8453:0xbeef',
    earnUid: 'vault.morpho:8453:0xbeef',
    chainId: '8453',
    venue: 'vault.morpho',
    venueKind: 'vault',
    provider: 'morpho',
    vault: '0xbeef',
    asset: { address: '0xusdc' },
    sharesRaw: '1',
    shares: '1',
    assetsRaw: '2',
    assets: '2',
    shareDecimals: 6,
    suppliedUsd: 200,
    borrowedUsd: 0,
    netUsd: 200,
    ...over,
  }) as EarnPosition

const ok = (
  items: EarnPosition[],
  over: Partial<FetchEarnPositionsResult> = {}
): FetchEarnPositionsResult => ({
  success: true,
  items,
  sources: [
    { source: 'lending', status: 'ok', rows: items.length },
    { source: 'vaults', status: 'ok', rows: 0 },
  ],
  ...over,
})

describe('mergeEarnPositions', () => {
  it('concatenates chains and orders by net asset value', () => {
    const m = mergeEarnPositions([
      ok([vault()]),
      ok([
        lending(),
        lending({ positionUid: 'MORPHO:1', netUsd: 50, suppliedUsd: 50, borrowedUsd: 0 }),
      ]),
    ])
    expect(m.items.map((i) => i.netUsd)).toEqual([600, 200, 50])
  })

  it('ranks an underwater position last, matching the server', () => {
    const m = mergeEarnPositions([
      ok([
        lending({ positionUid: 'A:1', netUsd: -500, suppliedUsd: 10_000, borrowedUsd: 10_500 }),
        lending({ positionUid: 'B:1', netUsd: 10 }),
      ]),
    ])
    expect(m.items.map((i) => i.netUsd)).toEqual([10, -500])
  })

  it('derives totals from the rows PRESENT, not from per-chain sums', () => {
    // Chain 8453 has not answered. Its rows are absent, so its money must be
    // absent from the header too — the caller reports the gap via
    // `pendingChains` rather than the header quietly including it.
    const m = mergeEarnPositions([ok([lending()]), undefined])
    expect(m.totals).toEqual({
      suppliedUsd: 1000,
      borrowedUsd: 400,
      netUsd: 600,
      lendingUsd: 600,
      vaultUsd: 0,
    })
  })

  it('splits the two halves across chains', () => {
    const m = mergeEarnPositions([ok([lending()]), ok([vault()])])
    expect(m.totals).toMatchObject({
      netUsd: 800,
      lendingUsd: 600,
      vaultUsd: 200,
      borrowedUsd: 400,
    })
  })

  it('keeps the WORST source status across chains and accumulates reasons', () => {
    const m = mergeEarnPositions([
      ok([lending()]),
      ok([], {
        sources: [
          { source: 'lending', status: 'ok', rows: 0 },
          {
            source: 'vaults',
            status: 'degraded',
            rows: 0,
            error: 'chain 8453: 2 balance read(s) failed',
          },
        ],
      }),
    ])
    const vaults = m.sources.find((s) => s.source === 'vaults')!
    // One chain succeeding must NOT erase another's degradation, or a portfolio
    // missing a chain's vaults reads as a complete one.
    expect(vaults.status).toBe('degraded')
    expect(vaults.error).toMatch(/chain 8453/)
    expect(m.sources.find((s) => s.source === 'lending')!.status).toBe('ok')
  })

  it('carries partial and stale if ANY chain reports them', () => {
    const m = mergeEarnPositions([
      ok([lending()]),
      ok([vault()], { partial: true }),
      ok([], { stale: true }),
    ])
    expect(m.partial).toBe(true)
    expect(m.stale).toBe(true)
  })

  it('ignores failed and pending chains rather than throwing', () => {
    const m = mergeEarnPositions([
      undefined,
      { success: false, error: 'HTTP 502' },
      ok([lending()]),
    ])
    expect(m.items).toHaveLength(1)
    expect(m.totals.netUsd).toBe(600)
  })

  it('is empty, not NaN, with nothing resolved', () => {
    const m = mergeEarnPositions([undefined, undefined])
    expect(m.items).toEqual([])
    expect(m.totals.netUsd).toBe(0)
    expect(m.partial).toBe(false)
  })
})

describe('totalsFromPositions', () => {
  it('nets supplied against borrowed', () => {
    expect(totalsFromPositions([lending(), vault()])).toEqual({
      suppliedUsd: 1200,
      borrowedUsd: 400,
      netUsd: 800,
      lendingUsd: 600,
      vaultUsd: 200,
    })
  })
})
