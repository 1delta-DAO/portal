import type { RawCurrency } from './types'

// Symbol-based fallback for chains where the asset metadata doesn't carry the
// `wnative` flag. Keep tight — only the canonical wrapped-native ERC20s for
// supported chains; we don't want to misclassify a token that happens to be
// W-prefixed (WBTC, WSOL, etc. are intentionally excluded since they're not
// the chain's native).
const WNATIVE_SYMBOLS = new Set([
  'WETH',
  'WBNB',
  'WMATIC',
  'WPOL',
  'WAVAX',
  'WFTM',
  'WCELO',
  'WGLMR',
  'WMOVR',
  'WCRO',
  'WONE',
  'WROSE',
  'WKAVA',
  'WMNT',
  'WMETIS',
  'WS',
  'WHYPE',
  'WXPL',
])

export function isWNative(c?: RawCurrency): boolean {
  if (!c) return false
  if (c.props?.wnative) return true
  const sym = c.symbol?.toUpperCase()
  return !!sym && WNATIVE_SYMBOLS.has(sym)
}

const ZERO = '0x0000000000000000000000000000000000000000'
const EEE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

/** The chain's native gas asset (zero / 0xEee sentinel, or the token-list `isNative` flag). */
export function isNativeCurrency(
  c?: { address?: string; props?: { [k: string]: any } } | null
): boolean {
  if (!c) return false
  if (c.props?.isNative) return true
  const a = c.address?.toLowerCase()
  return a === ZERO || a === EEE
}

/**
 * The symbol to RENDER for a currency. The native asset gets a "(native)"
 * suffix so it is never mistaken for its ERC-20 form — the two are different
 * things to pay with (msg.value vs approval + transferFrom) and on some chains
 * are not even the same scale: Arc's native USDC is 18-decimal wei while the
 * ERC-20 USDC at 0x3600… is 6-decimal. Never feed this back into a lookup;
 * the stored `symbol` stays untouched.
 */
export function displaySymbol(
  c?: { address?: string; symbol?: string; props?: { [k: string]: any } } | null,
  fallback = '—'
): string {
  const sym = c?.symbol ?? fallback
  return isNativeCurrency(c) ? `${sym} (native)` : sym
}
