import { parseUnits } from 'viem'
import { BACKEND_BASE_URL } from '../../config/backend'
import type { LendingActionResult } from './fetchLendingAction'

/**
 * Liquity-family interest rate: the borrower sets it, and can change it later.
 *
 * This is not a preference — on the Liquity family the rate decides your place
 * in the redemption queue, so the cheapest rate is also the first to be
 * redeemed. It is set at open (`/v1/actions/liquity/open-trove`, where omitting
 * it applies the branch average) and changed afterwards through `set-rate`,
 * which re-charges the upfront fee.
 *
 * Rates cross the wire as **WAD** (1e18-scaled fractions), while the term sheet
 * and the whole UI speak PERCENT. That conversion lives here so no component
 * has to remember it — passing 5.34 where 0.0534e18 was meant would set a rate
 * 100× off.
 */

/**
 * Percent (`5.34`) → WAD fraction string (`"53400000000000000"`).
 *
 * Done as an exact DECIMAL parse, not float arithmetic. `(1.1 / 100) * 1e18`
 * evaluates to `11000000000000002` — the error is in the multiply, so no
 * amount of rounding afterwards recovers it. Since percent→WAD is just a shift
 * of 16 decimal places, `parseUnits(value, 16)` gives the exact integer.
 */
export function aprPercentToWad(aprPercent: number): string {
  if (!Number.isFinite(aprPercent) || aprPercent < 0) return '0'
  // `String(n)` gives JS's SHORTEST round-tripping representation — "5.34",
  // not "5.3399999999999999". `toFixed` would re-expose the binary artifact
  // and hand parseUnits a value one wei short of what the user typed.
  const text = String(aprPercent)
  // A float artifact can still exceed 16 decimals (0.1 + 0.2 →
  // "0.30000000000000004"); parseUnits rejects excess precision, so clamp.
  // 16 dp of a PERCENT is finer than any rate a protocol can represent.
  const [whole, frac = ''] = text.split('.')
  const clamped = frac.length > 16 ? `${whole}.${frac.slice(0, 16)}` : text
  try {
    return parseUnits(clamped, 16).toString()
  } catch {
    return '0'
  }
}

/** WAD fraction → percent. */
export function wadToAprPercent(wad: string | bigint | undefined): number | undefined {
  if (wad == null) return undefined
  const n = Number(wad)
  if (!Number.isFinite(n)) return undefined
  return (n / 1e18) * 100
}

/**
 * Open a Liquity-family trove: deposit collateral AND mint debt in one call,
 * at a rate you choose.
 *
 * This is why the ordinary borrow form cannot serve this lender. The generic
 * `/v1/actions/lending/borrow` only INCREASES debt on a trove that already
 * exists; the opening call needs a collateral amount and a rate together, so
 * a borrow-only form has nothing to send.
 */
export interface LiquityOpenParams {
  chainId: string
  /** Per-branch key, e.g. `LIQUITY_V2_1_0`. */
  lender: string
  /** Trove owner / tx sender. */
  account: string
  /** Collateral to deposit, RAW base units. */
  collAmount: string
  /** Stable debt to mint, RAW base units. */
  amount: string
  /** Chosen rate in PERCENT — converted to WAD here. Omit for the branch average. */
  aprPercent?: number
  maxUpfrontFee?: string
}

/**
 * Build an open-trove transaction.
 *
 * Returns the same `{ transactions, permissions }` envelope as the generic
 * lending actions, so the existing execute path can run it unchanged.
 */
export async function fetchLiquityOpen(params: LiquityOpenParams): Promise<LendingActionResult> {
  return postLiquity('open', {
    chainId: params.chainId,
    lender: params.lender,
    account: params.account,
    collAmount: params.collAmount,
    amount: params.amount,
    // Absent ⇒ the protocol applies the branch average and echoes it back.
    ...(params.aprPercent != null ? { interestRate: aprPercentToWad(params.aprPercent) } : {}),
    ...(params.maxUpfrontFee ? { maxUpfrontFee: params.maxUpfrontFee } : {}),
  })
}

export interface LiquitySetRateParams {
  chainId: string
  /** The branch lender key, e.g. `LIQUITY_V2_1_1`. */
  lender: string
  troveId: string
  /** The new rate, in PERCENT — converted to WAD here. */
  aprPercent: number
  /** Optional guard on the upfront fee the adjustment re-charges. */
  maxUpfrontFee?: string
}

/**
 * Change an existing trove's interest rate.
 *
 * Returns the same `{ transactions, permissions }` envelope as the generic
 * lending actions so it can be executed by the same path.
 */
export async function fetchLiquitySetRate(
  params: LiquitySetRateParams
): Promise<LendingActionResult> {
  return postLiquity('set-rate', {
    chainId: params.chainId,
    lender: params.lender,
    troveId: params.troveId,
    interestRate: aprPercentToWad(params.aprPercent),
    ...(params.maxUpfrontFee ? { maxUpfrontFee: params.maxUpfrontFee } : {}),
  })
}

/** Shared POST + envelope unwrap for the Liquity action routes. */
async function postLiquity(
  action: 'open' | 'set-rate',
  body: Record<string, unknown>
): Promise<LendingActionResult> {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/v1/actions/liquity/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => null)) as {
      success?: boolean
      data?: { transactions?: unknown[]; permissions?: unknown[] }
      error?: { message?: string } | string
    } | null
    if (!res.ok || json?.success === false) {
      const err = typeof json?.error === 'string' ? json?.error : json?.error?.message
      return { success: false, error: err ?? `HTTP ${res.status}` }
    }
    return {
      success: true,
      data: {
        transactions: (json?.data?.transactions ?? []) as never,
        permissions: (json?.data?.permissions ?? []) as never,
      },
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}
