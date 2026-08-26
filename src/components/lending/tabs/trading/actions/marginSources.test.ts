import { describe, it, expect } from 'vitest'
import { deriveMarginSources } from './marginSources'

const MARKET = 'DOLOMITE:1:0'
const OTHER = 'DOLOMITE:1:6'

const pos = (marketUid: string, deposits: number, depositsUSD = deposits * 2) =>
  ({
    marketUid,
    deposits,
    debt: 0,
    debtStable: 0,
    depositsUSD,
    debtUSD: 0,
    debtStableUSD: 0,
    collateralEnabled: true,
    claimableRewards: 0,
  }) as any

const sub = (accountId: string, positions: any[], health: number | null = null) =>
  ({
    accountId,
    health,
    borrowCapacityUSD: 0,
    balanceData: {} as any,
    aprData: {} as any,
    userConfig: {} as any,
    positions,
  }) as any

describe('deriveMarginSources', () => {
  it('lists sub-accounts holding the pay asset, richest first', () => {
    const r = deriveMarginSources({
      subAccounts: [
        sub('0', [pos(MARKET, 0.5)]),
        sub('2', [pos(MARKET, 3)]),
        sub('4', [pos(OTHER, 9)]),
      ],
      tradeAccountId: '1',
      marketUid: MARKET,
    })
    expect(r.map((s) => s.accountId)).toEqual(['2', '0'])
    expect(r[0].balance).toBe('3')
  })

  it('excludes the trade account — a self-transfer removes no transaction', () => {
    const r = deriveMarginSources({
      subAccounts: [sub('1', [pos(MARKET, 5)]), sub('0', [pos(MARKET, 2)])],
      tradeAccountId: '1',
      marketUid: MARKET,
    })
    expect(r.map((s) => s.accountId)).toEqual(['0'])
  })

  it('treats an absent trade account as the DEFAULT account, not "no account"', () => {
    // Opening into the default account while account 0 holds the asset must not
    // offer account 0 as a source — it is the same account.
    const r = deriveMarginSources({
      subAccounts: [sub('0', [pos(MARKET, 5)])],
      tradeAccountId: undefined,
      marketUid: MARKET,
    })
    expect(r).toEqual([])
  })

  it('keeps account "0" when it is NOT the trade account', () => {
    // `0` is the likeliest place a user's funds already sit; a falsy check
    // anywhere on this path silently drops the only real source.
    const r = deriveMarginSources({
      subAccounts: [sub('0', [pos(MARKET, 5)])],
      tradeAccountId: '3',
      marketUid: MARKET,
    })
    expect(r).toHaveLength(1)
    expect(r[0].accountId).toBe('0')
  })

  it('ignores zero and other-market balances', () => {
    const r = deriveMarginSources({
      subAccounts: [sub('0', [pos(MARKET, 0)]), sub('2', [pos(OTHER, 7)])],
      tradeAccountId: '1',
      marketUid: MARKET,
    })
    expect(r).toEqual([])
  })

  it('prefers the aggregate row on a brokered market, never a per-loan row', () => {
    const loan = { ...pos(MARKET, 99), term: { termId: 1 } }
    const r = deriveMarginSources({
      subAccounts: [sub('0', [loan, pos(MARKET, 4)])],
      tradeAccountId: '1',
      marketUid: MARKET,
    })
    expect(r).toHaveLength(1)
    expect(r[0].balance).toBe('4')
  })

  it('carries the source health so the UI can warn before collateral moves out', () => {
    const r = deriveMarginSources({
      subAccounts: [sub('0', [pos(MARKET, 5)], 1.4)],
      tradeAccountId: '1',
      marketUid: MARKET,
    })
    expect(r[0].health).toBe(1.4)
  })

  it('returns nothing without a market — no asset means no source', () => {
    expect(
      deriveMarginSources({ subAccounts: [sub('0', [pos(MARKET, 5)])], marketUid: undefined })
    ).toEqual([])
  })
})
