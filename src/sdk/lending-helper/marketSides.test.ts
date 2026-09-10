import { describe, expect, it } from 'vitest'
import {
  bestTermApr,
  borrowTerms,
  fitsSide,
  isBrokeredBorrow,
  isCollateralOnly,
  isNotCollateral,
} from './marketSides'
import { rawMarketToPoolDataItem, type RawMarket } from './fetchMarkets'

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const LENDER = 'MORPHO_MIDNIGHT_2A9AE59053A64E409E819D3B76750948E06065B3164278915EB80CB1B7474B65'

/**
 * The two rows `/lending/latest` serves for a Morpho Midnight market whose
 * loan asset is also a collateral leg (USDC+cbBTC / USDC, chain 1, 2026-09-10).
 * The collateral leg carried a STALE rate card from before the rows were
 * split, which is exactly the payload the tables must not read as a borrow
 * offer.
 */
const rawRow = (over: Partial<RawMarket> & { flags: RawMarket['flags'] }): RawMarket =>
  ({
    marketUid: `${LENDER}:1:${USDC}`,
    name: 'Loan USDC',
    totalDeposits: 0,
    totalDebtStable: 0,
    totalDebt: 0,
    totalLiquidity: 0,
    totalDepositsUsd: 0,
    totalDebtStableUsd: 0,
    totalDebtUsd: 0,
    totalLiquidityUsd: 0,
    depositRate: 0,
    variableBorrowRate: 0,
    stableBorrowRate: 0,
    intrinsicYield: 0,
    rewards: [],
    config: {},
    caps: null,
    underlyingInfo: {
      asset: {
        chainId: '1',
        decimals: 6,
        name: 'USD Coin',
        address: USDC,
        symbol: 'USDC',
        logoURI: '',
        assetGroup: 'USDC',
        currencyId: 'usdc',
      },
      oraclePrice: null,
      prices: null,
    },
    ...over,
  }) as RawMarket

const collateralLeg = rawRow({
  marketUid: `${LENDER}:1:${USDC}-c0`,
  name: 'Collateral USDC',
  flags: {
    isActive: true,
    isFrozen: false,
    hasStable: false,
    borrowingEnabled: false,
    collateralActive: true,
    variableBorrowDisabled: null,
  },
  terms: [{ termId: '0', durationDays: '15.909', apr: '4.82365791' }],
})

const loanRow = rawRow({
  flags: {
    isActive: true,
    isFrozen: false,
    hasStable: false,
    borrowingEnabled: true,
    collateralActive: false,
    variableBorrowDisabled: false,
  },
  variableBorrowRate: 4.84875918,
  terms: [{ termId: '0', durationDays: '15.173', apr: '4.85980308' }],
})

describe('rawMarketToPoolDataItem — the row is passed through as served', () => {
  it('keeps the side flags and does not edit the card away', () => {
    // The API guarantees a non-borrowable row carries no card (origin
    // migration 0140). The transform must not paper over a payload that
    // breaks that — integrators reading the raw API and this UI must see the
    // same data. The presentation rules in `marketSides` are what keep a
    // leftover card from rendering as a borrow offer.
    const pool = rawMarketToPoolDataItem(collateralLeg)
    expect(pool.borrowingEnabled).toBe(false)
    expect(pool.collateralActive).toBe(true)
    expect(pool.terms).toEqual([{ termId: 0, durationDays: 15.909, apr: 4.82365791 }])
    expect(isBrokeredBorrow(pool)).toBe(false)
    expect(borrowTerms(pool)).toEqual([])
  })

  it('keeps the card on the borrowable row', () => {
    const pool = rawMarketToPoolDataItem(loanRow)
    expect(pool.borrowingEnabled).toBe(true)
    expect(pool.terms).toEqual([{ termId: 0, durationDays: 15.173, apr: 4.85980308 }])
  })

  it('keeps the card when the flags block is absent (older payloads)', () => {
    const pool = rawMarketToPoolDataItem(
      rawRow({ flags: null, terms: [{ termId: '1', durationDays: '30', apr: '3' }] })
    )
    expect(pool.terms).toEqual([{ termId: 1, durationDays: 30, apr: 3 }])
  })
})

describe('marketSides', () => {
  const collateral = { borrowingEnabled: false, collateralActive: true }
  const loan = { borrowingEnabled: true, collateralActive: false }
  const pooled = { borrowingEnabled: true, collateralActive: true }

  it('a collateral-only leg is never a brokered borrow, whatever it carries', () => {
    const stale = { ...collateral, terms: [{ termId: 0, durationDays: 15, apr: 4.82 }] }
    expect(isCollateralOnly(stale)).toBe(true)
    expect(isBrokeredBorrow(stale)).toBe(false)
    expect(isBrokeredBorrow({ ...collateral, variableBorrowDisabled: true })).toBe(false)
    expect(borrowTerms(stale)).toEqual([])
  })

  it('the loan row with a rate card IS a brokered borrow', () => {
    const card = [{ termId: 0, durationDays: 15, apr: 4.86 }]
    expect(isBrokeredBorrow({ ...loan, terms: card })).toBe(true)
    expect(isBrokeredBorrow({ ...loan, variableBorrowDisabled: true })).toBe(true)
    expect(borrowTerms({ ...loan, terms: card })).toEqual(card)
    expect(bestTermApr(card)).toBe(4.86)
    expect(bestTermApr(null)).toBeNull()
  })

  it('a pooled market with a variable rate is neither', () => {
    expect(isBrokeredBorrow(pooled)).toBe(false)
    expect(isCollateralOnly(pooled)).toBe(false)
    expect(isNotCollateral(pooled)).toBe(false)
  })

  it('fits the slot by side: collateral leg → deposits, loan row → debt', () => {
    expect(fitsSide(collateral, 'deposits')).toBe(true)
    expect(fitsSide(collateral, 'debt')).toBe(false)
    expect(fitsSide(loan, 'debt')).toBe(true)
    expect(fitsSide(loan, 'deposits')).toBe(false)
    expect(fitsSide(pooled, 'deposits')).toBe(true)
    expect(fitsSide(pooled, 'debt')).toBe(true)
  })
})
