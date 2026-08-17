import type { LoopRangeSimulationBody } from './fetchLoopRange'

export interface LendingActionParams {
  marketUid: string
  operator: string
  amount: string
  actionType: 'Deposit' | 'Withdraw' | 'Borrow' | 'Repay'
  receiver?: string
  payAsset?: string
  receiveAsset?: string
  isAll?: boolean
  lendingMode?: string
  accountId?: string
  /**
   * Brokered (Lista) borrow only: the chosen fixed-term id from the market's
   * `terms[]` rate card. Selects which fixed loan to open. See BROKERED_MARKETS.md §6.
   */
  termId?: number
  /**
   * Brokered (Lista) repay only: the loan's posId to repay, or the
   * `FLEX_LOAN_ID` sentinel to target the dynamic/flex position.
   */
  loanId?: string
  /**
   * Liquity-family only: the borrower-chosen annual interest rate, in **WAD**
   * (1e18-scaled fraction). Use `aprPercentToWad` — the UI speaks percent and
   * the wire speaks WAD, and passing one where the other is meant is a 100×
   * error. Omitted ⇒ the protocol applies the branch average.
   */
  interestRate?: string
  /**
   * Fluid smart vaults (T2/T3/T4) — the second leg of a two-token LP side.
   *
   * `asset1` NAMES the other leg (matched by address server-side; `amount1`
   * without it is an error, by design — the order is load-bearing). Absent ⇒
   * single-sided, which is legal and is the natural default, but pays the
   * pool's imbalance fee plus price impact.
   */
  asset1?: string
  /** Raw amount of `asset1`. Only meaningful alongside it. */
  amount1?: string
  /**
   * Size the operation in LP SHARES instead of tokens, which routes it to
   * `operatePerfect`. This is how a full exit is expressed — a token-sized full
   * exit cannot be, because the pool decides the share delta.
   */
  shares?: string
  /**
   * The mandatory share bound. **LEAVE THESE UNSET** and let the API quote them
   * off the DexResolver: the pools are concentrated, so a client-side
   * constant-product estimate understates price impact exactly where it
   * matters. They exist for a caller that has its own quote, not for us.
   */
  minShares?: string
  maxShares?: string
  /** When true, the server runs an e2e simulation and returns projected health factor / balances */
  simulate?: boolean
  /** When provided, sent as POST body for simulation (same shape as loop simulation body) */
  simulationBody?: LoopRangeSimulationBody
}

export type LendingTransaction = ApiTransaction

export type LendingPermission = ApiPermission

export interface LendingActionResponse {
  transactions: LendingTransaction[]
  permissions: LendingPermission[]
}

export interface LendingActionResult {
  success: boolean
  data?: LendingActionResponse
  error?: string
}

// ============================================================================
// Simulation types — returned when `simulate=true` is passed
// ============================================================================

export interface SimulationBalanceData {
  deposits: number
  debt: number
  adjustedDebt: number
  collateral: number
  collateralAllActive: number
  borrowDiscountedCollateral: number
  borrowDiscountedCollateralAllActive: number
  nav: number
  deposits24h: number
  debt24h: number
  nav24h: number
  rewards: Record<string, unknown>
}

export interface SimulationAprData {
  apr: number
  depositApr: number
  borrowApr: number
  rewardApr: number
  rewardDepositApr: number
  rewardBorrowApr: number
  intrinsicApr: number
  intrinsicDepositApr: number
  intrinsicBorrowApr: number
  rewards: Record<string, unknown>
}

export interface SimulationState {
  healthFactor: number | null
  borrowCapacity: number
  balanceData: SimulationBalanceData
  aprData: SimulationAprData
}

export interface LendingActionSimulation {
  pre: SimulationState
  post: SimulationState
}

export interface RateImpactEntry {
  marketUid: string
  utilization: { current: number; projected: number }
  borrowRate: { current: number; projected: number }
  depositRate: { current: number; projected: number }
}

export interface LendingActionResponseWithSimulation extends LendingActionResponse {
  simulation?: LendingActionSimulation
  rateImpact?: RateImpactEntry[]
}

export interface LendingActionResultWithSimulation {
  success: boolean
  data?: LendingActionResponseWithSimulation
  error?: string
}

import { apiFetchEnvelope, errorMessage, type ApiTransaction, type ApiPermission } from '../http'

const LENDING_ACTIONS_BASE = '/v1/actions/lending'

export async function fetchLendingAction(
  params: LendingActionParams
): Promise<LendingActionResultWithSimulation> {
  try {
    const action = params.actionType.toLowerCase()

    const qs = new URLSearchParams()
    qs.set('marketUid', params.marketUid)
    qs.set('operator', params.operator)
    qs.set('amount', params.amount)

    if (params.receiver) qs.set('receiver', params.receiver)
    if (params.payAsset) qs.set('payAsset', params.payAsset)
    if (params.receiveAsset) qs.set('receiveAsset', params.receiveAsset)
    if (params.isAll != null) qs.set('isAll', String(params.isAll))
    if (params.lendingMode) qs.set('lendingMode', params.lendingMode)
    if (params.accountId) qs.set('accountId', params.accountId)
    if (params.termId != null) qs.set('termId', String(params.termId))
    if (params.loanId != null) qs.set('loanId', params.loanId)
    if (params.interestRate != null) qs.set('interestRate', params.interestRate)
    // Fluid smart legs. `amount1` is sent only WITH `asset1` — the server
    // rejects the pair the other way round rather than guessing a leg, and
    // reproducing that guard here keeps the failure in the UI instead of in a
    // 400.
    if (params.asset1) {
      qs.set('asset1', params.asset1)
      if (params.amount1 != null) qs.set('amount1', params.amount1)
    }
    if (params.shares != null) qs.set('shares', params.shares)
    if (params.minShares != null) qs.set('minShares', params.minShares)
    if (params.maxShares != null) qs.set('maxShares', params.maxShares)
    if (params.simulate) qs.set('simulate', 'true')

    // A `simulationBody` switches the request to POST; without one this is a
    // plain GET that only builds calldata.
    const { data, actions } = await apiFetchEnvelope<{
      simulation?: LendingActionResponseWithSimulation['simulation']
      rateImpact?: LendingActionResponseWithSimulation['rateImpact']
    }>(`${LENDING_ACTIONS_BASE}/${action}`, {
      params: Object.fromEntries(qs),
      body: params.simulationBody,
    })

    return {
      success: true,
      data: {
        transactions: actions?.transactions ?? [],
        permissions: actions?.permissions ?? [],
        simulation: data?.simulation,
        rateImpact: data?.rateImpact,
      },
    }
  } catch (err) {
    return { success: false, error: errorMessage(err) }
  }
}

// ============================================================================
// Enable / Disable Collateral
// ============================================================================

export interface CollateralToggleParams {
  marketUid: string
  enabled: boolean
}

export interface CollateralToggleResult {
  success: boolean
  data?: LendingTransaction
  error?: string
}

export async function fetchCollateralToggle(
  params: CollateralToggleParams
): Promise<CollateralToggleResult> {
  try {
    const { actions } = await apiFetchEnvelope<unknown>(
      `${LENDING_ACTIONS_BASE}/enable-collateral`,
      { params: { marketUid: params.marketUid, enabled: params.enabled } }
    )

    const tx = actions?.transactions?.[0]
    return {
      success: true,
      data: tx ? { to: tx.to, data: tx.data, value: tx.value ?? '0' } : undefined,
    }
  } catch (err) {
    return { success: false, error: errorMessage(err) }
  }
}
