import { describe, expect, it } from 'vitest'
import { nativeAddressFor, tokenKey, SOLANA_NATIVE } from './native'

describe('native + token keys per chain', () => {
  it('native is the zero address on EVM, the System Program id on Solana', () => {
    expect(nativeAddressFor('1')).toBe('0x0000000000000000000000000000000000000000')
    expect(nativeAddressFor('solana')).toBe(SOLANA_NATIVE)
  })

  it('lower-cases EVM keys and keeps base58 verbatim', () => {
    expect(tokenKey('1', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')).toBe(
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
    )
    expect(tokenKey('solana', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe(
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    )
  })
})
