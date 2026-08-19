import { describe, it, expect } from 'vitest'
import { filterAndSortPools, type PoolFilterCriteria } from './poolFilters'
import { computePoolMetrics, type PoolWithMetrics } from './helpers'
import type { PoolEntry } from '../../../../sdk/lending-helper/poolTypes'

/**
 * These tests exist because the filter exemptions are invisible when they
 * break: a market that should be listed simply isn't there, and nothing in the
 * rendered output says why. Each case below is a rule that hid real markets.
 */

function pool(overrides: Partial<PoolEntry> = {}): PoolEntry {
  return {
    chainId: '1',
    marketUid: 'AAVE_V3:1:0xusdc',
    name: 'USDC',
    lenderKey: 'AAVE_V3',
    underlyingAddress: '0xusdc',
    depositRate: '5',
    variableBorrowRate: '7',
    stableBorrowRate: '0',
    intrinsicYield: null,
    totalDeposits: '1000',
    totalDebt: '500',
    totalLiquidity: '500',
    totalDepositsUsd: '1000',
    totalDebtUsd: '500',
    totalLiquidityUsd: '500',
    borrowLiquidity: '500',
    withdrawLiquidity: '500',
    depositable: '500',
    utilization: '0.5',
    configIds: [],
    exposures: [],
    rewards: null,
    underlyingInfo: {
      asset: {
        chainId: '1',
        address: '0xusdc',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logoURI: '',
        assetGroup: 'USD',
        currencyId: 'usdc',
      },
      prices: {
        priceUsd: 1,
        priceTs: '',
        priceUsd24h: 1,
        priceTs24h: '',
        priceChange24h: 0,
      },
      oraclePrice: { oraclePrice: 1, oraclePriceUsd: 1 },
    },
    risk: null,
    oracleInfo: null,
    ...overrides,
  } as PoolEntry
}

function rows(...entries: PoolEntry[]): PoolWithMetrics[] {
  return entries.map((p) => ({ pool: p, metrics: computePoolMetrics(p) }))
}

const BASE: PoolFilterCriteria = {
  selectedLender: 'all',
  search: '',
  assetFilter: '',
  effectiveMaxRisk: 5,
  minUtilPct: '',
  maxUtilPct: '',
  minAprPct: '',
  maxAprPct: '',
  minDepositsUsd: '',
  maxDepositsUsd: '',
  minDepositsNative: '',
  maxDepositsNative: '',
  minDebtNative: '',
  maxDebtNative: '',
  minLiquidityNative: '',
  maxLiquidityNative: '',
  minDebtUsd: '',
  maxDebtUsd: '',
  minLiquidityUsd: '',
  maxLiquidityUsd: '',
  sortKey: 'apr',
  sortDir: 'desc',
}

const uids = (result: PoolWithMetrics[]) => result.map((r) => r.pool.marketUid)

describe('filterAndSortPools — floor exemptions', () => {
  it('exempts deposit-only markets from the utilization floor', () => {
    // A Fluid "Collateral X" pool: borrowing disabled, so 0% utilization is
    // inherent rather than a sign the market is dead.
    const depositOnly = pool({
      marketUid: 'FLUID:1:0xweth',
      totalDebt: '0',
      flags: { borrowingEnabled: false, depositsEnabled: true },
    })
    const normal = pool({ marketUid: 'AAVE_V3:1:0xusdc' })

    const result = filterAndSortPools(rows(depositOnly, normal), {
      ...BASE,
      minUtilPct: '10',
    })

    expect(uids(result)).toContain('FLUID:1:0xweth')
    expect(uids(result)).toContain('AAVE_V3:1:0xusdc')
  })

  it('exempts fixed-term markets from the APR floor', () => {
    // Yield lives in an order book, not a pool rate, so depositRate is ~0.
    const midnight = pool({
      marketUid: 'MORPHO_MIDNIGHT:1:0xusdc',
      lenderKey: 'MORPHO_MIDNIGHT_USDC',
      depositRate: '0',
    })
    const lowAprVariable = pool({ marketUid: 'AAVE_V3:1:0xdai', depositRate: '0' })

    const result = filterAndSortPools(rows(midnight, lowAprVariable), {
      ...BASE,
      minAprPct: '1',
    })

    expect(uids(result)).toEqual(['MORPHO_MIDNIGHT:1:0xusdc'])
  })

  it('skips every numeric floor for an explicit asset pick', () => {
    // Row click: the user asked for this asset by name, so a default TVL floor
    // must not hide the markets that hold it.
    const tiny = pool({ marketUid: 'AAVE_V3:1:0xusdc', totalDepositsUsd: '5' })

    const result = filterAndSortPools(rows(tiny), {
      ...BASE,
      externalAssetFilter: '0xusdc',
      externalAssetFilterSource: 'explicit',
      minDepositsUsd: '100000',
    })

    expect(uids(result)).toEqual(['AAVE_V3:1:0xusdc'])
  })

  it('keeps the numeric floors under the "owned assets" toggle', () => {
    // The toggle narrows broadly rather than naming a market, so the toolbar's
    // other filters must keep working while it is on.
    const tiny = pool({ marketUid: 'AAVE_V3:1:0xusdc', totalDepositsUsd: '5' })
    const big = pool({ marketUid: 'MORPHO:1:0xusdc', totalDepositsUsd: '500000' })

    const result = filterAndSortPools(rows(tiny, big), {
      ...BASE,
      externalAssetFilter: '0xusdc',
      externalAssetFilterSource: 'owned',
      minDepositsUsd: '100000',
    })

    expect(uids(result)).toEqual(['MORPHO:1:0xusdc'])
  })

  it('still enforces the risk ceiling under an external asset filter', () => {
    const risky = pool({
      marketUid: 'AAVE_V3:1:0xusdc',
      risk: { score: 5, label: 'high', breakdown: [] },
    })

    const result = filterAndSortPools(rows(risky), {
      ...BASE,
      externalAssetFilter: '0xusdc',
      effectiveMaxRisk: 3,
    })

    expect(result).toHaveLength(0)
  })
})

describe('filterAndSortPools — address matching', () => {
  it('matches pools that only carry the address under underlyingInfo', () => {
    // Fluid doesn't populate the top-level `underlyingAddress`.
    const fluid = pool({ marketUid: 'FLUID:1:0xweth', underlyingAddress: '' })

    const result = filterAndSortPools(rows(fluid), { ...BASE, search: '0xusdc' })

    expect(uids(result)).toEqual(['FLUID:1:0xweth'])
  })
})

describe('filterAndSortPools — sorting', () => {
  it('sorts by APR descending by default and flips on asc', () => {
    const low = pool({ marketUid: 'low', depositRate: '1' })
    const high = pool({ marketUid: 'high', depositRate: '9' })

    expect(uids(filterAndSortPools(rows(low, high), BASE))).toEqual(['high', 'low'])
    expect(uids(filterAndSortPools(rows(low, high), { ...BASE, sortDir: 'asc' }))).toEqual([
      'low',
      'high',
    ])
  })

  it('does not mutate the input array', () => {
    const input = rows(
      pool({ marketUid: 'a', depositRate: '1' }),
      pool({ marketUid: 'b', depositRate: '9' })
    )
    const before = uids(input)

    filterAndSortPools(input, BASE)

    expect(uids(input)).toEqual(before)
  })
})
