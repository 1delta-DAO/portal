import type { EarnAvailability, EarnCapability, EarnExit, EarnRate, EarnVenueKind } from './types'

/**
 * `GET /v1/data/earn/positions` — the user half of the unified earn surface.
 *
 * Mirrors `margin-fetcher/src/earn/positions.ts`. Same discipline as
 * `./types`: no venue list, no provider matrix, no `'lending' | 'vaults'`
 * switch. The server decides what a row is; this app renders it.
 *
 * **The two halves are deliberately different granularities**, and a table
 * built on this must not flatten them:
 *
 * ```
 * vault    →  ONE ROW PER VAULT.  A share balance is a standalone position.
 * lending  →  ONE ROW PER (chain, lender), whatever it touches. A cross-margin
 *             account is ONE solvency calculation; its markets are `legs`.
 * ```
 */

/**
 * Row identity. **NOT an `earnUid`** — never pass it to an action route.
 *
 * Vault rows: equal to `earnUid`. Lending rows: `<LENDER>:<chainId>`, two
 * segments, which the server's uid parser rejects on purpose. To act on a
 * lending position, take the `earnUid` off the individual leg.
 */
export type EarnPositionUid = string

export interface EarnPositionAsset {
  address: string
  symbol?: string
  decimals?: number
  /** `0` ⇒ unpriced, which is NOT the same as worthless. */
  priceUsd?: number
  /** Token icon off the lender metadata, where one resolved. */
  logoURI?: string
}

export interface EarnPositionBase {
  positionUid: EarnPositionUid
  chainId: string
  venue: string
  venueKind: EarnVenueKind
  brand?: string
  name?: string
  logoURI?: string
  suppliedUsd: number
  /** Always `0` on the vault half. */
  borrowedUsd: number
  /** `suppliedUsd - borrowedUsd`. */
  netUsd: number
  /**
   * Net APR on the position AS HELD, PERCENT — not the market's headline rate.
   * A 2x loop on a 4 % market reads ~8 % here and 4 % on the catalogue row.
   * Absent ⇒ not computable, which is not zero.
   */
  apr?: number
}

/** One market inside a lending position. */
export interface EarnPositionLeg {
  /** Catalogue join key. Absent ⇒ no addressable market row for this leg. */
  earnUid?: string
  marketUid: string
  /** Present ⇒ bound to one loan (fixed-term lenders). */
  loanId?: string
  asset: EarnPositionAsset
  /**
   * **`'none'` is the common case.** Lenders report every market the account is
   * CONFIGURED in, not just the ones it holds something in — an Aave V4 account
   * with one USDC debt reports ten legs, nine empty. Never render a `'none'`
   * leg as a holding.
   */
  side: 'supply' | 'borrow' | 'both' | 'none'
  deposits: string
  depositsUsd: number
  debt: string
  debtUsd: number
  collateralEnabled: boolean
  withdrawable?: string
}

export interface EarnPositionSubAccount {
  accountId: string
  health: number | null
  suppliedUsd: number
  borrowedUsd: number
  netUsd: number
  legs: EarnPositionLeg[]
}

/**
 * The three legs of a position's yield, each over NAV and in PERCENT, so they
 * add. `market + rewards + intrinsic === apr`.
 *
 * They are separate upstream and none contains another — which is why a levered
 * carry trade read as its market leg alone reports a large LOSS: the market leg
 * is the cost side, and the collateral's own yield (the reason for the trade)
 * is the `intrinsic` one.
 */
export interface EarnAprBreakdown {
  /** Deposit interest less borrow interest, over NAV. */
  market: number
  /** Incentive emissions, over NAV. Can stop. */
  rewards: number
  /** What the ASSETS yield themselves, net of the borrowed asset's, over NAV. */
  intrinsic: number
}

export interface EarnLendingPosition extends EarnPositionBase {
  venueKind: 'lending'
  lender: string
  account: string
  /**
   * Only meaningful when `crossMargin` — otherwise `null`, with each
   * sub-account carrying its own. `null` also means "no debt, so no health".
   */
  health: number | null
  leverage: number
  /** What `apr` is made of; the three legs sum to it. */
  aprBreakdown: EarnAprBreakdown
  /** MARKET deposit interest only — see `aprBreakdown` for the other legs. */
  depositApr: number
  /** MARKET borrow interest only, as a positive cost. */
  borrowApr: number
  /** FALSE ⇒ read `subAccounts`, and do NOT present `health` as the account's. */
  crossMargin: boolean
  legs: EarnPositionLeg[]
  subAccounts: EarnPositionSubAccount[]
  /** Reads did not complete — totals are a LOWER BOUND, not fact. */
  incomplete?: boolean
  /** Served from a snapshot `staleAgeMs` ago. Consistent, but not current. */
  stale?: boolean
  staleAgeMs?: number
}

export interface EarnVaultPosition extends EarnPositionBase {
  venueKind: 'vault'
  /** Always present and always actionable, unlike a lending row. */
  earnUid: string
  provider: string
  vault: string
  asset: EarnPositionAsset
  sharesRaw: string
  shares: string
  assetsRaw: string
  assets: string
  shareDecimals: number
  yieldProfile?: string
  denomination?: string
  // Enrichment from the catalogue row. Absent ⇒ unknown, never a default —
  // a missing exit must not render as "instant, free".
  rate?: EarnRate
  exit?: EarnExit
  availability?: EarnAvailability
  capabilities?: EarnCapability[]
}

export type EarnPosition = EarnLendingPosition | EarnVaultPosition

export function isVaultPosition(p: EarnPosition): p is EarnVaultPosition {
  return p.venueKind === 'vault'
}

export function isLendingPosition(p: EarnPosition): p is EarnLendingPosition {
  return p.venueKind === 'lending'
}

export interface EarnPositionSourceStatus {
  source: 'lending' | 'vaults'
  status: 'ok' | 'degraded' | 'failed'
  rows: number
  error?: string
}

export interface EarnPositionTotals {
  suppliedUsd: number
  borrowedUsd: number
  netUsd: number
  lendingUsd: number
  vaultUsd: number
}

export interface EarnPositionsResponse {
  ok: boolean
  account: string
  chainIds: string[]
  count: number
  rateUnit: 'percent'
  items: EarnPosition[]
  totals: EarnPositionTotals
  sources: EarnPositionSourceStatus[]
  partial?: boolean
  stale?: boolean
}

export const EMPTY_POSITION_TOTALS: EarnPositionTotals = {
  suppliedUsd: 0,
  borrowedUsd: 0,
  netUsd: 0,
  lendingUsd: 0,
  vaultUsd: 0,
}
