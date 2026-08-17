import { describe, it, expect } from 'vitest'
import {
  balancedCounterAmount,
  groupByVault,
  isAutoBalanced,
  isSmartVault,
  legIndexOf,
  lenderKeyOf,
  leverageAvailability,
  needsSequentialClose,
  positionBorrowRate,
  positionSupplyRate,
  sharesForLegAmount,
  sideInfo,
  splitForShares,
  vaultTypeLabel,
  type FluidSmartInfo,
  type SmartVaultRow,
} from './fluidSmart'

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
      expect(leverageAvailability(row).available).toBe(true)
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

  it('refuses leverage on smart vaults, with DIFFERENT reasons', () => {
    const t4 = leverageAvailability(usdcLeg)
    const two = leverageAvailability(t2)
    expect(t4.available).toBe(false)
    expect(two.available).toBe(false)
    // T3/T4 are structurally blocked; T2 is merely not enabled — conflating
    // them would promise a fix that cannot come for one of them.
    expect(t4.reason).not.toBe(two.reason)
    expect(t4.reason).toMatch(/two-token/i)
    expect(two.reason).toMatch(/not yet/i)
    // Both must say the position itself still works — the market is NOT dead.
    for (const r of [t4.reason, two.reason]) {
      expect(r).toMatch(/withdraw and repay/i)
    }
  })

  it('leaves every other lender loopable', () => {
    expect(leverageAvailability(plain).available).toBe(true)
    expect(leverageAvailability(plain).reason).toBeNull()
  })
})
