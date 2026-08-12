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

    // Nothing cached for the new chain: drop the previous chain's map rather
    // than keeping it on screen under the new chainId, where every row would
    // resolve to the wrong token.
    setData(undefined)
    setIsLoading(true)

    let cancelled = false
    loadTokenListForChain(chainId)
      .then((result) => {
        // Chain switches are faster than the fetch; without this a slow earlier
        // chain lands last and overwrites the one the user is looking at.
        if (cancelled) return
        setData(result ?? undefined)
        setIsLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        console.error(`Failed to load token list for chain ${chainId}:`, e)
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [chainId])

  return useMemo(
    () => ({
      data: data ?? ({} as Record<string, RawCurrency>),
      isLoading,
    }),
    [data, isLoading]
  )
}

/**
 * Fetches token lists for several chains at once, keyed by chain.
 *
 * The underlying cache is per chain and dedupes concurrent loads, so this is a
 * thin fan-out: chains already in memory resolve synchronously and only the
 * newly selected ones hit the network.
 *
 * @returns `{ data, isLoading }` where `data` is `Record<chainId, Record<address, RawCurrency>>`.
 */
export function useTokenListsMultiChain(chainIds: string[]) {
  // Sorted + joined so the effect only re-runs when the *set* changes, not
  // when the caller happens to rebuild the array.
  const key = useMemo(() => [...chainIds].sort().join(','), [chainIds])

  const [data, setData] = useState<Record<string, Record<string, RawCurrency>>>(() => {
    const seeded: Record<string, Record<string, RawCurrency>> = {}
    for (const chainId of chainIds) {
      const cached = getChainTokensCache(chainId)
      if (cached) seeded[chainId] = cached
    }
    return seeded
  })
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const ids = key ? key.split(',') : []
    if (ids.length === 0) {
      setData({})
      setIsLoading(false)
      return
    }

    // Seed synchronously from cache so already-loaded chains render on the
    // first paint rather than flashing empty.
    const seeded: Record<string, Record<string, RawCurrency>> = {}
    const pending: string[] = []
    for (const chainId of ids) {
      const cached = getChainTokensCache(chainId)
      if (cached) seeded[chainId] = cached
      else pending.push(chainId)
    }
    setData(seeded)

    if (pending.length === 0) {
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)
    Promise.all(
      pending.map(async (chainId) => {
        try {
          return [chainId, await loadTokenListForChain(chainId)] as const
        } catch (e) {
          console.error(`Failed to load token list for chain ${chainId}:`, e)
          return [chainId, null] as const
        }
      })
    ).then((entries) => {
      if (cancelled) return
      setData((prev) => {
        const next = { ...prev }
        for (const [chainId, list] of entries) if (list) next[chainId] = list
        return next
      })
      setIsLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [key])

  return useMemo(() => ({ data, isLoading }), [data, isLoading])
}
