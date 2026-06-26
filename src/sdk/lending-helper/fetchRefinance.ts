import { BACKEND_BASE_URL } from '../../config/backend'
import type { LendingActionResponse } from './fetchLendingAction'

/**
 * Refinance / roll-over a Lista DAO broker loan into a fresh fixed term.
 * Hits `GET /v1/actions/loop/refinance` (a flash-loan-backed composer bundle:
 * repay the source loan → open a new fixed loan that repays the flash).
 *
 * - Omit `fromLoanId` → refinance the **dynamic/flex** position into a fixed term.
 * - Pass a fixed loan's `loanId` (posId) as `fromLoanId` → **roll-over** that
 *   fixed loan into a different (or same-duration, fresh) term.
 *
 * See worker `loop-refinance` OpenAPI + BROKERED_MARKETS.md.
 */
export interface RefinanceParams {
  /** Loan-token market identifier of the brokered market (`lender:chainId:address`). */
  marketUid: string
  /** Borrower / tx sender. */
  operator: string
  /** Flash / repay / new-fixed amount in loan-token wei. Optional on a full close. */
  amount?: string
  /** Fixed term to move the debt into (`MarketTerm.termId`). */
  termId: number
  /** Source loan to roll FROM. Omit to refinance the dynamic/flex position. */
  fromLoanId?: string
  /**
   * Full close: the server sizes the flash to the source loan's borrow balance
   * (the max of `borrowBalance` below and a fresh on-chain read) + a small margin,
   * so the repay clears the source to zero with no sub-`minLoan` dust
   * (`REMAIN_BORROW_TOO_LOW`). `amount` becomes an optional floor hint. Off ⇒
   * partial re-fix at exactly `amount`.
   */
  isAll?: boolean
  /**
   * Source loan's current borrow balance in loan-token wei (from the client's
   * position data). When provided, the request is sent as POST and the server
   * sizes the full close from it — no dependence on the worker's live RPC.
   */
  borrowBalance?: string
  /** Source loan's early-repay penalty in loan-token wei (fixed, not-yet-matured source). */
  earlyRepayPenalty?: string
}

export interface RefinanceResult {
  success: boolean
  data?: LendingActionResponse
  error?: string
}

export async function fetchRefinance(params: RefinanceParams): Promise<RefinanceResult> {
  try {
    const qs = new URLSearchParams()
    qs.set('marketUid', params.marketUid)
    qs.set('operator', params.operator)
    if (params.amount) qs.set('amount', params.amount)
    qs.set('termId', String(params.termId))
    if (params.fromLoanId != null) qs.set('fromLoanId', params.fromLoanId)
    if (params.isAll) qs.set('isAll', 'true')

    // When the caller supplies the borrow balance, POST it so the server sizes the
    // full close from real position data instead of (only) its own RPC read.
    const url = `${BACKEND_BASE_URL}/v1/actions/loop/refinance?${qs}`
    const res = params.borrowBalance
      ? await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            borrowBalance: params.borrowBalance,
            earlyRepayPenalty: params.earlyRepayPenalty,
          }),
        })
      : await fetch(url)

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        success: false,
        error: `HTTP ${res.status}: ${text || res.statusText}`,
      }
    }

    const json = await res.json()

    if (!json.success) {
      return {
        success: false,
        error: json.error?.message ?? 'API error',
      }
    }

    return {
      success: true,
      data: {
        transactions: json.actions?.transactions ?? [],
        permissions: json.actions?.permissions ?? [],
      },
    }
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? 'Unknown error',
    }
  }
}
