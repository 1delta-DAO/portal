import { describe, expect, it } from 'vitest'
import { buildDetailRows } from './ConfigMarketView'
import type { ConfigMarketItem, PoolDataItem } from '../../../hooks/lending/usePoolData'

/**
 * Which rows a config group produces.
 *
 * The table used to assume "depositable" and "collateral" are the same thing.
 * That holds on a pooled lender, where the borrowable is also the supplied
 * asset and so appears in BOTH arrays. It fails on a one-sided market: a
 * LlamaLend market lends crvUSD against sreUSD collateral, so crvUSD is only in
 * `borrowables` — and its supply APR and deposit-side CRV rewards had nowhere
 * to render. Curve shows both as "Net Supply APY" beside "Net Borrow APR".
 *
 * The failure is silent: a missing row looks identical to a market with no
 * rewards, which is why this is pinned here rather than left to the eye.
 */

const item = (marketUid: string, over: Partial<ConfigMarketItem> = {}): ConfigMarketItem =>
  ({
    marketUid,
    depositRate: 0,
    variableBorrowRate: 0,
    borrowCollateralFactor: 0,
    intrinsicYield: null,
    totalDepositsUsd: 0,
    totalDebtUsd: 0,
    underlyingInfo: { asset: { symbol: 'X', name: 'X' } },
    ...over,
  }) as unknown as ConfigMarketItem

const pool = (depositRewardApr: number): PoolDataItem =>
  ({ depositRewardApr }) as unknown as PoolDataItem

const CRVUSD = 'LLAMALEND_X:1:0xcrvusd'
const SREUSD = 'LLAMALEND_X:1:0xsreusd'
const USDC = 'AAVE_V3:1:0xusdc'

const sides = (rows: ReturnType<typeof buildDetailRows>) => rows.map((r) => r.side)

describe('buildDetailRows', () => {
  it('adds a SUPPLY row for a lend-only asset that pays a deposit rate', () => {
    // The LlamaLend shape: crvUSD is borrowable and lent, never collateral.
    const rows = buildDetailRows(
      {
        collaterals: [item(SREUSD)],
        borrowables: [item(CRVUSD, { depositRate: 1.61 })],
      },
      new Map()
    )
    expect(sides(rows)).toEqual(['collateral', 'borrowable', 'supply'])
    const supply = rows.find((r) => r.side === 'supply')!
    expect(supply.item.marketUid).toBe(CRVUSD)
  })

  it('adds it when the only deposit economics are a REWARD', () => {
    // The exact bug: base supply can be ~0 while a CRV gauge pays 2.4 %, and
    // gating on `depositRate` alone would still hide it.
    const rows = buildDetailRows(
      { collaterals: [item(SREUSD)], borrowables: [item(CRVUSD)] },
      new Map([[CRVUSD, pool(2.38)]])
    )
    expect(sides(rows)).toContain('supply')
  })

  it('leaves a POOLED lender untouched — no duplicate row', () => {
    // On Aave the same asset is in both arrays, so its collateral row already
    // carries the deposit APR. A supply row here would duplicate every asset.
    const usdc = item(USDC, { depositRate: 3.2 })
    const rows = buildDetailRows(
      { collaterals: [usdc], borrowables: [usdc] },
      new Map([[USDC, pool(1.1)]])
    )
    expect(sides(rows)).toEqual(['collateral', 'borrowable'])
  })

  it('adds nothing for a borrow-only market with no supply side', () => {
    // Inverse mints DOLA — there are no lenders, so an empty "Lend" row would
    // advertise a product that does not exist.
    const rows = buildDetailRows(
      { collaterals: [item(SREUSD)], borrowables: [item('INVERSE:1:0xdola')] },
      new Map()
    )
    expect(sides(rows)).toEqual(['collateral', 'borrowable'])
  })

  it('keeps the supply row pointing at the same market as its borrow row', () => {
    // They are one (market, asset) seen from two sides; a different uid would
    // break the pool join and the click-through.
    const rows = buildDetailRows(
      { collaterals: [], borrowables: [item(CRVUSD, { depositRate: 1 })] },
      new Map()
    )
    const uids = new Set(rows.map((r) => r.item.marketUid))
    expect(uids).toEqual(new Set([CRVUSD]))
    expect(sides(rows)).toEqual(['borrowable', 'supply'])
  })

  it('tolerates missing arrays', () => {
    expect(buildDetailRows({ collaterals: null, borrowables: null }, new Map())).toEqual([])
  })

  it('does not treat a negative deposit rate as a supply side', () => {
    const rows = buildDetailRows(
      { collaterals: [], borrowables: [item(CRVUSD, { depositRate: -1 })] },
      new Map()
    )
    expect(sides(rows)).toEqual(['borrowable'])
  })
})
