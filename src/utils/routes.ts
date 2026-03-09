import type { SubTab } from '../components/lending/LendingTab'

/** URL slug → internal tab key */
const SLUG_TO_TAB: Record<string, SubTab> = {
  earn: 'earn',
  lending: 'lending',
  loop: 'trading',
}

/** Internal tab key → URL slug */
const TAB_TO_SLUG: Record<SubTab, string> = {
  earn: 'earn',
  lending: 'lending',
  trading: 'loop',
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

export function buildPath(tab: SubTab, chainId?: string, lender?: string): string {
  const parts = ['', slugFromTab(tab)]
  if (chainId) {
    parts.push(chainId)
    if (lender) parts.push(lenderToSlug(lender))
  }
  return parts.join('/')
}
