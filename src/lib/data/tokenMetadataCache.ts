import type { RawCurrency } from '../lib-utils'
import { apiFetch } from '../../sdk/http'
import { getTokenFromCache, registerResolvedToken } from './tokenListsCache'

/**
 * Resolve a token address the curated list does not carry.
 *
 * Backed by `/v1/data/token/metadata`, which tries the curated list first and
 * then reads `name`/`symbol`/`decimals` off the contract. This is what lets a
 * user paste the address of a token that shipped an hour ago and trade it.
 *
 * **A resolved token has no price.** The endpoint returns `assetGroup: null`
 * for anything it read on-chain, because `symbol` and `name` there are
 * contract-controlled and joining them to a price key would let a token that
 * calls itself `USDC` render at $1. The UI must show these without a USD
 * value rather than inventing one.
 */

interface TokenMetadataItem {
  address: string
  symbol?: string
  name?: string
  decimals: number
  logoURI?: string
  assetGroup: string | null
  verified: boolean
  source: 'list' | 'onchain'
}

interface TokenMetadataResponse {
  chainId: string
  count: number
  items: TokenMetadataItem[]
  unresolved: string[]
}

/**
 * Per (chain, address) result, including NEGATIVE results.
 *
 * Caching the misses is the point: without it, every keystroke after a
 * not-a-token address re-issues the same RPC-backed lookup, and the answer
 * cannot change within a session.
 */
const resolved = new Map<string, RawCurrency | null>()
const inFlight = new Map<string, Promise<RawCurrency | null>>()

const key = (chainId: string, address: string) => `${chainId}:${address.toLowerCase()}`

export function isTokenAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim())
}

/** A cached answer, if there is one. `null` = known not to be a token. */
export function getResolvedToken(chainId: string, address: string): RawCurrency | null | undefined {
  return resolved.get(key(chainId, address))
}

/**
 * Resolve one address, hitting the network at most once per (chain, address).
 *
 * @returns the currency, or `null` when the address is not an ERC-20 on this
 *   chain. A network failure also yields `null` but is NOT cached, so a
 *   retry is possible once connectivity returns.
 */
export async function resolveToken(chainId: string, address: string): Promise<RawCurrency | null> {
  if (!isTokenAddress(address)) return null

  const lower = address.toLowerCase()
  const cacheKey = key(chainId, lower)

  const cached = resolved.get(cacheKey)
  if (cached !== undefined) return cached

  // The curated list may already have it — no request needed.
  const listed = getTokenFromCache(chainId, lower)
  if (listed) {
    resolved.set(cacheKey, listed)
    return listed
  }

  const existing = inFlight.get(cacheKey)
  if (existing) return existing

  const request = (async () => {
    try {
      const data = await apiFetch<TokenMetadataResponse>('/v1/data/token/metadata', {
        params: { chainId, assets: lower },
      })

      const item = data.items?.find((i) => i.address.toLowerCase() === lower)
      if (!item) {
        // Definitively not a token here — cache the miss.
        resolved.set(cacheKey, null)
        return null
      }

      const currency: RawCurrency = {
        chainId,
        address: lower,
        decimals: item.decimals,
        symbol: item.symbol,
        name: item.name,
        logoURI: item.logoURI,
        // `assetGroup` is omitted for on-chain results, so the token carries
        // no price key. See the note at the top of this file.
        ...(item.assetGroup ? { assetGroup: item.assetGroup } : {}),
        props: { unlisted: !item.verified },
      }

      // Registering makes it visible to `getCurrency`, and so to the balance
      // and price queries, without those needing to know it came from here.
      const stored = registerResolvedToken(chainId, currency)
      resolved.set(cacheKey, stored)
      return stored
    } catch {
      // Deliberately NOT cached: a transport failure is not an answer about
      // the token, and caching it would make the address permanently dead for
      // the session.
      return null
    } finally {
      inFlight.delete(cacheKey)
    }
  })()

  inFlight.set(cacheKey, request)
  return request
}

/** Seed the cache from persisted user tokens, so a reload needs no network. */
export function primeResolvedToken(chainId: string, currency: RawCurrency) {
  const stored = registerResolvedToken(chainId, currency)
  resolved.set(key(chainId, currency.address), stored)
}
