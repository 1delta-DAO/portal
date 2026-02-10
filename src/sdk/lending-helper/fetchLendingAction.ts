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

export interface LendingActionResponse {
  transaction: LendingTransaction
  permission: LendingTransaction & { info?: string }
}

export interface LendingActionResult {
  success: boolean
  data?: LendingActionResponse
  error?: string
}

const LENDING_ACTIONS_BASE = 'https://portal.1delta.io/v1/actions/lending'

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

    const json = (await res.json()) as LendingActionResponse
    return { success: true, data: json }
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? 'Unknown error',
    }
  }
}
