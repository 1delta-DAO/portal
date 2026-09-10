/**
 * The market uid is `<LENDER_KEY>:<chainId>:<ref>`, and the ref is the
 * MARKET's own key for that row — not necessarily a token address. Compound V2
 * puts the cToken there, Init a poolId, Dolomite a marketId, and Morpho
 * Midnight keys its collateral LEGS as `<token>-c<index>`, because the
 * protocol stores collateral per leg index and one token can sit on both
 * sides of one market (a loan asset that is also a collateral leg).
 *
 * So a ref is never sliced as if it were an address without going through
 * here first. The UI never BUILDS a uid — every uid is API-provided — but a
 * few places render a short label off the ref, and those must not print
 * `…b48-c0` as if it were the tail of an address.
 */

/** Trailing `-c<digits>` — the Midnight collateral-leg marker. */
const COLLATERAL_LEG_MARK = /-c(\d+)$/

export interface MarketUidParts {
  lenderKey: string
  chainId: string
  /** The raw ref segment, verbatim. */
  ref: string
}

export function marketUidParts(uid: string): MarketUidParts {
  const [lenderKey = uid, chainId = '', ...rest] = uid.split(':')
  return { lenderKey, chainId, ref: rest.join(':') }
}

/**
 * The token the ref names, with a collateral-leg marker stripped. A token
 * address cannot contain `-`, so this cannot mangle an ordinary ref.
 */
export function refToken(ref: string): string {
  return ref.replace(COLLATERAL_LEG_MARK, '')
}

/** The leg index a collateral-leg ref carries, else `undefined`. */
export function refCollateralIndex(ref: string): number | undefined {
  const m = COLLATERAL_LEG_MARK.exec(ref)
  return m ? Number(m[1]) : undefined
}

/** True when the uid names a collateral LEG of a leg-keyed market. */
export function isCollateralLegUid(uid: string): boolean {
  return refCollateralIndex(marketUidParts(uid).ref) !== undefined
}

/**
 * Short human label for a uid: `AAVE_V3 · 0xc02a…cc2`, and for a leg-keyed
 * ref `MORPHO_MIDNIGHT_… · 0xa0b8…b48 · leg 0`. Falls back to the lender
 * key alone when the ref is empty.
 */
export function shortMarketLabel(uid: string): string {
  const { lenderKey, ref } = marketUidParts(uid)
  if (!ref) return lenderKey
  const token = refToken(ref)
  const leg = refCollateralIndex(ref)
  const short = token.length > 12 ? `${token.slice(0, 6)}…${token.slice(-4)}` : token
  return leg === undefined ? `${lenderKey} · ${short}` : `${lenderKey} · ${short} · leg ${leg}`
}
