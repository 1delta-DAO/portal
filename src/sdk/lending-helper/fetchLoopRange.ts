import { BACKEND_BASE_URL } from '../../config/backend'

// ============================================================================
// Types
// ============================================================================

export interface LoopRangeModeRange {
  amountIn: number
  amountOut: number
  amountUSD: number
}

export interface LoopRangeModeAnalysis {
  userMode: string
  targetMode: string
  canSwitchToTargetMode: boolean
  userModeRange: LoopRangeModeRange | null
  targetModeRange: LoopRangeModeRange | null
}

export interface LoopRangeEntry {
  assetLong: string
  assetShort: string
  amount: number
  amountUSD: number
  modeAnalysis: LoopRangeModeAnalysis
}

export interface LoopRangeResult {
  success: boolean
  data?: LoopRangeEntry[]
  error?: string
}

// ============================================================================
// Resolution helper
// ============================================================================

const ZERO_RANGE: LoopRangeModeRange = { amountIn: 0, amountOut: 0, amountUSD: 0 }

/**
 * Resolve the effective range from a raw API entry:
 * - If canSwitchToTargetMode && targetModeRange exists → use target
 * - Otherwise use userModeRange, defaulting to zeros if null
 */
function resolveLoopRangeEntry(raw: any): LoopRangeEntry {
  const ma = raw.modeAnalysis ?? {}
  const canSwitch = !!ma.canSwitchToTargetMode
  const targetRange: LoopRangeModeRange | null = ma.targetModeRange
    ? { amountIn: ma.targetModeRange.amountIn ?? 0, amountOut: ma.targetModeRange.amountOut ?? 0, amountUSD: ma.targetModeRange.amountUSD ?? 0 }
    : null
  const userRange: LoopRangeModeRange | null = ma.userModeRange
    ? { amountIn: ma.userModeRange.amountIn ?? 0, amountOut: ma.userModeRange.amountOut ?? 0, amountUSD: ma.userModeRange.amountUSD ?? 0 }
    : null

  const effective =
    canSwitch && targetRange ? targetRange : userRange ?? ZERO_RANGE

  return {
    assetLong: raw.underlyingInfoLong?.asset?.address ?? '',
    assetShort: raw.underlyingInfoShort?.asset?.address ?? '',
    amount: effective.amountIn,
    amountUSD: effective.amountUSD,
    modeAnalysis: {
      userMode: ma.userMode ?? '0',
      targetMode: ma.targetMode ?? '0',
      canSwitchToTargetMode: canSwitch,
      userModeRange: userRange,
      targetModeRange: targetRange,
    },
  }
}

// ============================================================================
// Simulation body (for POST variant)
// ============================================================================

export interface LoopRangeSimulationBody {
  balanceData: {
    borrowDiscountedCollateral: number
    collateral: number
    debt: number
    adjustedDebt: number
    deposits: number
    nav: number
    deposits24h: number
    debt24h: number
    nav24h: number
  }
  aprData: {
    apr: number
    borrowApr: number
    depositApr: number
    rewards: any
    rewardApr: number
    rewardDepositApr: number
    rewardBorrowApr: number
    intrinsicApr: number
    intrinsicDepositApr: number
    intrinsicBorrowApr: number
  }
  modeId?: string
  positions?: Array<{
    marketUid: string
    depositsUSD: number
    debtUSD: number
    debtStableUSD: number
    collateralEnabled: boolean
  }>
}

// ============================================================================
// Fetch (GET — uses account for on-chain data)
// ============================================================================

export async function fetchLoopRange(params: {
  lender: string
  chainId: string
  account: string
  marketUidIn?: string
  marketUidOut?: string
  payAsset?: string
  payAmount?: string
}): Promise<LoopRangeResult> {
  try {
    const qs = new URLSearchParams()
    qs.set('lender', params.lender)
    qs.set('chainId', params.chainId)
    qs.set('account', params.account)
    if (params.marketUidIn) qs.set('marketUidIn', params.marketUidIn)
    if (params.marketUidOut) qs.set('marketUidOut', params.marketUidOut)
    if (params.payAsset) qs.set('payAsset', params.payAsset)
    if (params.payAmount) qs.set('payAmount', params.payAmount)

    const res = await fetch(`${BACKEND_BASE_URL}/v1/data/lending/range?${qs}`)

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { success: false, error: `HTTP ${res.status}: ${text || res.statusText}` }
    }

    const json = await res.json()

    if (!json.success) {
      return { success: false, error: json.error?.message ?? 'API error' }
    }

    const data: LoopRangeEntry[] = (json.data ?? []).map(resolveLoopRangeEntry)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' }
  }
}

// ============================================================================
// Fetch (POST — uses simulation body)
// ============================================================================

export async function fetchLoopRangeWithSimulation(params: {
  lender: string
  chainId: string
  body: LoopRangeSimulationBody
  marketUidIn?: string
  marketUidOut?: string
  payAsset?: string
  payAmount?: string
}): Promise<LoopRangeResult> {
  try {
    const qs = new URLSearchParams()
    qs.set('lender', params.lender)
    qs.set('chainId', params.chainId)
    if (params.marketUidIn) qs.set('marketUidIn', params.marketUidIn)
    if (params.marketUidOut) qs.set('marketUidOut', params.marketUidOut)
    if (params.payAsset) qs.set('payAsset', params.payAsset)
    if (params.payAmount) qs.set('payAmount', params.payAmount)

    const res = await fetch(`${BACKEND_BASE_URL}/v1/data/lending/range?${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params.body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { success: false, error: `HTTP ${res.status}: ${text || res.statusText}` }
    }

    const json = await res.json()

    if (!json.success) {
      return { success: false, error: json.error?.message ?? 'API error' }
    }

    const data: LoopRangeEntry[] = (json.data ?? []).map(resolveLoopRangeEntry)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' }
  }
}
