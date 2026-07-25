import { BACKEND_BASE_URL } from '../../config/backend'

// ============================================================================
// Complement-range endpoints for the deposit-and-borrow / withdraw-and-repay
// panels (the linked-slider math):
//   GET /v1/data/lending/range/deposit-borrow
//        depositAmount → maxBorrow · borrowAmount → minDeposit
//   GET /v1/data/lending/range/withdraw-repay
//        repayAmount → maxWithdraw · withdrawAmount → minRepay
//
// Amounts IN are RAW units; amounts OUT are human decimal strings + USD.
// `collateralModeId` is the config mode actually used — feed it back to the
// action/simulate calls (`modeId`) so the panel stays internally consistent.
// ============================================================================

export interface RangeSide {
  /** Human decimal amount string. */
  amount: string
  amountUSD: number
  /** Health factor at the max (maxBorrow / maxWithdraw only). */
  healthFactor?: number
  liquidityBounded?: boolean
  depositBounded?: boolean
}

export interface DepositBorrowRange {
  collateralModeId?: string
  borrowCollateralFactor?: number
  borrowFactor?: number
  collateralPriceUSD?: number
  debtPriceUSD?: number
  maxBorrow?: RangeSide
  minDeposit?: RangeSide
}

export interface WithdrawRepayRange {
  collateralModeId?: string
  borrowCollateralFactor?: number
  borrowFactor?: number
  collateralPriceUSD?: number
  debtPriceUSD?: number
  maxWithdraw?: RangeSide
  minRepay?: RangeSide
}

export interface RangeResult<T> {
  success: boolean
  data?: T
  error?: string
}

async function fetchRange<T>(
  path: 'deposit-borrow' | 'withdraw-repay',
  qs: URLSearchParams
): Promise<RangeResult<T>> {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/v1/data/lending/range/${path}?${qs}`)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { success: false, error: `HTTP ${res.status}: ${text || res.statusText}` }
    }
    const json = await res.json()
    if (!json.success) {
      return { success: false, error: json.error?.message ?? 'API error' }
    }
    // The endpoint returns `data` as a single-element array (range-family shape).
    const row = Array.isArray(json.data) ? json.data[0] : json.data
    return { success: true, data: (row ?? {}) as T }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' }
  }
}

export interface DepositBorrowRangeParams {
  /** Collateral market (`lender:chainId:address`). */
  marketUidOut: string
  /** Debt market. */
  marketUidIn: string
  account: string
  /** Raw collateral deposit amount → returns `maxBorrow`. */
  depositAmount?: string
  /** Raw debt borrow amount → returns `minDeposit`. */
  borrowAmount?: string
  modeId?: string
  /** Sub-account / position id — scopes the range to the caller's EXISTING
   *  position on that sub-account (multi-account lenders: Euler, Fluid, …). */
  accountId?: string
}

export async function fetchDepositBorrowRange(
  p: DepositBorrowRangeParams
): Promise<RangeResult<DepositBorrowRange>> {
  const qs = new URLSearchParams()
  qs.set('marketUidOut', p.marketUidOut)
  qs.set('marketUidIn', p.marketUidIn)
  qs.set('account', p.account)
  if (p.depositAmount) qs.set('depositAmount', p.depositAmount)
  if (p.borrowAmount) qs.set('borrowAmount', p.borrowAmount)
  if (p.modeId) qs.set('modeId', p.modeId)
  if (p.accountId) qs.set('accountId', p.accountId)
  return fetchRange<DepositBorrowRange>('deposit-borrow', qs)
}

export interface WithdrawRepayRangeParams {
  /** Collateral market (`lender:chainId:address`). */
  marketUidOut: string
  /** Debt market. */
  marketUidIn: string
  account: string
  /** Raw debt repay amount → returns `maxWithdraw`. */
  repayAmount?: string
  /** Raw collateral withdraw amount → returns `minRepay`. */
  withdrawAmount?: string
  modeId?: string
  /** Sub-account / position id — scopes to the EXISTING position being reduced. */
  accountId?: string
}

export async function fetchWithdrawRepayRange(
  p: WithdrawRepayRangeParams
): Promise<RangeResult<WithdrawRepayRange>> {
  const qs = new URLSearchParams()
  qs.set('marketUidOut', p.marketUidOut)
  qs.set('marketUidIn', p.marketUidIn)
  qs.set('account', p.account)
  if (p.repayAmount) qs.set('repayAmount', p.repayAmount)
  if (p.withdrawAmount) qs.set('withdrawAmount', p.withdrawAmount)
  if (p.modeId) qs.set('modeId', p.modeId)
  if (p.accountId) qs.set('accountId', p.accountId)
  return fetchRange<WithdrawRepayRange>('withdraw-repay', qs)
}
