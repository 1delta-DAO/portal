import { useMemo, useState, useEffect } from 'react'
import type { RawCurrency } from '../types/currency'
import {
  loadTokenListForChain,
  getChainTokensCache,
} from '../lib/data/tokenListsCache'

/**
 * Fetches the token list for a single chain on demand.
 * The list is cached globally — once fetched it never refetches.
 *
 * @param chainId - The chain to load tokens for (omit to skip).
 * @returns `{ data, isLoading }` where `data` is `Record<address, RawCurrency>`.
 */
export function useTokenLists(chainId?: string) {
  const cached = chainId ? getChainTokensCache(chainId) : undefined
  const [data, setData] = useState<Record<string, RawCurrency> | undefined>(cached)
  const [isLoading, setIsLoading] = useState(!cached && !!chainId)

  useEffect(() => {
    if (!chainId) {
      setData(undefined)
      setIsLoading(false)
      return
    }

    const existing = getChainTokensCache(chainId)
    if (existing) {
      setData(existing)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    loadTokenListForChain(chainId)
      .then((result) => {
        setData(result ?? undefined)
        setIsLoading(false)
      })
      .catch((e) => {
        console.error(`Failed to load token list for chain ${chainId}:`, e)
        setIsLoading(false)
      })
  }, [chainId])

  return useMemo(
    () => ({
      data: data ?? ({} as Record<string, RawCurrency>),
      isLoading,
    }),
    [data, isLoading]
  )
}
