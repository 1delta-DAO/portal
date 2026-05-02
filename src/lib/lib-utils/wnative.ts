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
