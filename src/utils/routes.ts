import type { SubTab } from '../components/lending/LendingTab'

/** URL slug → internal tab key */
const SLUG_TO_TAB: Record<string, SubTab> = {
  earn: 'earn',
  lending: 'lending',
  loop: 'trading',
  swap: 'swap',
  optimize: 'optimize',
}

/** Internal tab key → URL slug */
const TAB_TO_SLUG: Record<SubTab, string> = {
  earn: 'earn',
  lending: 'lending',
  trading: 'loop',
  swap: 'swap',
  optimize: 'optimize',
}

export function tabFromSlug(slug: string | undefined): SubTab {
  if (!slug) return 'earn'
  return SLUG_TO_TAB[slug.toLowerCase()] ?? 'earn'
}

export function slugFromTab(tab: SubTab): string {
  return TAB_TO_SLUG[tab]
}

/** Convert internal lender key to URL-friendly slug: AAVE_V3 → aave-v3 */
export function lenderToSlug(lenderKey: string): string {
  return lenderKey.toLowerCase().replace(/_/g, '-')
}

/** Convert URL slug back to internal lender key: aave-v3 → AAVE_V3 */
export function slugToLender(slug: string): string {
  return slug.toUpperCase().replace(/-/g, '_')
}

export function buildPath(
  tab: SubTab,
  chainId?: string,
  lender?: string,
  query?: Record<string, string | number | undefined | null>
): string {
  const parts = ['', slugFromTab(tab)]
  if (chainId) {
    parts.push(chainId)
    if (lender) parts.push(lenderToSlug(lender))
  }
  let path = parts.join('/')
  if (query) {
    const search = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue
      search.set(k, String(v))
    }
    const qs = search.toString()
    if (qs) path += `?${qs}`
  }
  return path
}

/**
 * Query-param keys used to deep-link from the optimizer into Lending / Loop.
 * Centralised so producers and consumers can't drift.
 */
export const OPTIMIZER_DEEPLINK_KEYS = {
  collateral: 'col',
  debt: 'debt',
  action: 'action',
  config: 'config',
  amount: 'amt',
} as const

export type LendingDeepLinkAction = 'deposit' | 'withdraw' | 'borrow' | 'repay'
