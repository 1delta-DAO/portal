import { describe, expect, it } from 'vitest'
import type { PoolConfigGroup, PoolDataItem } from '../../../sdk/lending-helper/marketTypes'
import {
  findConfigContaining,
  readOptimizerDeepLink,
  resolveDeepLinkPool,
  stripDeepLinkParams,
} from './deepLink'
import { OPTIMIZER_DEEPLINK_KEYS } from '../../../utils/routes'

/**
 * Optimizer hand-offs used to carry token ADDRESSES only. That is ambiguous on
 * vault lenders — Euler runs many vaults over one underlying — so "Details" on
 * a row landed on whichever vault sorted first in the lender's pool list, at a
 * different rate and a different config than the row the user clicked. The UID
 * params fix the market identity; these tests pin the precedence.
 */
const pool = (marketUid: string, underlying: string): PoolDataItem =>
  ({ marketUid, underlying }) as PoolDataItem

describe('resolveDeepLinkPool', () => {
  const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
  // Three Euler vaults over the same underlying — the exact shape that made an
  // address-only hand-off wrong.
  const pools = [
    pool('EULER_V2:1:0xaaa', USDC.toLowerCase()),
    pool('EULER_V2:1:0xbbb', USDC.toLowerCase()),
    pool('EULER_V2:1:0xccc', USDC.toLowerCase()),
  ]

  it('picks the market named by the UID, not the first one sharing the underlying', () => {
    expect(resolveDeepLinkPool(pools, 'EULER_V2:1:0xccc', USDC)?.marketUid).toBe('EULER_V2:1:0xccc')
  })

  it('falls back to the address when no UID is supplied (pre-UID links)', () => {
    expect(resolveDeepLinkPool(pools, null, USDC)?.marketUid).toBe('EULER_V2:1:0xaaa')
  })

  it('falls back to the address when the UID resolves to nothing', () => {
    // A stale link, or a lender whose rows carry no UID. Landing on the right
    // asset beats landing nowhere.
    expect(resolveDeepLinkPool(pools, 'EULER_V2:1:0xdead', USDC)?.marketUid).toBe(
      'EULER_V2:1:0xaaa'
    )
  })

  it('matches the address case-insensitively', () => {
    expect(resolveDeepLinkPool(pools, null, USDC.toUpperCase())).toBeDefined()
  })

  it('returns undefined when neither handle resolves', () => {
    expect(resolveDeepLinkPool(pools, null, '0xdead')).toBeUndefined()
    expect(resolveDeepLinkPool(pools, null, null)).toBeUndefined()
    expect(resolveDeepLinkPool([], 'EULER_V2:1:0xaaa', USDC)).toBeUndefined()
  })
})

describe('readOptimizerDeepLink', () => {
  const link = (q: string) => readOptimizerDeepLink(new URLSearchParams(q))

  it('reads every hand-off param', () => {
    const l = link('colm=U1&debtm=U2&col=0x1&debt=0x2&config=3&action=loop&amt=100')
    expect(l.colMarketUid).toBe('U1')
    expect(l.debtMarketUid).toBe('U2')
    expect(l.colAddr).toBe('0x1')
    expect(l.debtAddr).toBe('0x2')
    expect(l.configId).toBe('3')
    expect(l.action).toBe('loop')
    expect(l.amount).toBe('100')
    expect(l.hasPair).toBe(true)
  })

  it('reports a pair from UIDs alone', () => {
    expect(link('colm=U1').hasPair).toBe(true)
    expect(link('debtm=U2').hasPair).toBe(true)
  })

  it('reports no pair when only a config is present', () => {
    // Still consumable — a config-only link pins the config — but the pool
    // resolution has nothing to do.
    const l = link('config=3')
    expect(l.hasPair).toBe(false)
    expect(l.configId).toBe('3')
  })

  it('gives links that differ only by config distinct signatures', () => {
    // Consumers dedupe on the signature. If the config were left out, a second
    // hand-off to the same pair under a different e-mode would be swallowed as
    // "already applied" and silently show the first config's leverage.
    expect(link('colm=U1&config=1').signature).not.toBe(link('colm=U1&config=2').signature)
  })

  it('is stable across re-reads of the same params', () => {
    expect(link('colm=U1&config=1').signature).toBe(link('colm=U1&config=1').signature)
  })
})

/**
 * The config groups are a SEPARATE fetch from the pools and land second — after
 * the hand-off has already resolved its markets and stripped the URL. Without
 * deriving the config from the market, the by-config view then settles on its
 * own default, which need not contain the market that was just selected: the
 * user lands on a table where the row they clicked isn't listed, and the
 * pre-selection looks like it silently failed.
 */
describe('findConfigContaining', () => {
  const group = (configId: string, collaterals: string[], borrowables: string[]) =>
    ({
      configId,
      collaterals: collaterals.map((marketUid) => ({ marketUid })),
      borrowables: borrowables.map((marketUid) => ({ marketUid })),
    }) as unknown as PoolConfigGroup

  const groups = [
    // The default the view would otherwise pick (first / deepest): holds the
    // collateral but cannot borrow the debt asset.
    group('0', ['WETH', 'USDC'], ['USDC']),
    group('1', ['WETH', 'USDC'], ['USDC', 'USDT']),
    group('2', ['WBTC'], ['USDC']),
  ]

  it('requires a group holding BOTH legs', () => {
    // Config 0 lists WETH as collateral but can't borrow USDT — a loop there is
    // impossible, so it is not an answer even though it matches one leg.
    expect(findConfigContaining(groups, 'WETH', 'USDT')).toBe('1')
  })

  it('matches a single collateral leg on its own side', () => {
    expect(findConfigContaining(groups, 'WBTC', null)).toBe('2')
  })

  it('matches a single debt leg on its own side', () => {
    expect(findConfigContaining(groups, null, 'USDT')).toBe('1')
  })

  it('returns the first group when several qualify', () => {
    // Groups arrive pre-sorted by the caller, so "first" is "best".
    expect(findConfigContaining(groups, 'WETH', 'USDC')).toBe('0')
  })

  it('returns null when nothing holds the pair, rather than guessing', () => {
    // A wrong pin is worse than none: the view's own default at least reflects
    // the user's active e-mode.
    expect(findConfigContaining(groups, 'WBTC', 'USDT')).toBeNull()
  })

  it('returns null for empty or absent inputs', () => {
    expect(findConfigContaining(undefined, 'WETH', 'USDC')).toBeNull()
    expect(findConfigContaining([], 'WETH', 'USDC')).toBeNull()
    expect(findConfigContaining(groups, null, null)).toBeNull()
  })

  it('tolerates groups with null sides', () => {
    // Collateral-only and borrow-only configs both exist in the API shape.
    const sparse = [
      { configId: 'a', collaterals: null, borrowables: [{ marketUid: 'USDC' }] },
      { configId: 'b', collaterals: [{ marketUid: 'WETH' }], borrowables: null },
    ] as unknown as PoolConfigGroup[]
    expect(findConfigContaining(sparse, null, 'USDC')).toBe('a')
    expect(findConfigContaining(sparse, 'WETH', null)).toBe('b')
    expect(findConfigContaining(sparse, 'WETH', 'USDC')).toBeNull()
  })
})

describe('stripDeepLinkParams', () => {
  it('removes every hand-off key', () => {
    const next = stripDeepLinkParams(
      new URLSearchParams('colm=U1&debtm=U2&col=0x1&debt=0x2&config=3&action=loop&amt=100')
    )
    for (const k of Object.values(OPTIMIZER_DEEPLINK_KEYS)) expect(next.has(k)).toBe(false)
    expect(next.toString()).toBe('')
  })

  it('leaves unrelated params intact', () => {
    // `riskTolerance` is owned by RiskMode, which re-asserts it into the URL
    // after every navigation — dropping it here would fight that effect.
    const next = stripDeepLinkParams(new URLSearchParams('colm=U1&riskTolerance=5&foo=bar'))
    expect(next.get('riskTolerance')).toBe('5')
    expect(next.get('foo')).toBe('bar')
    expect(next.has(OPTIMIZER_DEEPLINK_KEYS.colMarket)).toBe(false)
  })

  it('does not mutate the input', () => {
    const params = new URLSearchParams('colm=U1')
    stripDeepLinkParams(params)
    expect(params.get('colm')).toBe('U1')
  })
})
