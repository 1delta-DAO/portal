import { describe, expect, it } from 'vitest'
import { venueSubtitle } from './venueLabel'
import type { EarnMarket, EarnVocabulary } from '../../../../sdk/earn-helper'

/**
 * Cases taken from the live chain-1 listing, because the bug ("Tulipa Capital ·
 * Tulipa Capital · Vaults") was only visible against real rows: `brand` equals
 * `curator.name` on every curated row the API returns, and equals
 * `protocol.name` on most uncurated ones, so a hand-made fixture with three
 * distinct strings would have passed the broken code.
 */

const vocab = {
  labels: { venueKind: { vault: 'Vaults', lending: 'Lending markets' } },
} as unknown as EarnVocabulary

const row = (over: Partial<EarnMarket>): EarnMarket =>
  ({
    earnUid: 'x',
    chainId: '1',
    venue: 'v',
    venueKind: 'vault',
    ref: 'r',
    asset: { address: '0x0', symbol: 'USDC', decimals: 6 },
    rate: { total: 1 },
    tvl: {},
    exit: { mode: 'instant' },
    availability: {},
    capabilities: [],
    ...over,
  }) as EarnMarket

describe('venueSubtitle', () => {
  it('names the stack, not the curator twice, on a curated vault', () => {
    // The report: `brand` IS the curator here, so `curator · brand` stuttered.
    expect(
      venueSubtitle(
        row({
          curator: { name: 'Tulipa Capital' },
          protocol: { key: 'vault.lagoon', name: 'Lagoon' },
          brand: 'Tulipa Capital',
        }),
        vocab
      )
    ).toBe('Tulipa Capital · Lagoon · Vaults')
  })

  it('keeps the generation on an uncurated lending market', () => {
    // `AAVE_V3` arrives as protocol "Aave", brand "Aave V3". Preferring the
    // protocol here would make an Aave V2 row read exactly like an Aave V3 one.
    expect(
      venueSubtitle(
        row({
          venueKind: 'lending',
          protocol: { key: 'AAVE_V3', name: 'Aave' },
          brand: 'Aave V3',
        }),
        vocab
      )
    ).toBe('Aave V3 · Lending markets')
  })

  it('collapses an uncurated row whose brand and protocol agree', () => {
    expect(
      venueSubtitle(
        row({ protocol: { key: 'vault.savings', name: 'Strata' }, brand: 'Strata' }),
        vocab
      )
    ).toBe('Strata · Vaults')
  })

  it('collapses case-only repeats', () => {
    expect(
      venueSubtitle(
        row({ protocol: { key: 'vault.pendle', name: 'Pendle' }, brand: 'pendle' }),
        vocab
      )
    ).toBe('pendle · Vaults')
  })

  it('appends the asset only where the caller asks for it', () => {
    const r = row({
      curator: { name: '9Summits' },
      protocol: { key: 'vault.lagoon', name: 'Lagoon' },
      brand: '9Summits',
    })
    expect(venueSubtitle(r, vocab)).toBe('9Summits · Lagoon · Vaults')
    expect(venueSubtitle(r, vocab, { withAsset: true })).toBe('9Summits · Lagoon · Vaults · USDC')
  })

  it('degrades to one segment rather than a stutter when curator equals protocol', () => {
    expect(
      venueSubtitle(
        row({
          curator: { name: 'Tulipa' },
          protocol: { key: 'p', name: 'Tulipa' },
          brand: 'Tulipa',
        }),
        vocab
      )
    ).toBe('Tulipa · Vaults')
  })

  it('survives a row with no curator, brand or protocol', () => {
    expect(venueSubtitle(row({ brand: undefined }), vocab)).toBe('Vaults')
  })
})
