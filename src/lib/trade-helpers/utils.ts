import type { RawCurrency } from '../lib-utils'
import { getTokenFromCache } from '../data/tokenListsCache'
import { nativeAddressFor } from '../native'
import { zeroAddress } from 'viem'

/**
 * Resolve a token from the cached token list.
 * For the zero address (native token), returns a synthetic entry
 * using the cached data if available.
 */
export function getCurrency(chainId: string, address: string): RawCurrency | undefined {
  // The cache keys per chain (lower-case on EVM, verbatim base58 on Solana).
  const cached = getTokenFromCache(chainId, address)
  if (cached) return cached

  // A caller asking for "native" with the EVM zero address on a chain whose
  // native lives elsewhere (Solana's System Program id) gets that row.
  if (address.toLowerCase() === zeroAddress.toLowerCase()) {
    return getTokenFromCache(chainId, nativeAddressFor(chainId))
  }

  return undefined
}
