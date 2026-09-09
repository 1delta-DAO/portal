import type { RawCurrency } from './lib-utils'

/**
 * Tokens the user has brought in themselves, per chain.
 *
 * Two kinds live here and they behave identically from this module's point of
 * view:
 *
 *  - a curated token the user picked (pinning it to the top of the selector),
 *    stored as metadata-less; the curated list is the source of truth for it
 *  - a token the user pasted the address of, which NO list carries — for those
 *    this store IS the only record of what the token is, so the metadata is
 *    persisted with it. Without that, a reload would leave an address with no
 *    decimals, which cannot size an amount.
 */

const STORAGE_KEY = 'user-tokens'

export interface UserTokenEntry {
  address: string
  /**
   * Present only for tokens resolved on-chain. A curated pick carries none —
   * the list already describes it, and duplicating it here is how the two
   * copies drift.
   */
  currency?: RawCurrency
}

type UserTokensStore = Record<string, UserTokenEntry[]>

interface PersistedShape {
  version: 2
  chains: UserTokensStore
}

function load(): UserTokensStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)

    if (parsed && parsed.version === 2 && parsed.chains) {
      return parsed.chains as UserTokensStore
    }

    // v1 migration: `Record<chainId, address[]>`. Every stored address was
    // necessarily a curated one back then (there was no other way to add one),
    // so none of them need metadata.
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const migrated: UserTokensStore = {}
      for (const [chainId, value] of Object.entries(parsed)) {
        if (!Array.isArray(value)) continue
        migrated[chainId] = value
          .filter((a): a is string => typeof a === 'string')
          .map((address) => ({ address: address.toLowerCase() }))
      }
      return migrated
    }

    return {}
  } catch {
    return {}
  }
}

function save(store: UserTokensStore) {
  try {
    const payload: PersistedShape = { version: 2, chains: store }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // A full or disabled localStorage must not break token selection — the
    // token still works this session, it just will not survive a reload.
  }
}

/** Addresses only — what the "is this pinned?" checks want. */
export function getUserTokensForChain(chainId: string): string[] {
  return (load()[chainId] ?? []).map((e) => e.address)
}

/** Full entries, including the persisted metadata for on-chain-resolved tokens. */
export function getUserTokenEntriesForChain(chainId: string): UserTokenEntry[] {
  return load()[chainId] ?? []
}

/**
 * Record a token against a chain.
 *
 * @param currency - pass this ONLY for a token no list carries. It is what
 *   makes the token usable after a reload; for a curated token, omit it and
 *   let the list stay authoritative.
 */
export function addUserToken(chainId: string, address: string, currency?: RawCurrency) {
  const store = load()
  const list = store[chainId] ?? []
  const lower = address.toLowerCase()

  const existing = list.find((e) => e.address === lower)
  if (existing) {
    // Late-arriving metadata upgrades an entry that was stored without it.
    if (currency && !existing.currency) {
      existing.currency = { ...currency, address: lower }
      store[chainId] = list
      save(store)
    }
    return
  }

  list.push({
    address: lower,
    ...(currency ? { currency: { ...currency, address: lower } } : {}),
  })
  store[chainId] = list
  save(store)
}

export function removeUserToken(chainId: string, address: string) {
  const store = load()
  const list = store[chainId]
  if (!list) return
  const lower = address.toLowerCase()
  store[chainId] = list.filter((e) => e.address !== lower)
  save(store)
}

export function isUserToken(chainId: string, address: string): boolean {
  const lower = address.toLowerCase()
  return (load()[chainId] ?? []).some((e) => e.address === lower)
}
