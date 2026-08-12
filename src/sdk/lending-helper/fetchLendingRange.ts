import { apiFetch, errorMessage, type ApiParams } from '../http'

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
  params: ApiParams
): Promise<RangeResult<T>> {
  try {
    const data = await apiFetch<T | T[]>(`/v1/data/lending/range/${path}`, { params })
    // The endpoint returns `data` as a single-element array (range-family shape).
    const row = Array.isArray(data) ? data[0] : data
    return { success: true, data: (row ?? {}) as T }
  } catch (err) {
    return { success: false, error: errorMessage(err) }
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
  return fetchRange<DepositBorrowRange>('deposit-borrow', {
    marketUidOut: p.marketUidOut,
    marketUidIn: p.marketUidIn,
    account: p.account,
    depositAmount: p.depositAmount,
    borrowAmount: p.borrowAmount,
    modeId: p.modeId,
    accountId: p.accountId,
  })
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
  return fetchRange<WithdrawRepayRange>('withdraw-repay', {
    marketUidOut: p.marketUidOut,
    marketUidIn: p.marketUidIn,
    account: p.account,
    repayAmount: p.repayAmount,
    withdrawAmount: p.withdrawAmount,
    modeId: p.modeId,
    accountId: p.accountId,
  })
}
