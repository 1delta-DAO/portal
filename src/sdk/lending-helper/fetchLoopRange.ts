import { BACKEND_BASE_URL } from '../../config/backend'

// ============================================================================
// Types — aligned with range endpoint docs
// ============================================================================

/** Parsed range amounts for a single mode range (numeric for comparisons) */
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
  /** Numeric amountIn — use for comparisons / quick button visibility */
  amountIn: number
  /** Raw amountIn string from API — use for input fields to avoid float precision loss */
  amountInStr: string
  /** Numeric amountOut */
  amountOut: number
  /** Raw amountOut string from API */
  amountOutStr: string
  /** USD value of the binding constraint */
  amountUSD: number
  /** Mode analysis (leverage/loop only, null-ish for flat endpoints) */
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

function parseModeRange(raw: any): LoopRangeModeRange | null {
  if (!raw) return null
  return {
    amountIn: Number(raw.amountIn) || 0,
    amountOut: Number(raw.amountOut) || 0,
    amountUSD: Number(raw.amountUSD) || 0,
  }
}

/**
 * Resolve the effective range from a raw API entry.
 *
 * Two response formats:
 * 1. Leverage/loop (has modeAnalysis with userModeRange/targetModeRange)
 * 2. Flat (colswap/debtswap/close — amountIn/amountOut/amountUSD at top level)
 */
function resolveLoopRangeEntry(raw: any): LoopRangeEntry {
  // Flat format: amountIn/amountOut/amountUSD directly on entry, no modeAnalysis
  if (!raw.modeAnalysis) {
    return {
      assetLong: '',
      assetShort: '',
      amountIn: Number(raw.amountIn) || 0,
      amountInStr: String(raw.amountIn ?? '0'),
      amountOut: Number(raw.amountOut) || 0,
      amountOutStr: String(raw.amountOut ?? '0'),
      amountUSD: Number(raw.amountUSD) || 0,
      modeAnalysis: {
        userMode: '0',
        targetMode: '0',
        canSwitchToTargetMode: false,
        userModeRange: null,
        targetModeRange: null,
      },
    }
  }

  // Leverage format: resolve from modeAnalysis
  const ma = raw.modeAnalysis
  const canSwitch = !!ma.canSwitchToTargetMode
  const targetRange = parseModeRange(ma.targetModeRange)
  const userRange = parseModeRange(ma.userModeRange)

  const effective = canSwitch && targetRange ? targetRange : userRange ?? ZERO_RANGE

  // Preserve raw strings from the API for input fields
  const rawEffective = canSwitch && ma.targetModeRange ? ma.targetModeRange : ma.userModeRange

  return {
    assetLong: raw.underlyingInfoLong?.asset?.address ?? '',
    assetShort: raw.underlyingInfoShort?.asset?.address ?? '',
    amountIn: effective.amountIn,
    amountInStr: String(rawEffective?.amountIn ?? effective.amountIn),
    amountOut: effective.amountOut,
    amountOutStr: String(rawEffective?.amountOut ?? effective.amountOut),
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
// Range endpoint paths per operation
// ============================================================================

export type RangeOperation = 'leverage' | 'collateral-swap' | 'debt-swap' | 'close'

const RANGE_ENDPOINTS: Record<RangeOperation, string> = {
  'leverage': `${BACKEND_BASE_URL}/v1/data/loop/range/leverage`,
  'collateral-swap': `${BACKEND_BASE_URL}/v1/data/loop/range/collateral-swap`,
  'debt-swap': `${BACKEND_BASE_URL}/v1/data/loop/range/debt-swap`,
  'close': `${BACKEND_BASE_URL}/v1/data/loop/range/close`,
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
  operation?: RangeOperation
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

    const endpoint = RANGE_ENDPOINTS[params.operation ?? 'leverage']
    const res = await fetch(`${endpoint}?${qs}`)

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
  operation?: RangeOperation
}): Promise<LoopRangeResult> {
  try {
    const qs = new URLSearchParams()
    qs.set('lender', params.lender)
    qs.set('chainId', params.chainId)
    if (params.marketUidIn) qs.set('marketUidIn', params.marketUidIn)
    if (params.marketUidOut) qs.set('marketUidOut', params.marketUidOut)
    if (params.payAsset) qs.set('payAsset', params.payAsset)
    if (params.payAmount) qs.set('payAmount', params.payAmount)

    const endpoint = RANGE_ENDPOINTS[params.operation ?? 'leverage']
    const res = await fetch(`${endpoint}?${qs}`, {
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
