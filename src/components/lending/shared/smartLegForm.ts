import { formatUnits, parseUnits } from 'viem'
import { balancedCounterAmount, sharesForLegAmount } from '../../../sdk/lending-helper/fluidSmart'
import type { FluidSideInfo } from '../../../sdk/lending-helper/fluidSmart'

/**
 * The decision logic behind the two smart-vault forms, as pure functions.
 *
 * Extracted so it can be TESTED. This repo's suite is pure-logic — there is no
 * DOM environment and no testing-library — so logic left inside a component is
 * logic nothing checks, and every rule here is one that produces a wrong
 * TRANSACTION rather than a wrong pixel: which mode a form opens in, what the
 * second amount is pre-filled to, and what actually goes on the wire.
 */

export type LegMode = 'balanced' | 'single'

/**
 * Which mode the second-leg form should open in.
 *
 * Balanced is materially cheaper at size (no imbalance fee, no price impact),
 * so it is the default wherever it is possible — but two things make it
 * impossible, and they are different:
 *
 *   - **No ratio.** An empty pool reports `perShare: ['0','0']` (18 live sides
 *     do). There is nothing to balance against and the field would never fill.
 *   - **The user cannot pay the second leg.** Only applies when this side is
 *     PAID INTO — a deposit or a repay. A borrow or a withdraw RECEIVES both
 *     tokens, so a wallet balance is irrelevant there and defaulting to
 *     single-sided because of one would make the user pay the imbalance fee for
 *     no reason.
 */
export function defaultLegMode(args: {
  hasRatio: boolean
  /** Human balance of the second leg, when known. */
  secondaryBalance?: string
  /** True when this side is funded FROM the wallet (deposit / repay). */
  requiresBalance: boolean
}): LegMode {
  if (!args.hasRatio) return 'single'
  if (!args.requiresBalance) return 'balanced'
  return (parseFloat(args.secondaryBalance ?? '0') || 0) > 0 ? 'balanced' : 'single'
}

/** Is there a pool ratio to balance against at all? */
export function sideHasRatio(side: FluidSideInfo, legIndex: number): boolean {
  return balancedCounterAmount(side, legIndex, 10n ** 18n) !== null
}

/**
 * The second leg's amount at the pool's CURRENT ratio, as a human string.
 *
 * A starting point the user can overwrite, never a constraint — the split
 * drifts with every trade. Null when there is no amount yet, the input is
 * garbage, or the ratio is unreadable; the caller then leaves the field empty
 * rather than showing a zero that looks like an answer.
 */
export function suggestedCounterAmount(
  side: FluidSideInfo,
  legIndex: number,
  primaryAmount: string
): string | null {
  const n = parseFloat(primaryAmount || '0')
  if (!Number.isFinite(n) || n <= 0) return null
  const primaryDecimals = side.assets[legIndex]?.decimals
  const secondaryDecimals = side.assets[legIndex === 0 ? 1 : 0]?.decimals
  if (primaryDecimals == null || secondaryDecimals == null) return null
  let raw: bigint
  try {
    raw = parseUnits(primaryAmount as `${number}`, primaryDecimals)
  } catch {
    return null
  }
  const counter = balancedCounterAmount(side, legIndex, raw)
  return counter === null ? null : formatUnits(counter, secondaryDecimals)
}

export interface LegRequest {
  asset1?: string
  amount1?: string
}

/**
 * What goes on the wire for the second leg.
 *
 * `amount1` is never sent without `asset1` — the server rejects that pair
 * rather than guessing a leg, and an empty request is how "single-sided" is
 * expressed, not a zero amount.
 */
export function legRequest(
  mode: LegMode,
  secondaryUnderlying: string,
  humanAmount: string,
  decimals: number
): LegRequest {
  if (mode === 'single' || !humanAmount) return {}
  try {
    return {
      asset1: secondaryUnderlying,
      amount1: parseUnits(humanAmount as `${number}`, decimals).toString(),
    }
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Exit form
// ---------------------------------------------------------------------------

/** Parse a human decimal string into base units without going through a float. */
export function toRawUnits(human: string, decimals: number): bigint | null {
  if (!human) return null
  try {
    const [whole, frac = ''] = human.split('.')
    const padded = (frac + '0'.repeat(decimals)).slice(0, decimals)
    return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(padded || '0')
  } catch {
    return null
  }
}

/**
 * The position's LP share count, derived from one leg's balance.
 *
 * No endpoint serves a share balance, so it has to be derived — and it is
 * derived rather than guessed: null when the balance or the ratio is
 * unreadable, because a wrong share count here would be read as the thing the
 * user can act on.
 */
export function deriveTotalShares(
  side: FluidSideInfo,
  legIndex: number,
  legBalance: string,
  decimals: number
): bigint | null {
  const n = parseFloat(legBalance || '0')
  if (!Number.isFinite(n) || n <= 0) return null
  const raw = toRawUnits(legBalance, decimals)
  return raw === null ? null : sharesForLegAmount(side, legIndex, raw)
}

export interface ExitRequest {
  shares?: string
  isAll: boolean
}

/**
 * The exit request for a percentage of the position.
 *
 * 100 % is a DIFFERENT request, not a preset that fills a field: a full exit is
 * share-precise and routes to `operatePerfect` via `isAll`, and the token-sized
 * form cannot express it at all. Anything less sends an explicit share count.
 */
export function exitRequestFor(pct: number, totalShares: bigint | null): ExitRequest {
  if (pct >= 100) return { isAll: true }
  if (totalShares === null) return { isAll: false }
  // Two decimal places of percent, in integer maths — no float rounding on a
  // number that becomes a burn amount.
  const shares = (totalShares * BigInt(Math.round(pct * 100))) / 10000n
  return { isAll: false, shares: shares.toString() }
}
