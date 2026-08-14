import { describe, expect, it } from 'vitest'
import {
  openLoanBandCount,
  hasParameterizedMode,
  type UserPositionEntry,
  type UserSubAccount,
} from './userPositionTypes'

/**
 * The band count of an open LlamaLend loan must LOCK the setter at the
 * position's own value — and only then. The two failure modes these pin:
 * an open loan rendering an editable market-default (the live bug: a borrower
 * at N=4 stared at an editable "10"), and a REPAID loan's stale `N` locking
 * the next open, where the borrower is free to choose again.
 */

const entry = (over: Partial<UserPositionEntry>): UserPositionEntry =>
  ({
    marketUid: 'LLAMALEND_X:1:0xcrvusd',
    deposits: '0',
    debtStable: '0',
    debt: '0',
    depositsUSD: 0,
    debtStableUSD: 0,
    debtUSD: 0,
    collateralEnabled: false,
    claimableRewards: 0,
    withdrawable: '0',
    borrowable: '0',
    ...over,
  }) as UserPositionEntry

describe('openLoanBandCount', () => {
  it('returns the position N for an open loan', () => {
    const p = entry({ debt: '1979.31', llamalendInfo: { bandCount: 4 } })
    expect(openLoanBandCount(p)).toBe(4)
  })

  it('ignores a repaid loan — its stale N must not lock the next open', () => {
    const p = entry({ debt: '0', llamalendInfo: { bandCount: 4 } })
    expect(openLoanBandCount(p)).toBeUndefined()
  })

  it('ignores debt rows without band info (non-LlamaLend markets)', () => {
    expect(openLoanBandCount(entry({ debt: '500' }))).toBeUndefined()
  })

  it('rejects a zero band count — "no loan" as reported by user_state', () => {
    const p = entry({ debt: '1', llamalendInfo: { bandCount: 0 } })
    expect(openLoanBandCount(p)).toBeUndefined()
  })

  it('tolerates null', () => {
    expect(openLoanBandCount(null)).toBeUndefined()
    expect(openLoanBandCount(undefined)).toBeUndefined()
  })
})

describe('hasParameterizedMode', () => {
  const sub = (positions: UserPositionEntry[]): UserSubAccount =>
    ({
      health: null,
      borrowCapacityUSD: 0,
      accountId: '0',
      balanceData: {} as never,
      aprData: {} as never,
      userConfig: { selectedMode: 4, id: '0', isWhitelisted: true },
      positions,
    }) as unknown as UserSubAccount

  it('true when any row is LlamaLend-shaped — the mode slot is a band count', () => {
    expect(hasParameterizedMode(sub([entry({ llamalendInfo: { bandCount: 4 } })]))).toBe(true)
  })

  it('false on ordinary lenders — the mode slot stays an e-mode id', () => {
    expect(hasParameterizedMode(sub([entry({})]))).toBe(false)
    expect(hasParameterizedMode(null)).toBe(false)
  })
})
