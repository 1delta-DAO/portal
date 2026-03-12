import type { RawCurrency } from '@1delta/lib-utils'
import { getTokenFromCache } from '../data/tokenListsCache'
import { zeroAddress } from 'viem'

/**
 * Resolve a token from the cached token list.
 * For the zero address (native token), returns a synthetic entry
 * using the cached data if available.
 */
export function getCurrency(chainId: string, address: string): RawCurrency | undefined {
  const lower = address.toLowerCase()

  // Check cache directly
  const cached = getTokenFromCache(chainId, lower)
  if (cached) return cached

  // For native token (zero address), try to build a synthetic entry
  if (lower === zeroAddress.toLowerCase()) {
    // Many lists include the zero address already; if not, return undefined
    return getTokenFromCache(chainId, zeroAddress)
  }

  return undefined
}
