import { useEffect, useState } from 'react'
import type { RawCurrency } from '../types/currency'
import { getResolvedToken, isTokenAddress, resolveToken } from '../lib/data/tokenMetadataCache'

/**
 * Resolve a pasted token address that the curated list does not carry.
 *
 * The token selector searches a fixed in-memory map, so an address nothing has
 * curated scored no match and produced an empty list — indistinguishable, to
 * the user, from "this token does not exist". This hook fills that gap: when
 * the query IS an address and the list has no entry for it, ask the backend.
 *
 * @param chainId - the chain to resolve on; the same address is a different
 *   token on a different chain, so the result is never shared between them.
 * @param query - the raw search box contents. Anything that is not an address
 *   short-circuits without a request.
 * @param isListed - whether the curated list already covers the query. Passed
 *   in rather than re-derived so there is one definition of "listed".
 */
export function useResolvedToken(
  chainId: string,
  query: string,
  isListed: boolean
): { token: RawCurrency | null; isLoading: boolean } {
  const trimmed = query.trim().toLowerCase()
  const shouldResolve = isTokenAddress(trimmed) && !isListed

  // Seeding from the cache means an address the user has already looked up
  // renders on the first frame instead of flashing "not found".
  const cached = shouldResolve ? getResolvedToken(chainId, trimmed) : undefined

  const [token, setToken] = useState<RawCurrency | null>(cached ?? null)
  const [isLoading, setIsLoading] = useState(shouldResolve && cached === undefined)

  useEffect(() => {
    if (!shouldResolve) {
      setToken(null)
      setIsLoading(false)
      return
    }

    const known = getResolvedToken(chainId, trimmed)
    if (known !== undefined) {
      setToken(known)
      setIsLoading(false)
      return
    }

    setToken(null)
    setIsLoading(true)

    let cancelled = false
    resolveToken(chainId, trimmed)
      .then((result) => {
        // The user keeps typing while this is in flight; a late answer for a
        // query they have moved on from must not appear under the new one.
        if (cancelled) return
        setToken(result)
        setIsLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setToken(null)
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [chainId, trimmed, shouldResolve])

  return { token, isLoading }
}
