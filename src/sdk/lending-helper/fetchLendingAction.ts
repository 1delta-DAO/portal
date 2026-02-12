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
}

export interface LendingTransaction {
  to: string
  data: string
  value: string
}

export interface LendingPermission extends LendingTransaction {
  description?: string
}

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
// POST variant — includes simulation with projected health factor
// ============================================================================

export interface LendingActionBody {
  balanceData: {
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
  aprData: {
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
  modeId: number
  positions: {
    marketUid: string
    depositsUSD: number
    debtUSD: number
    debtStableUSD: number
    collateralEnabled: boolean
  }[]
}

export interface SimulationState {
  healthFactor: number | null
  borrowCapacity: number
  balanceData: LendingActionBody['balanceData']
  aprData: LendingActionBody['aprData']
}

export interface LendingActionSimulation {
  pre: SimulationState
  post: SimulationState
}

export interface LendingActionResponseWithSimulation extends LendingActionResponse {
  simulation?: LendingActionSimulation
}

export interface LendingActionResultWithSimulation {
  success: boolean
  data?: LendingActionResponseWithSimulation
  error?: string
}

import { BACKEND_BASE_URL } from '../../config/backend'

const LENDING_ACTIONS_BASE = `${BACKEND_BASE_URL}/v1/actions/lending`

export async function fetchLendingAction(
  params: LendingActionParams
): Promise<LendingActionResult> {
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

    const res = await fetch(`${LENDING_ACTIONS_BASE}/${action}?${qs}`)

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

export async function fetchLendingActionWithSimulation(
  params: LendingActionParams,
  body: LendingActionBody
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

    const res = await fetch(`${LENDING_ACTIONS_BASE}/${action}?${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

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
        simulation: json.data?.simulation,
      },
    }
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? 'Unknown error',
    }
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
    const qs = new URLSearchParams()
    qs.set('marketUid', params.marketUid)
    qs.set('enabled', String(params.enabled))

    const res = await fetch(`${LENDING_ACTIONS_BASE}/enable-collateral?${qs}`)

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

    const tx = json.actions?.transactions?.[0]
    return {
      success: true,
      data: tx ? { to: tx.to, data: tx.data, value: tx.value ?? '0' } : undefined,
    }
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? 'Unknown error',
    }
  }
}
