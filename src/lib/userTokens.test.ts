import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  addUserToken,
  getUserTokensForChain,
  getUserTokenEntriesForChain,
  isUserToken,
  removeUserToken,
} from './userTokens'

const KEY = 'user-tokens'
const A = '0x00000000000000000000000000000000f0f0f001'
const B = '0x00000000000000000000000000000000f0f0f002'

const currency = (address: string) => ({
  chainId: '1',
  address,
  decimals: 8,
  symbol: 'FTT',
  name: 'Fork Test Token',
})

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  })
})

describe('userTokens', () => {
  it('stores metadata for an uncurated token so it survives a reload', () => {
    addUserToken('1', A, currency(A))

    const [entry] = getUserTokenEntriesForChain('1')
    // Without the persisted decimals, a reload leaves an address that cannot
    // size an amount — the token would be there but unusable.
    expect(entry.currency?.decimals).toBe(8)
    expect(entry.address).toBe(A)
  })

  it('stores a curated pick WITHOUT metadata, leaving the list authoritative', () => {
    addUserToken('1', A)
    expect(getUserTokenEntriesForChain('1')[0].currency).toBeUndefined()
  })

  it('upgrades an entry when metadata arrives later', () => {
    addUserToken('1', A)
    addUserToken('1', A, currency(A))

    const entries = getUserTokenEntriesForChain('1')
    expect(entries).toHaveLength(1)
    expect(entries[0].currency?.symbol).toBe('FTT')
  })

  it('migrates the v1 address-array format', () => {
    localStorage.setItem(KEY, JSON.stringify({ '1': [A, B], '8453': [A] }))

    expect(getUserTokensForChain('1')).toEqual([A, B])
    expect(getUserTokensForChain('8453')).toEqual([A])
    // v1 could only ever hold curated picks, so none of them gain metadata.
    expect(getUserTokenEntriesForChain('1')[0].currency).toBeUndefined()
  })

  it('normalizes casing on write and read', () => {
    addUserToken('1', A.toUpperCase().replace('0X', '0x'), currency(A))

    expect(getUserTokensForChain('1')).toEqual([A])
    expect(isUserToken('1', A.toUpperCase().replace('0X', '0x'))).toBe(true)
    expect(getUserTokenEntriesForChain('1')[0].currency?.address).toBe(A)
  })

  it('keeps chains apart and supports removal', () => {
    addUserToken('1', A)
    addUserToken('8453', B)

    expect(isUserToken('1', B)).toBe(false)
    removeUserToken('1', A)
    expect(getUserTokensForChain('1')).toEqual([])
    expect(getUserTokensForChain('8453')).toEqual([B])
  })

  it('survives unreadable storage rather than throwing', () => {
    localStorage.setItem(KEY, 'not json')
    expect(getUserTokensForChain('1')).toEqual([])
  })
})
