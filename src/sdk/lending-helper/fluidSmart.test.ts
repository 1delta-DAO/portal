import { describe, it, expect } from 'vitest'
import {
  balancedCounterAmount,
  basketIntrinsicYield,
  groupByVault,
  isAutoBalanced,
  isBasketRate,
  isSmartVault,
  legIndexOf,
  lenderKeyOf,
  needsSequentialClose,
  hasSmartCollateral,
  positionBorrowRate,
  positionSupplyRate,
  rowAsset,
  rowIsLegOf,
  sharesForLegAmount,
  sideInfo,
  splitForShares,
  vaultTypeLabel,
  type FluidSideInfo,
  type FluidSmartInfo,
  type SmartVaultRow,
} from './fluidSmart'
import * as fluidSmart from './fluidSmart'

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const ETH = '0x0000000000000000000000000000000000000000'

/**
 * The live Ethereum USDC+ETH / USDC+ETH T4 (vault #77) — the one whose measured
 * figures FLUID_SMART_UI_PLAN.md §4.1 quotes: legs at 11.81 % and 8.19 %, the
 * position at 10.33 %.
 */
const T4: FluidSmartInfo = {
  vaultType: 40000,
  basketSupplyRate: 10.33,
  basketBorrowRate: -1.72,
  isSmartCol: true,
  isSmartDebt: true,
  collateralPair: [USDC, ETH],
  debtPair: [USDC, ETH],
  supplyDexTradingRate: 6.4,
  borrowDexTradingRate: 4.1,
  collateral: {
    assets: [
      { underlying: USDC, decimals: 6 },
      { underlying: ETH, decimals: 18 },
    ],
    dex: '0xdec0000000000000000000000000000000000001',
    // 1e18 shares ⇒ 1.2 USDC + 0.3 ETH.
    perShare: ['1200000', '300000000000000000'],
  },
  loan: {
    assets: [
      { underlying: USDC, decimals: 6 },
      { underlying: ETH, decimals: 18 },
    ],
    dex: '0xdec0000000000000000000000000000000000001',
    perShare: ['900000', '210000000000000000'],
  },
}

const usdcLeg: SmartVaultRow = {
  marketUid: `FLUID_1_77:1:${USDC}`,
  autoBalanced: true,
  fluid: T4,
}
const ethLeg: SmartVaultRow = {
  marketUid: `FLUID_1_77:1:${ETH}`,
  autoBalanced: true,
  fluid: T4,
}

/** A plain Aave row — no descriptor at all, which is the common case. */
const plain: SmartVaultRow = { marketUid: `AAVE_V3:1:${USDC}` }

/** A T2: LP collateral, single-token debt. */
const t2: SmartVaultRow = {
  marketUid: `FLUID_1_50:1:${USDC}`,
  autoBalanced: true,
  fluid: {
    ...T4,
    vaultType: 20000,
    isSmartDebt: false,
    debtPair: undefined,
    loan: undefined,
    basketBorrowRate: undefined,
  },
}

describe('detection', () => {
  it('treats a row with no descriptor as an ordinary market', () => {
    expect(isAutoBalanced(plain)).toBe(false)
    expect(isSmartVault(plain)).toBe(false)
    expect(vaultTypeLabel(plain)).toBeNull()
    expect(needsSequentialClose(plain)).toBe(false)
  })

  it('survives null and undefined rows', () => {
    for (const row of [null, undefined]) {
      expect(isAutoBalanced(row)).toBe(false)
      expect(isSmartVault(row)).toBe(false)
    }
  })

  it('labels the vault type', () => {
    expect(vaultTypeLabel(usdcLeg)).toBe('T4')
    expect(vaultTypeLabel(t2)).toBe('T2')
  })
})

describe('rates', () => {
  it('reports the POSITION rate, not the leg it was asked about', () => {
    // The whole §2.3 bug: ranking the max over legs read 11.81 %.
    expect(positionSupplyRate(usdcLeg, 11.81)).toBe(10.33)
    expect(positionSupplyRate(ethLeg, 8.19)).toBe(10.33)
    // A smart debt rate is legitimately negative — the DEX yield outruns it.
    expect(positionBorrowRate(usdcLeg, 0.93)).toBe(-1.72)
  })

  it('falls back to the leg rate on an ordinary market', () => {
    expect(positionSupplyRate(plain, 4.2)).toBe(4.2)
    expect(positionBorrowRate(plain, 6.7)).toBe(6.7)
  })

  it('falls back per SIDE, not per market', () => {
    // A T2's debt side is an ordinary single token: its borrow rate is the
    // leg's, and blending it would invent a basket that does not exist.
    expect(positionSupplyRate(t2, 11.81)).toBe(10.33)
    expect(positionBorrowRate(t2, 5.5)).toBe(5.5)
  })

  it('falls back when the basket rate is missing from an otherwise smart row', () => {
    const noBasket: SmartVaultRow = {
      ...usdcLeg,
      fluid: { ...T4, basketSupplyRate: undefined },
    }
    expect(positionSupplyRate(noBasket, 11.81)).toBe(11.81)
  })
})

describe('grouping', () => {
  it('collapses the legs of one vault and leaves ordinary markets alone', () => {
    const groups = groupByVault([plain, usdcLeg, ethLeg])
    expect(groups).toHaveLength(2)
    expect(groups[0].smart).toBe(false)
    expect(groups[1].smart).toBe(true)
    expect(groups[1].legs).toHaveLength(2)
    expect(groups[1].key).toBe('FLUID_1_77')
  })

  it('does NOT merge two ordinary markets that share a lender key', () => {
    const a = { marketUid: `AAVE_V3:1:${USDC}` }
    const b = { marketUid: `AAVE_V3:1:${ETH}` }
    expect(groupByVault([a, b])).toHaveLength(2)
  })

  it('keeps two different vaults apart', () => {
    expect(groupByVault([usdcLeg, t2])).toHaveLength(2)
  })

  it('extracts the lender key from a market uid', () => {
    expect(lenderKeyOf(`FLUID_1_77:1:${USDC}`)).toBe('FLUID_1_77')
    expect(lenderKeyOf('NO_COLONS')).toBe('NO_COLONS')
  })
})

describe('share ↔ token conversion', () => {
  const side = sideInfo(usdcLeg, 'collateral')!

  it('resolves the side and the leg positions', () => {
    expect(side).toBeDefined()
    expect(legIndexOf(side, USDC)).toBe(0)
    expect(legIndexOf(side, ETH)).toBe(1)
    // Case-insensitive — addresses arrive checksummed from some sources.
    expect(legIndexOf(side, USDC.toUpperCase().replace('0X', '0x'))).toBe(0)
    expect(legIndexOf(side, '0xdead')).toBe(-1)
  })

  it('returns no side for the simple half of a T2', () => {
    expect(sideInfo(t2, 'debt')).toBeUndefined()
    expect(sideInfo(plain, 'collateral')).toBeUndefined()
  })

  it('matches the pool ratio across DIFFERENT decimals', () => {
    // 1.2 USDC (6dp) per 0.3 ETH (18dp) ⇒ 1200 USDC pairs with 300 ETH.
    // The decimals cancel because each perShare entry is in its own leg's.
    expect(balancedCounterAmount(side, 0, 1_200_000_000n)).toBe(300_000_000_000_000_000_000n)
    expect(balancedCounterAmount(side, 1, 300_000_000_000_000_000_000n)).toBe(1_200_000_000n)
  })

  it('refuses rather than guesses on bad input', () => {
    expect(balancedCounterAmount(side, 0, -1n)).toBeNull()
    expect(balancedCounterAmount(side, 5, 1n)).toBeNull()
    expect(balancedCounterAmount(side, 0, 'not-a-number')).toBeNull()
    const zeroed = { ...side, perShare: ['0', '1'] as [string, string] }
    expect(balancedCounterAmount(zeroed, 0, 1n)).toBeNull()
  })

  it('round-trips shares and the split', () => {
    // 1000 USDC at 1.2 USDC per 1e18 shares ⇒ 833.33… e18 shares.
    const shares = sharesForLegAmount(side, 0, 1_000_000_000n)!
    expect(shares).toBe((1_000_000_000n * 10n ** 18n) / 1_200_000n)
    const split = splitForShares(side, shares)!
    // Back to (nearly) the input, and the other leg at the pool's ratio.
    expect(split[0]).toBe(999_999_999n) // integer division, one wei short
    expect(split[1]).toBeGreaterThan(0n)
  })

  it('returns null for a side with no ratio', () => {
    const simple = { ...side, perShare: null }
    expect(sharesForLegAmount(simple, 0, 1n)).toBeNull()
    expect(splitForShares(simple, 1n)).toBeNull()
  })
})

describe('exits and leverage', () => {
  it('flags a T4 close as needing two transactions', () => {
    expect(needsSequentialClose(usdcLeg)).toBe(true)
    // A T2 has a single-token debt, so its close is one call.
    expect(needsSequentialClose(t2)).toBe(false)
  })

  it('states no opinion about route availability', () => {
    // Deliberately not exported: looping is SERVED on T2/T3/T4 and migrate is
    // refused on T3/T4, and neither is predictable from the row — see the
    // module header. A client gate here was wrong in both directions.
    expect(Object.keys(fluidSmart)).not.toContain('leverageAvailability')
    expect(Object.keys(fluidSmart)).not.toContain('composerRouteAvailability')
  })
})

/**
 * Shapes that only the LIVE payload revealed. Every fixture below is a real row
 * from `/v1/data/lending/pools?chainId=1&lender=FLUID` (377 rows, 158 of them
 * auto-balanced), and each one broke something.
 */
describe('shapes found in live data', () => {
  const OSETH = '0xf1c9acdc66974dfb6decb12aa385b9cd01190e38'
  const WSTETH = '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0'

  /**
   * A T2 emits THREE rows — two collateral legs and the plain loan token — and
   * all three carry the same vault descriptor with `isSmartCol: true`. The loan
   * row is not in the collateral basket and must not be given its rate.
   * 17 Ethereum rows were showing exactly that.
   */
  const t2Loan: SmartVaultRow = {
    marketUid: `FLUID_1_159:1:${WSTETH}`,
    autoBalanced: false,
    fluid: {
      vaultType: 20000,
      isSmartCol: true,
      isSmartDebt: false,
      basketSupplyRate: 0.00017192654710334741,
      collateralPair: [OSETH, ETH],
    },
  }

  it('does NOT give a T2 loan row the collateral basket rate', () => {
    expect(positionSupplyRate(t2Loan, 3.4)).toBe(3.4)
    expect(isBasketRate(t2Loan, 'supply')).toBe(false)
    // The vault-level question still answers truthfully — the two must not be
    // conflated, which is the whole reason `rowIsLegOf` exists.
    expect(hasSmartCollateral(t2Loan)).toBe(true)
    expect(rowIsLegOf(t2Loan, 'collateral')).toBe(false)
  })

  it('still gives the T2 collateral legs the basket rate', () => {
    const leg: SmartVaultRow = { ...t2Loan, marketUid: `FLUID_1_159:1:${ETH}`, autoBalanced: true }
    expect(positionSupplyRate(leg, 1.71)).toBe(0.00017192654710334741)
  })

  /**
   * A T4 whose two sides use DIFFERENT dexes. `Loan wstETH` is a leg of the
   * debt basket but not of the collateral one, and its own deposit rate is 0 —
   * it supplies nothing. Before the fix it advertised 1.72 % supply APR.
   */
  const t4CrossDexLoan: SmartVaultRow = {
    marketUid: `FLUID_1_158:1:${WSTETH}`,
    autoBalanced: true,
    fluid: {
      vaultType: 40000,
      isSmartCol: true,
      isSmartDebt: true,
      basketSupplyRate: 1.72,
      basketBorrowRate: 0.4,
      collateralPair: [OSETH, ETH],
      debtPair: [WSTETH, ETH],
    },
  }

  it('applies the basket rate PER SIDE on a cross-dex T4', () => {
    // Not a collateral leg → keeps its own 0 % supply rate…
    expect(positionSupplyRate(t4CrossDexLoan, 0)).toBe(0)
    // …but it IS a debt leg, so the borrow basket applies.
    expect(positionBorrowRate(t4CrossDexLoan, 9.9)).toBe(0.4)
  })

  it('reads the row asset off the market uid, which both shapes carry', () => {
    // `PoolEntry.underlyingAddress` is served on ZERO live Fluid rows.
    expect(rowAsset(t2Loan)).toBe(WSTETH)
    expect(rowAsset({ marketUid: 'NOPE' })).toBeNull()
    expect(rowAsset(null)).toBeNull()
  })

  /**
   * An EMPTY pool reports `perShare: ['0','0']` — 18 live sides do. Nothing may
   * divide by it, and "balanced" is not a meaningful choice against it.
   */
  it('refuses every ratio computation on an empty pool', () => {
    const empty: FluidSideInfo = {
      assets: [
        { underlying: OSETH, decimals: 18 },
        { underlying: ETH, decimals: 18 },
      ],
      dex: '0xdead',
      perShare: ['0', '0'],
    }
    expect(balancedCounterAmount(empty, 0, 10n ** 18n)).toBeNull()
    expect(sharesForLegAmount(empty, 0, 10n ** 18n)).toBeNull()
  })
})

describe('basketIntrinsicYield', () => {
  // The live wstETH+ETH T4: wstETH carries the staking yield and ~8 % of the
  // value; ETH carries none and the rest.
  const WSTETH = '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0'
  const info: FluidSmartInfo = {
    vaultType: 40000,
    isSmartCol: true,
    isSmartDebt: true,
    basketSupplyRate: 1.7,
    collateralPair: [WSTETH, ETH],
    debtPair: [WSTETH, ETH],
  }
  type Row = SmartVaultRow & { iy: number; usd: number }
  const wst: Row = {
    marketUid: `FLUID_1_44:1:${WSTETH}`,
    autoBalanced: true,
    fluid: info,
    iy: 1.96,
    usd: 2_710_000,
  }
  const eth: Row = {
    marketUid: `FLUID_1_44:1:${ETH}`,
    autoBalanced: true,
    fluid: info,
    iy: 0,
    usd: 32_920_000,
  }
  const legs = [wst, eth]
  const get = (r: Row) => r.iy
  const w = (r: Row) => r.usd

  it('weights the intrinsic by each leg`s share, not by which row you asked', () => {
    const a = basketIntrinsicYield(wst, 'collateral', legs, get, w)!
    const b = basketIntrinsicYield(eth, 'collateral', legs, get, w)!
    // Same position ⇒ same answer from either leg.
    expect(a).toBeCloseTo(b, 10)
    // 1.96 × 2.71M / 35.63M ≈ 0.149 — not 1.96.
    expect(a).toBeCloseTo(0.149, 2)
  })

  it('returns null on an ordinary market so the caller keeps its own value', () => {
    expect(
      basketIntrinsicYield(
        plain,
        'collateral',
        [plain as any],
        () => 3,
        () => 1
      )
    ).toBeNull()
  })

  it('returns null rather than guessing when the weights are unusable', () => {
    const zeroed = legs.map((l) => ({ ...l, usd: 0 }))
    expect(basketIntrinsicYield(wst, 'collateral', zeroed, get, w)).toBeNull()
  })

  it('ignores rows from a different vault', () => {
    const other: Row = {
      marketUid: `FLUID_1_77:1:${WSTETH}`,
      autoBalanced: true,
      fluid: info,
      iy: 99,
      usd: 1e9,
    }
    const v = basketIntrinsicYield(wst, 'collateral', [...legs, other], get, w)!
    expect(v).toBeCloseTo(0.149, 2)
  })
})
