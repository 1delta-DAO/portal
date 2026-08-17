import { describe, it, expect } from 'vitest'
import { collapseSmartVaults, computePoolMetrics, type PoolWithMetrics } from './helpers'
import type { PoolEntry } from '../../../../sdk/lending-helper/poolTypes'
import type { FluidSmartInfo } from '../../../../sdk/lending-helper/fluidSmart'

/**
 * The earn surface has been burned four times by two rows that render
 * identically (AGENTS.md, "Two rows that render identically"). A Fluid T4 is
 * the fifth shape of the same bug and the worst of them: four rows for ONE
 * vault, at one LTV, often sharing a token, each showing a rate the position
 * does not earn. These tests pin the two halves of the fix — one row per
 * position, and the position's own rate on it.
 */

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const ETH = '0x0000000000000000000000000000000000000000'

const T4: FluidSmartInfo = {
  vaultType: 40000,
  basketSupplyRate: 10.33,
  basketBorrowRate: -1.72,
  isSmartCol: true,
  isSmartDebt: true,
  collateralPair: [USDC, ETH],
  debtPair: [USDC, ETH],
}

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
      prices: { priceUsd: 1, priceTs: '', priceUsd24h: 1, priceTs24h: '', priceChange24h: 0 },
      oraclePrice: { oraclePrice: 1, oraclePriceUsd: 1 },
    },
    risk: null,
    oracleInfo: null,
    ...overrides,
  } as PoolEntry
}

const rows = (...entries: PoolEntry[]): PoolWithMetrics[] =>
  entries.map((p) => ({ pool: p, metrics: computePoolMetrics(p) }))

// Vault #77's two legs. The smaller USDC leg deliberately carries the HIGHER
// leg rate, so "collapse to the best-sorted leg" and "collapse to the biggest
// leg" give different answers and the test can tell them apart.
const usdcLeg = pool({
  marketUid: `FLUID_1_77:1:${USDC}`,
  lenderKey: 'FLUID_1_77',
  name: 'Collateral USDC',
  underlyingAddress: USDC,
  depositRate: '11.81',
  variableBorrowRate: '0.93',
  totalDepositsUsd: '3250000',
  autoBalanced: true,
  fluid: T4,
})
const ethLeg = pool({
  marketUid: `FLUID_1_77:1:${ETH}`,
  lenderKey: 'FLUID_1_77',
  name: 'Collateral ETH',
  underlyingAddress: ETH,
  depositRate: '8.19',
  variableBorrowRate: '-3.48',
  totalDepositsUsd: '4700000',
  autoBalanced: true,
  fluid: T4,
})

describe('computePoolMetrics on an LP-backed side', () => {
  it('reports the position rate as `apr` and keeps the leg rate beside it', () => {
    const m = computePoolMetrics(usdcLeg)
    expect(m.apr).toBe(10.33)
    expect(m.aprLeg).toBe(11.81)
    expect(m.isBasketApr).toBe(true)
    // Both legs agree on the position rate — which is the point: they ARE one
    // position, and ranking on the max over legs is what read 11.81 %.
    expect(computePoolMetrics(ethLeg).apr).toBe(10.33)
  })

  it('carries the negative smart-debt rate through unclamped', () => {
    // −1.72 % is real: the DEX trading yield outruns the borrow cost. Clamping
    // it at zero would hide the single best fact about the market.
    expect(computePoolMetrics(usdcLeg).borrowApr).toBe(-1.72)
  })

  it('leaves an ordinary market byte-identical', () => {
    const m = computePoolMetrics(pool())
    expect(m.apr).toBe(5)
    expect(m.aprLeg).toBe(5)
    expect(m.borrowApr).toBe(7)
    expect(m.isBasketApr).toBe(false)
    expect(m.isBasketBorrowApr).toBe(false)
  })
})

describe('collapseSmartVaults', () => {
  it('renders ONE row for a vault and keeps every leg on it', () => {
    const out = collapseSmartVaults(rows(usdcLeg, ethLeg))
    expect(out).toHaveLength(1)
    expect(out[0].legs).toHaveLength(2)
  })

  it('represents the vault by its LARGEST leg, not the best-sorted one', () => {
    // Sorted best-first, the 11.81 % USDC leg comes first — but it is the
    // smaller one, and letting sort order pick the identity means the row
    // silently swaps token whenever the leg rates cross.
    const out = collapseSmartVaults(rows(usdcLeg, ethLeg))
    expect(out[0].pool.marketUid).toBe(`FLUID_1_77:1:${ETH}`)
  })

  it('holds the vault at the position its best leg earned in the sort', () => {
    const other = pool({ marketUid: 'AAVE_V3:1:0xdai', underlyingAddress: '0xdai' })
    const out = collapseSmartVaults(rows(usdcLeg, other, ethLeg))
    expect(out).toHaveLength(2)
    // The vault ranked first and stays first, even though the leg that now
    // represents it appeared third in the input.
    expect(out[0].legs).toHaveLength(2)
    expect(out[1].pool.marketUid).toBe('AAVE_V3:1:0xdai')
  })

  it('returns the SAME array when nothing is auto-balanced', () => {
    // Identity, not just equality — the collapse must cost nothing on the
    // overwhelmingly common path.
    const input = rows(pool(), pool({ marketUid: 'AAVE_V3:1:0xdai' }))
    expect(collapseSmartVaults(input)).toBe(input)
  })

  it('keeps two vaults apart even when both are auto-balanced', () => {
    const otherVault = pool({
      marketUid: `FLUID_1_50:1:${USDC}`,
      lenderKey: 'FLUID_1_50',
      underlyingAddress: USDC,
      autoBalanced: true,
      fluid: { ...T4, vaultType: 20000 },
    })
    expect(collapseSmartVaults(rows(usdcLeg, ethLeg, otherVault))).toHaveLength(2)
  })

  it('never merges the same vault id across chains', () => {
    const onBase = pool({
      ...usdcLeg,
      chainId: '8453',
      marketUid: `FLUID_1_77:8453:${USDC}`,
    } as Partial<PoolEntry>)
    expect(collapseSmartVaults(rows(usdcLeg, onBase))).toHaveLength(2)
  })
})
