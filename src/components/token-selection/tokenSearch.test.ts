import { describe, expect, it } from 'vitest'
import { NO_MATCH, compareTokenMatches, normalizeTokenQuery, scoreTokenMatch } from './tokenSearch'

/**
 * The token search ranking.
 *
 * The case that drove this: on a chain with Pendle PTs, searching "usde" used
 * to return PT-USDe-<expiry> above USDe itself, because the filter was a plain
 * substring test and the order came from the raw token list.
 */

type T = { address: string; symbol: string; name: string; isMainOrUser?: boolean }

const USDC: T = {
  address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
  symbol: 'USDC',
  name: 'USD Coin',
  isMainOrUser: true,
}
const USDCe: T = {
  address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
  symbol: 'USDC.e',
  name: 'Bridged USDC',
}
const USDe: T = {
  address: '0x4c9edd5852cd905f086c759e8383e09bff1e68b3',
  symbol: 'USDe',
  name: 'Ethena USDe',
  isMainOrUser: true,
}
const PT_USDe: T = {
  address: '0x917459337caac939d41d7493b3999f571d20d667',
  symbol: 'PT-USDe-26JUN2025',
  name: 'PT Ethena USDe 26JUN2025',
}
const sUSDe: T = {
  address: '0x9d39a5de30e57443bff2a8307a4256c8797a3497',
  symbol: 'sUSDe',
  name: 'Staked USDe',
}

const rank = (tokens: T[], raw: string) => {
  const q = normalizeTokenQuery(raw)
  return tokens
    .map((t) => ({ ...t, score: scoreTokenMatch(q, t, t.address), isMainOrUser: !!t.isMainOrUser }))
    .filter((t) => t.score !== NO_MATCH)
    .sort(compareTokenMatches)
    .map((t) => t.symbol)
}

describe('token search ranking', () => {
  const all = [PT_USDe, sUSDe, USDe, USDCe, USDC]

  it('puts the exact symbol first, derivatives after — the case that was broken', () => {
    // Deliberately listed with PT-USDe first, so list order cannot be what
    // produces the right answer.
    expect(rank(all, 'usde')[0]).toBe('USDe')
    expect(rank(all, 'usde')).toEqual(['USDe', 'sUSDe', 'PT-USDe-26JUN2025'])
  })

  it('ignores case on both sides', () => {
    expect(rank(all, 'USDE')[0]).toBe('USDe')
    expect(rank(all, '  UsDe ')[0]).toBe('USDe')
  })

  it('ranks a prefix match above a mid-symbol match', () => {
    // "USDC" is exact; "USDC.e" only starts with it; nothing else may cut in.
    expect(rank(all, 'usdc')).toEqual(['USDC', 'USDC.e'])
  })

  it('finds a token by name and by a word inside the name', () => {
    expect(rank(all, 'usd coin')).toEqual(['USDC'])
    expect(rank(all, 'staked')).toEqual(['sUSDe'])
    expect(rank(all, 'ethena')).toEqual(['USDe', 'PT-USDe-26JUN2025'])
  })

  it('finds a token by a pasted address, in any casing', () => {
    expect(rank(all, USDe.address)).toEqual(['USDe'])
    expect(rank(all, USDe.address.toUpperCase())).toEqual(['USDe'])
  })

  it('finds a token by an address fragment', () => {
    expect(rank(all, '9d39a5de30e57443')).toEqual(['sUSDe'])
  })

  it('matches nothing for an unrelated query', () => {
    expect(rank(all, 'zzzznotatoken')).toEqual([])
  })

  it('returns every token for an empty query', () => {
    expect(rank(all, '').length).toBe(all.length)
    expect(rank(all, '   ').length).toBe(all.length)
  })

  it('prefers the curated token when two share a symbol', () => {
    // A long-tail impostor with the exact same symbol ties on tier; being on
    // the chain's main list is what breaks it.
    const fake: T = { address: '0xdead', symbol: 'USDC', name: 'Totally Real USD Coin' }
    const ranked = rank([fake, USDC], 'usdc')
    expect(ranked).toEqual(['USDC', 'USDC'])
    const q = normalizeTokenQuery('usdc')
    const scored = [fake, USDC]
      .map((t) => ({
        ...t,
        score: scoreTokenMatch(q, t, t.address),
        isMainOrUser: !!t.isMainOrUser,
      }))
      .sort(compareTokenMatches)
    expect(scored[0].address).toBe(USDC.address)
  })

  it('does not treat a mid-word hit as a word start', () => {
    // "usde" appears inside "Ethena USDe" at a word start, but "thena" does not.
    const q = normalizeTokenQuery('thena')
    expect(scoreTokenMatch(q, USDe, USDe.address)).toBe(7) // name contains, not word start
  })
})
