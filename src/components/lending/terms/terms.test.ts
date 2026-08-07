import { describe, expect, it } from 'vitest'
import { duration, exposureSummary, feeAmount, isRebate, pct, tagLabel } from './format'
import {
  criticalFindings,
  findings,
  hasCritical,
  hasExpandableDetail,
  rankedTags,
  severityOfTag,
  splitFindings,
} from './severity'
import { isFullSheet, sideInfo } from './types'
import { lenderSupportsNative } from '../actions/helpers'
import { aprPercentToWad, wadToAprPercent } from '../../../sdk/lending-helper/fetchLiquityRate'
import type { AnyTermSheet, FeeTerm, TermSheet, TermSheetDigest } from './types'

/**
 * The portal keeps its OWN copy of `pct` / `severity` rather than importing
 * `@1delta/margin-fetcher` (bundle cost). That copy can therefore regress
 * independently of the API's, which is exactly why it needs its own tests.
 *
 * Two things are load-bearing here:
 *  1. **Units.** Rates arrive as PERCENT, factors/ratios as FRACTIONS. Mixing
 *     them up renders a wrong number without throwing.
 *  2. **Shape.** List endpoints default to `?terms=digest`, whose sides hoist
 *     `headline`/`tags` and carry no `info`. Severity MUST behave identically
 *     on both shapes — it gates the pre-signature disclosure.
 */

describe('pct — input is already a PERCENT', () => {
  it('renders typical rates verbatim', () => {
    expect(pct(49.88)).toBe('49.88%')
    expect(pct(4.99)).toBe('4.99%')
    expect(pct(0)).toBe('0%')
  })

  it('does not eat INTEGER zeros when dp leaves no decimal point', () => {
    // Regression: the naive /\.?0+$/ strip rendered 100 as "1%" — so a market
    // at 100 % utilization looked like it was at 1 %.
    expect(pct(100, 0)).toBe('100%')
    expect(pct(1000, 0)).toBe('1000%')
    expect(pct(50, 0)).toBe('50%')
  })

  it('trims only the fractional tail', () => {
    expect(pct(76)).toBe('76%')
    expect(pct(4.9)).toBe('4.9%')
    expect(pct(20.5)).toBe('20.5%')
    expect(pct(100, 1)).toBe('100%')
  })

  it('degrades instead of printing NaN', () => {
    expect(pct(undefined)).toBe('—')
    expect(pct(null)).toBe('—')
    expect(pct(Number.NaN)).toBe('—')
  })

  it('matches the API formatter exactly, so a headline and a cell agree', () => {
    // The API emits the headline; the table cell is formatted here. Any
    // divergence (a stray space, different trimming) reads as two figures.
    expect(pct(49.88)).toBe('49.88%')
    expect(pct(49.88)).not.toContain(' ')
  })
})

describe('duration', () => {
  it('picks the coarsest honest unit', () => {
    expect(duration(300)).toBe('5min')
    expect(duration(3600)).toBe('1h')
    expect(duration(86_400)).toBe('1d')
    expect(duration(604_800)).toBe('7d')
  })

  it('distinguishes a real zero from absence', () => {
    // `0` = no notice period (a fact). `undefined` = not known.
    expect(duration(0)).toBe('none')
    expect(duration(undefined)).toBe('—')
  })
})

describe('feeAmount — the unit comes from the fee record', () => {
  const base: FeeTerm = {
    id: 'x',
    label: 'Fee',
    when: 'entry',
    unit: 'percent',
    basis: 'principal',
    value: 0.5,
  }

  it('renders each unit in its own terms', () => {
    expect(feeAmount(base)).toBe('0.5%')
    expect(feeAmount({ ...base, unit: 'bps', value: 10 })).toBe('10 bps')
    expect(feeAmount({ ...base, unit: 'apr-percent', value: 164.24 })).toBe('164.24%/yr')
  })

  it('renders an UNKNOWN unit rather than dropping the row', () => {
    // Open enums: a newer API may add a unit this build predates.
    expect(feeAmount({ ...base, unit: 'per-block' as never, value: 7 })).toBe('7')
  })

  it('treats a negative value as a rebate without losing the magnitude', () => {
    const rebate = { ...base, value: -0.3 }
    expect(isRebate(rebate)).toBe(true)
    expect(feeAmount(rebate)).toBe('0.3%')
    expect(isRebate(base)).toBe(false)
  })
})

describe('tagLabel / exposureSummary degrade on unknown input', () => {
  it('de-kebabs a tag this build has never seen', () => {
    expect(tagLabel('time-liquidation')).toBe('Time-based liquidation')
    expect(tagLabel('some-future-tag' as never)).toBe('some future tag')
  })

  it('never claims a measured split for an unweighted set', () => {
    // Pooled lenders do not record which collateral backs which borrow, so
    // "accepted" is the honest word and there is no percentage to show.
    expect(exposureSummary({ count: 30, weightBasis: 'unweighted' })).toBe(
      '30 accepted collateral assets'
    )
    expect(exposureSummary({ count: 3, weightBasis: 'allocation', topWeightPct: 62.4 })).toBe(
      '3 markets, largest 62%'
    )
    expect(exposureSummary(undefined)).toBe('—')
  })
})

// ---------------------------------------------------------------------------
// Shape handling — the crash that shipped, and the gate it silently disabled
// ---------------------------------------------------------------------------

/** A Teller-shaped market: time liquidation + full-collateral seizure. */
const FULL: TermSheet = {
  schemaVersion: 1,
  asOf: 1_800_000_000,
  profileId: 'teller.pool@v1',
  marketUid: 'TELLER_0xp:1:0xusdc',
  borrow: {
    rate: {
      kind: 'fixed-term',
      apr: 12,
      components: { base: 12 },
      aprTotal: 12,
      basis: 'apr-nominal',
      compounding: 'none',
      source: 'derived',
      isLocked: true,
    },
    maturity: { kind: 'rolling-duration', atMaturity: 'default-seizure', graceSecs: 300 },
    debtShape: 'accruing',
    exit: {
      earlyRepay: 'free',
      atMaturityCost: 'accrued',
      lateBehaviour: 'default-seizure',
      partialAllowed: false,
      fees: [],
    },
    liquidation: {
      trigger: 'time',
      penalty: 0,
      closeFactor: 1,
      seizure: 'full-collateral',
      gracePeriodSecs: 300,
    },
    fees: [],
    counterparty: { kind: 'pool', solvency: 'undercollateralized' },
    availability: { canOpen: true, canClose: true, gating: 'permissionless' },
    info: {
      headline: 'Fixed 12% for up to 30 days',
      description: 'A fixed-term loan with time-based default.',
      // The API emits ONE implication per non-info finding, ordered
      // most-severe-first — so in practice there are at least as many as
      // there are critical tags.
      implications: [
        'On default a liquidator takes your ENTIRE collateral.',
        'This loan can be liquidated for being LATE.',
        'Borrowers here are not fully collateralised on-chain.',
      ],
      tags: ['time-liquidation', 'full-collateral-seizure', 'undercollateralized', 'fixed-rate'],
    },
  },
}

/** The same market as the API's DEFAULT digest: hoisted fields, no `info`. */
const DIGEST: TermSheetDigest = {
  schemaVersion: 1,
  profileId: 'teller.pool@v1',
  marketUid: 'TELLER_0xp:1:0xusdc',
  borrow: {
    rateKind: 'fixed-term',
    apr: 12,
    maturityKind: 'rolling-duration',
    debtShape: 'accruing',
    earlyRepay: 'free',
    liquidationTrigger: 'time',
    canOpen: true,
    headline: 'Fixed 12% for up to 30 days',
    tags: ['time-liquidation', 'full-collateral-seizure', 'undercollateralized', 'fixed-rate'],
  },
}

describe('sideInfo reads either shape', () => {
  it('unwraps the nested `info` on a full sheet', () => {
    expect(isFullSheet(FULL)).toBe(true)
    expect(sideInfo(FULL, 'borrow')?.headline).toBe('Fixed 12% for up to 30 days')
    expect(sideInfo(FULL, 'borrow')?.implications).toHaveLength(3)
  })

  it('reads the hoisted fields on a digest — the shape that used to crash', () => {
    // `sheet.borrow.info.tags` threw here: the digest has no `info` object.
    expect(isFullSheet(DIGEST)).toBe(false)
    expect(sideInfo(DIGEST, 'borrow')?.headline).toBe('Fixed 12% for up to 30 days')
    expect(sideInfo(DIGEST, 'borrow')?.tags).toContain('time-liquidation')
  })

  it('returns undefined for an absent side — which is meaningful', () => {
    // No `supply` block means the market has no supply side, not "unknown".
    expect(sideInfo(FULL, 'supply')).toBeUndefined()
    expect(sideInfo(undefined, 'borrow')).toBeUndefined()
  })

  it('survives degenerate payloads without throwing', () => {
    for (const bad of [{}, { borrow: {} }, { borrow: null }] as unknown[]) {
      expect(() => sideInfo(bad as AnyTermSheet, 'borrow')).not.toThrow()
    }
  })
})

describe('severity behaves IDENTICALLY on a sheet and its digest', () => {
  it('ranks the same tags, most severe first', () => {
    expect(rankedTags(FULL, 'borrow')).toEqual(rankedTags(DIGEST, 'borrow'))
    expect(severityOfTag(rankedTags(DIGEST, 'borrow')[0])).toBe('critical')
  })

  it('fires the disclosure gate on BOTH shapes', () => {
    // The bug this pins: findings came only from `implications[]`, which the
    // digest lacks — so `hasCritical` was false and the gate silently vanished
    // on the DEFAULT response shape.
    expect(hasCritical(FULL, 'borrow')).toBe(true)
    expect(hasCritical(DIGEST, 'borrow')).toBe(true)
  })

  it('surfaces every critical fact on both shapes', () => {
    // Exact parity is NOT an invariant: the full sheet takes its text from
    // `implications[]` (positionally severity-ranked) while the digest derives
    // from tags, so wording and granularity can differ. What must hold is that
    // neither under-discloses — both surface at least one entry per critical
    // tag.
    const criticalTags = rankedTags(DIGEST, 'borrow').filter(
      (t) => severityOfTag(t) === 'critical'
    ).length
    expect(criticalTags).toBeGreaterThan(0)
    expect(criticalFindings(FULL, 'borrow').length).toBeGreaterThanOrEqual(criticalTags)
    expect(criticalFindings(DIGEST, 'borrow').length).toBeGreaterThanOrEqual(criticalTags)
  })

  it('prefers the API prose when present, falls back to tag text otherwise', () => {
    expect(findings(FULL, 'borrow')[0].message).toBe(
      'On default a liquidator takes your ENTIRE collateral.'
    )
    // Digest: derived from tags, never empty.
    for (const f of findings(DIGEST, 'borrow')) {
      expect(f.message.length).toBeGreaterThan(0)
    }
  })

  it('never returns an empty message, even for an unknown tag', () => {
    const odd = {
      ...DIGEST,
      borrow: { ...DIGEST.borrow!, tags: ['brand-new-critical-thing'] as never },
    }
    const f = findings(odd, 'borrow')
    // Unknown tags rank `info` and are filtered out — but nothing throws.
    expect(() => findings(odd, 'borrow')).not.toThrow()
    for (const x of f) expect(x.message).not.toBe('')
  })

  it('does NOT fire on a plain variable pool', () => {
    // Disclosure fatigue is the failure mode: a gate that fires on an ordinary
    // deposit trains users to click through.
    const plain: TermSheetDigest = {
      schemaVersion: 1,
      profileId: 'pool.variable@v1',
      supply: {
        rateKind: 'variable-curve',
        aprTotal: 4.1,
        maturityKind: 'perpetual',
        exitMode: 'instant',
        settlement: 'sync',
        canOpen: true,
        headline: 'Variable 4.1% · withdraw any time',
        tags: ['variable-rate', 'perpetual', 'exit-instant', 'price-liquidation'],
      },
    }
    expect(hasCritical(plain, 'supply')).toBe(false)
    expect(criticalFindings(plain, 'supply')).toHaveLength(0)
  })

  it('returns nothing for a missing sheet or side rather than throwing', () => {
    expect(findings(undefined as never, 'borrow')).toEqual([])
    expect(hasCritical(undefined, 'borrow')).toBe(false)
    expect(criticalFindings(FULL, 'supply')).toEqual([])
  })
})

// ---------------------------------------------------------------------------

describe('user-set rate: percent in the UI, WAD on the wire', () => {
  it('converts a percent rate to a WAD fraction', () => {
    // The single most dangerous conversion here: passing 5.34 where
    // 0.0534e18 was meant sets a rate 100x off.
    expect(aprPercentToWad(5.34)).toBe('53400000000000000')
    expect(aprPercentToWad(0.5)).toBe('5000000000000000')
    expect(aprPercentToWad(25)).toBe('250000000000000000')
    expect(aprPercentToWad(100)).toBe('1000000000000000000')
  })

  it('ROUNDS rather than truncates', () => {
    // 5.34 / 100 in float is 0.053400000000000003; truncating the product
    // would set a rate a hair off what the user typed, every time.
    expect(aprPercentToWad(5.34)).toBe('53400000000000000')
    expect(aprPercentToWad(1.1)).toBe('11000000000000000')
    expect(aprPercentToWad(3.7)).toBe('37000000000000000')
  })

  it('round-trips through wadToAprPercent', () => {
    for (const p of [0.5, 3.7, 5.34, 25]) {
      expect(wadToAprPercent(aprPercentToWad(p))).toBeCloseTo(p, 9)
    }
  })

  it('never emits a negative or non-numeric rate', () => {
    expect(aprPercentToWad(-5)).toBe('0')
    expect(aprPercentToWad(Number.NaN)).toBe('0')
    expect(aprPercentToWad(Number.POSITIVE_INFINITY)).toBe('0')
    expect(wadToAprPercent(undefined)).toBeUndefined()
  })
})

describe('Liquity open: the borrow form cannot express this call', () => {
  it('sends collateral, debt and rate together, with the rate as WAD', async () => {
    const calls: { url: string; body: any }[] = []
    const orig = globalThis.fetch
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) })
      return {
        ok: true,
        json: async () => ({ success: true, data: { transactions: [], permissions: [] } }),
      }
    }) as never

    const { fetchLiquityOpen } = await import('../../../sdk/lending-helper/fetchLiquityRate')
    await fetchLiquityOpen({
      chainId: '1',
      lender: 'LIQUITY_V2_1_1',
      account: '0xabc',
      collAmount: '1000000000000000000',
      amount: '2000000000000000000000',
      aprPercent: 5.34,
    })
    globalThis.fetch = orig

    expect(calls[0].url).toContain('/v1/actions/liquity/open')
    expect(calls[0].body.collAmount).toBe('1000000000000000000')
    expect(calls[0].body.amount).toBe('2000000000000000000000')
    // Percent → WAD happens in the client, once.
    expect(calls[0].body.interestRate).toBe('53400000000000000')
  })

  it('OMITS the rate when none is chosen, so the branch average applies', async () => {
    const calls: any[] = []
    const orig = globalThis.fetch
    globalThis.fetch = (async (_u: any, init: any) => {
      calls.push(JSON.parse(init.body))
      return {
        ok: true,
        json: async () => ({ success: true, data: { transactions: [], permissions: [] } }),
      }
    }) as never
    const { fetchLiquityOpen } = await import('../../../sdk/lending-helper/fetchLiquityRate')
    await fetchLiquityOpen({
      chainId: '1',
      lender: 'LIQUITY_V2_1_1',
      account: '0xabc',
      collAmount: '1',
      amount: '1',
    })
    globalThis.fetch = orig
    // Sending 0 would set a 0 % rate — first in the redemption queue.
    expect('interestRate' in calls[0]).toBe(false)
  })
})

describe('summary collapse — what survives it, and when to offer a toggle', () => {
  // A digest with a critical tag (time liquidation) and a non-critical one
  // (governance boilerplate) on the borrow side.
  const digest = (tags: string[], description?: string): AnyTermSheet =>
    ({
      borrow: {
        headline: 'Variable 8.43% · repay any time at no extra cost',
        tags,
        ...(description ? { description } : {}),
      },
    }) as unknown as AnyTermSheet

  it('keeps criticals out of the collapsed-away pile', () => {
    // A critical is what gates the wallet — it must not be reachable only by
    // expanding.
    const { criticals, secondary } = splitFindings(
      digest(['time-liquidation', 'no-timelock']),
      'borrow',
    )
    expect(criticals.map((f) => f.id)).toContain('borrow-time-liquidation')
    expect(secondary.map((f) => f.id)).not.toContain('borrow-time-liquidation')
  })

  it('moves governance boilerplate into the detail', () => {
    const { criticals, secondary } = splitFindings(digest(['no-timelock']), 'borrow')
    expect(criticals).toEqual([])
    expect(secondary.map((f) => f.id)).toContain('borrow-no-timelock')
  })

  it('offers a toggle when there IS something behind it', () => {
    // A secondary finding alone is enough.
    expect(hasExpandableDetail(digest(['no-timelock']), 'borrow')).toBe(true)
    // So is a description, with no findings at all.
    expect(hasExpandableDetail(digest([], 'Some prose.'), 'borrow')).toBe(true)
  })

  it('offers NO toggle on a digest with nothing but criticals', () => {
    // Expanding would show "Full terms are not loaded for this market" — a
    // dead end. The critical itself is already visible while collapsed.
    expect(hasExpandableDetail(digest(['time-liquidation']), 'borrow')).toBe(false)
    expect(hasExpandableDetail(digest([]), 'borrow')).toBe(false)
  })

  it('always offers a toggle on a FULL sheet — there are rows to show', () => {
    const full = {
      borrow: { info: { headline: 'x', description: '', tags: [] } },
    } as unknown as AnyTermSheet
    expect(hasExpandableDetail(full, 'borrow')).toBe(true)
  })
})

describe('native capability — allow by default, deny only where impossible', () => {
  it('leaves every ordinary lender alone', () => {
    // The gate is a DENY list precisely so this stays true: flipping it to
    // allow-by-exception would silently drop the toggle everywhere.
    for (const l of ['AAVE_V3', 'MORPHO_BLUE', 'EULER_V2', 'FLUID_1_11', undefined]) {
      expect(lenderSupportsNative(l), String(l)).toBe(true)
    }
  })

  it('denies Curvance, including its per-market keys', () => {
    expect(lenderSupportsNative('CURVANCE')).toBe(false)
    expect(lenderSupportsNative('CURVANCE_143_E1C24B2E93230FBE33D32BA38ECA3218284143E2')).toBe(false)
    // A marketUid, which is what some call sites hold.
    expect(lenderSupportsNative('CURVANCE_143_ABC:143:0xdead')).toBe(false)
  })

  it('does NOT deny Midnight — "not built yet" is not "cannot exist"', () => {
    // Midnight has no composer path yet and the API 501s; that error is meant
    // to surface in the panel. Curvance has no native entry point at all.
    expect(lenderSupportsNative('MORPHO_MIDNIGHT_0xabc')).toBe(true)
  })

  it('is not fooled by a lender that merely starts with the same letters', () => {
    expect(lenderSupportsNative('CURVE_LEND')).toBe(true)
  })
})
