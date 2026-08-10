import { describe, expect, it } from 'vitest'
import {
  normalizeSelectQuery,
  optionMatchesQuery,
  type SearchableSelectOption,
} from './SearchableSelect'

/**
 * The dropdown filter.
 *
 * It used to match `label` only, which made every identifier unsearchable.
 * That is invisible for lenders whose label IS their key (the `info?.name ?? l`
 * fallback), and total for per-market lenders like LlamaLend, whose label
 * ("LlamaLend crvUSD / wstETH") shares no characters with the key.
 */

const opt = (value: string, label: string): SearchableSelectOption => ({
  value,
  label,
})

// A real per-market lender key and its display name.
const KEY = 'LLAMALEND_5756A035F276A8095A922931F224F4ED06149608'
const wstEth = opt(KEY, 'LlamaLend crvUSD / wstETH')
const aave = opt('AAVE_V3', 'Aave V3')

const find = (options: SearchableSelectOption[], raw: string) => {
  const q = normalizeSelectQuery(raw)
  return options.filter((o) => optionMatchesQuery(o, q))
}

describe('dropdown filter', () => {
  const all = [wstEth, aave]

  it('finds a per-market lender by its KEY — the case that was broken', () => {
    expect(find(all, KEY)).toEqual([wstEth])
  })

  it('finds it by a fragment of the key', () => {
    // What a user actually pastes: the distinguishing middle of an address.
    expect(find(all, '5756A035F276A8095A922931F224F4')).toEqual([wstEth])
  })

  it('finds it by a pasted FULL marketUid, longer than the option value', () => {
    // The value is only the lender key, so a plain `value.includes(q)` fails
    // here — the match has to run both directions.
    expect(find(all, `${KEY}:1:0xf939e0a03fb07f59a73314e73794be0e57ac1b4e`)).toEqual([wstEth])
  })

  it('tolerates a stray separator from a copied list', () => {
    // `,5756A035…` is what a clipboard hand-off looks like; it must not read
    // as "no such market".
    expect(find(all, ',5756A035F276A8095A922931F224F4')).toEqual([wstEth])
    expect(find(all, ` ${KEY} ,`)).toEqual([wstEth])
  })

  it('still matches on the human label', () => {
    expect(find(all, 'wstETH')).toEqual([wstEth])
    expect(find(all, 'aave')).toEqual([aave])
  })

  it('is case-insensitive on both label and key', () => {
    expect(find(all, KEY.toLowerCase())).toEqual([wstEth])
    expect(find(all, KEY.toUpperCase())).toEqual([wstEth])
    // Label matching is a plain substring, so casing is the only variable.
    expect(find(all, 'LLAMALEND CRVUSD')).toEqual([wstEth])
    expect(find(all, 'llamalend crvUSD /')).toEqual([wstEth])
  })

  it('returns everything for an empty query', () => {
    expect(find(all, '')).toEqual(all)
    expect(find(all, '   ')).toEqual(all)
  })

  it('does not match an unrelated id', () => {
    expect(find(all, '0xdeadbeef')).toEqual([])
  })

  it('does not let a one-character value match everything', () => {
    // Guards the both-directions test: a short value must not swallow every
    // query that happens to contain that character.
    const short = opt('1', 'Ethereum')
    expect(find([short, wstEth], 'wstETH')).toEqual([wstEth])
  })
})
