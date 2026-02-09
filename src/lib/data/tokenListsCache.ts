import { RawCurrency } from '@1delta/lib-utils'

export type TokenListsRecord = Record<string, Record<string, RawCurrency>>
export interface DeltaTokenList {
  chainId: string
  version: string
  list: Record<string, RawCurrency>
  mainTokens: string[]
}

/** Per-chain caches */
const cachedTokenLists: TokenListsRecord = {}
const cachedMainTokens: Record<string, Set<string>> = {}
const chainPromises = new Map<string, Promise<Record<string, RawCurrency> | null>>()

type ReadyListener = () => void
const listeners = new Set<ReadyListener>()

const getListUrl = (chainId: string) =>
  `https://raw.githubusercontent.com/1delta-DAO/token-lists/main/${chainId}.json`

async function fetchList(chainId: string): Promise<DeltaTokenList | null> {
  try {
    const url = getListUrl(chainId)
    const response = await fetch(url)
    if (!response.ok) {
      console.warn(
        `Failed to fetch asset list for chain ${chainId}: ${response.status} ${response.statusText}`
      )
      return null
    }
    const data = (await response.json()) as DeltaTokenList
    return data
  } catch (error) {
    console.warn(`Error fetching asset list for chain ${chainId}:`, error)
    return null
  }
}

function notifyReady() {
  listeners.forEach((listener) => listener())
}

/**
 * Load the token list for a single chain on demand.
 * Returns the normalized token map, or null if the fetch failed.
 * Results are cached — subsequent calls for the same chainId resolve immediately.
 */
export function loadTokenListForChain(
  chainId: string
): Promise<Record<string, RawCurrency> | null> {
  if (cachedTokenLists[chainId]) return Promise.resolve(cachedTokenLists[chainId])

  const existing = chainPromises.get(chainId)
  if (existing) return existing

  const promise = fetchList(chainId).then((list) => {
    if (!list || !list.list) return null

    const normalized: Record<string, RawCurrency> = {}
    for (const [address, token] of Object.entries(list.list)) {
      normalized[address.toLowerCase()] = token
    }
    cachedTokenLists[chainId] = normalized

    const mainTokensSet = new Set<string>()
    if (list.mainTokens && Array.isArray(list.mainTokens)) {
      for (const address of list.mainTokens) {
        mainTokensSet.add(address.toLowerCase())
      }
    }
    cachedMainTokens[chainId] = mainTokensSet

    notifyReady()
    return normalized
  })

  chainPromises.set(chainId, promise)
  return promise
}

export function getTokenListsCache(): TokenListsRecord {
  return cachedTokenLists
}

export function getChainTokensCache(chainId: string): Record<string, RawCurrency> | undefined {
  return cachedTokenLists[chainId]
}

export function getTokenFromCache(chainId: string, address: string): RawCurrency | undefined {
  return cachedTokenLists[chainId]?.[address.toLowerCase()]
}

export function isTokenListsReady(): boolean {
  return Object.keys(cachedTokenLists).length > 0
}

export function subscribeTokenListsReady(listener: ReadyListener): () => void {
  listeners.add(listener)
  if (Object.keys(cachedTokenLists).length > 0) {
    listener()
  }
  return () => {
    listeners.delete(listener)
  }
}

export function getMainTokensCache(): Record<string, Set<string>> {
  return cachedMainTokens
}

export function isMainToken(chainId: string, address: string): boolean {
  return cachedMainTokens[chainId]?.has(address.toLowerCase()) ?? false
}
