import type { PoolDataItem } from './marketTypes'
import type { PoolTerm } from './poolTypes'

/**
 * Which side(s) of a market row are OFFERED — the one place the tables, the
 * action forms and the selectors ask "can you borrow this row?".
 *
 * It exists because of a row shape that is easy to misread: a market where one
 * token sits on BOTH sides. Morpho Midnight permits a loan asset to also be a
 * collateral leg, and the API then serves two rows for the same token under
 * one lender — `…:0xusdc-c0` ("Collateral USDC", `borrowingEnabled: false`,
 * `collateralActive: true`) and `…:0xusdc` ("Loan USDC", the reverse). Only
 * the second can be borrowed, and only the second can carry a borrow rate
 * card. Deciding "fixed-term borrow" from `terms.length > 0` alone rendered a
 * "Fixed from 4.82 %" borrow cell on the collateral leg — a rate that row
 * cannot offer, next to the real loan row's "Fixed from 4.86 %".
 *
 * The flags are per-market facts from the backend; nothing here derives a
 * side from the lender key, the ref shape or the presence of a rate card.
 */

type SideFlags = Pick<PoolDataItem, 'borrowingEnabled' | 'collateralActive'> &
  Partial<Pick<PoolDataItem, 'variableBorrowDisabled' | 'terms'>>

/** Borrowing is not offered on this row at all (a collateral-only leg). */
export function isCollateralOnly(pool: SideFlags): boolean {
  return pool.borrowingEnabled === false
}

/**
 * This row cannot be posted as collateral (a lend-only or borrow-only row —
 * Midnight's loan row, LlamaLend's crvUSD side, Inverse's DOLA).
 */
export function isNotCollateral(pool: SideFlags): boolean {
  return pool.collateralActive === false
}

/**
 * Borrowing is offered, but only at a fixed term from the rate card (Lista
 * broker, Morpho Midnight order book) — render the "Fixed from X %" cell and
 * the term picker instead of the (meaningless, 0) variable rate.
 *
 * Requires the borrow side to exist: a collateral-only leg with a leftover
 * rate card is NOT brokered, it is not borrowable.
 */
export function isBrokeredBorrow(pool: SideFlags): boolean {
  if (isCollateralOnly(pool)) return false
  return pool.variableBorrowDisabled === true || (pool.terms?.length ?? 0) > 0
}

/** The rate card, or an empty list when the row has no borrow side. */
export function borrowTerms(pool: SideFlags | null | undefined): PoolTerm[] {
  if (!pool || isCollateralOnly(pool)) return []
  return pool.terms ?? []
}

/** Cheapest term on the card, else `null`. */
export function bestTermApr(terms: PoolTerm[] | null | undefined): number | null {
  return terms?.length ? Math.min(...terms.map((t) => t.apr)) : null
}

/**
 * Does this row fit the slot it is being offered for? `'deposits'` is the
 * collateral slot of a loop / the deposit side; `'debt'` the borrow slot.
 */
export function fitsSide(pool: SideFlags, side: 'deposits' | 'debt'): boolean {
  return side === 'debt' ? !isCollateralOnly(pool) : !isNotCollateral(pool)
}
