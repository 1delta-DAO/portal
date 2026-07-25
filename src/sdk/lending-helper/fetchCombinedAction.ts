import { BACKEND_BASE_URL } from '../../config/backend'
import type { LendingActionSimulation, RateImpactEntry } from './fetchLendingAction'

// ============================================================================
// Combined one-shot lending actions:
//   POST|GET /v1/actions/lending/deposit-and-borrow   (supply collateral + borrow)
//   POST|GET /v1/actions/lending/withdraw-and-repay   (repay debt + withdraw)
//
// The worker envelope matches the single-action endpoints:
//   json.actions.transactions[]  — ordered txs (native/composer = 1, sequential = N)
//   json.actions.permissions[]   — approvals / authorizations to run first
//   json.data.{ route, atomic, simulation, reveals }
// `route` is 'native' | 'composer' | 'sequential' | 'auction'.
// ============================================================================

export interface CombinedTransaction {
  to: string
  data: string
  value: string
  description?: string
}

export interface TermBidReveal {
  id: string
  seed: string
  price: string
  nonce: string
}

export interface CombinedActionResponse {
  transactions: CombinedTransaction[]
  permissions: CombinedTransaction[]
  route?: 'native' | 'composer' | 'sequential' | 'auction'
  atomic?: boolean
  simulation?: LendingActionSimulation
  rateImpact?: RateImpactEntry[]
  /** Term auction only — sealed-bid reveal tickets the caller must persist. */
  reveals?: TermBidReveal[]
}

export interface CombinedActionResult {
  success: boolean
  data?: CombinedActionResponse
  error?: string
}

const LENDING_ACTIONS_BASE = `${BACKEND_BASE_URL}/v1/actions/lending`

async function callCombined(
  path: 'deposit-and-borrow' | 'withdraw-and-repay',
  qs: URLSearchParams
): Promise<CombinedActionResult> {
  try {
    const res = await fetch(`${LENDING_ACTIONS_BASE}/${path}?${qs}`)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { success: false, error: `HTTP ${res.status}: ${text || res.statusText}` }
    }
    const json = await res.json()
    if (!json.success) {
      return { success: false, error: json.error?.message ?? 'API error' }
    }
    return {
      success: true,
      data: {
        transactions: json.actions?.transactions ?? [],
        permissions: json.actions?.permissions ?? [],
        route: json.data?.route,
        atomic: json.data?.atomic,
        simulation: json.data?.simulation,
        rateImpact: json.data?.rateImpact,
        reveals: json.data?.reveals,
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' }
  }
}

// ----------------------------------------------------------------------------
// Deposit + borrow (open)
// ----------------------------------------------------------------------------

export interface DepositAndBorrowParams {
  /** Collateral (supply) market — `lender:chainId:address`. */
  collateralMarketUid: string
  /** Debt (borrow) market — same lender + chain. */
  debtMarketUid: string
  operator: string
  /** Raw collateral amount to supply. */
  collateralAmount: string
  /** Raw amount to borrow. */
  borrowAmount: string
  receiver?: string
  /** Pay currency for the collateral (native sentinel → wrap). */
  payAsset?: string
  /** Aave rate mode of the debt (2 = variable). */
  borrowMode?: string
  accountId?: string
  /** E-mode / config id the collateral factor was computed against. */
  modeId?: string
  simulate?: boolean
}

export async function fetchDepositAndBorrow(
  p: DepositAndBorrowParams
): Promise<CombinedActionResult> {
  const qs = new URLSearchParams()
  qs.set('marketUid', p.collateralMarketUid)
  qs.set('debtMarketUid', p.debtMarketUid)
  qs.set('operator', p.operator)
  qs.set('collateralAmount', p.collateralAmount)
  qs.set('borrowAmount', p.borrowAmount)
  if (p.receiver) qs.set('receiver', p.receiver)
  if (p.payAsset) qs.set('payAsset', p.payAsset)
  if (p.borrowMode) qs.set('borrowMode', p.borrowMode)
  if (p.accountId) qs.set('accountId', p.accountId)
  if (p.modeId) qs.set('modeId', p.modeId)
  if (p.simulate) qs.set('simulate', 'true')
  return callCombined('deposit-and-borrow', qs)
}

// ----------------------------------------------------------------------------
// Withdraw + repay (close / reduce)
// ----------------------------------------------------------------------------

export interface WithdrawAndRepayParams {
  /** Debt (repay) market — `lender:chainId:address`. */
  debtMarketUid: string
  /** Collateral (withdraw) market — same lender + chain. */
  collateralMarketUid: string
  operator: string
  /** Raw debt amount to repay (omit when `repayMax`). */
  repayAmount?: string
  /** Raw collateral amount to withdraw (omit when `withdrawMax`). */
  withdrawAmount?: string
  repayMax?: boolean
  withdrawMax?: boolean
  receiver?: string
  /** Pay currency for the repay (native sentinel → wrap). */
  payAsset?: string
  /** Delivery currency for the withdrawn collateral (native sentinel → unwrap). */
  receiveAsset?: string
  borrowMode?: string
  accountId?: string
  simulate?: boolean
}

export async function fetchWithdrawAndRepay(
  p: WithdrawAndRepayParams
): Promise<CombinedActionResult> {
  const qs = new URLSearchParams()
  qs.set('marketUid', p.debtMarketUid)
  qs.set('collateralMarketUid', p.collateralMarketUid)
  qs.set('operator', p.operator)
  if (p.repayAmount) qs.set('repayAmount', p.repayAmount)
  if (p.withdrawAmount) qs.set('withdrawAmount', p.withdrawAmount)
  if (p.repayMax) qs.set('repayMax', 'true')
  if (p.withdrawMax) qs.set('withdrawMax', 'true')
  if (p.receiver) qs.set('receiver', p.receiver)
  if (p.payAsset) qs.set('payAsset', p.payAsset)
  if (p.receiveAsset) qs.set('receiveAsset', p.receiveAsset)
  if (p.borrowMode) qs.set('borrowMode', p.borrowMode)
  if (p.accountId) qs.set('accountId', p.accountId)
  if (p.simulate) qs.set('simulate', 'true')
  return callCombined('withdraw-and-repay', qs)
}
