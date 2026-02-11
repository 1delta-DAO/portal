const BACKEND_BASE_URL = 'https://portal.1delta.io/v1'

// ============================================================================
// E-Mode List
// ============================================================================

export interface EModeCategory {
  id: number
  label: string
}

export interface EModeLenderEntry {
  lender: string
  chainId: string
  categories: EModeCategory[]
}

export interface EModeListResult {
  success: boolean
  data?: EModeLenderEntry[]
  error?: string
}

export async function fetchEModeList(params: {
  lender: string
  chain: string
}): Promise<EModeListResult> {
  try {
    const qs = new URLSearchParams()
    qs.append('lenders', params.lender)
    qs.append('chains', params.chain)

    const res = await fetch(`${BACKEND_BASE_URL}/data/lending/e-mode?${qs}`)

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { success: false, error: `HTTP ${res.status}: ${text || res.statusText}` }
    }

    const json = await res.json()
    const rawEntries: any[] = json.data ?? []

    // Normalize from API shape (lenderKey/eModes/category) to our types
    const data: EModeLenderEntry[] = rawEntries.map((entry: any) => ({
      lender: entry.lenderKey ?? entry.lender,
      chainId: entry.chainId,
      categories: (entry.eModes ?? entry.categories ?? []).map((m: any) => ({
        id: m.category ?? m.id,
        label: m.label,
      })),
    }))

    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' }
  }
}

// ============================================================================
// E-Mode Analysis
// ============================================================================

export interface EModeAnalysisEntry {
  modeId: number
  label: string
  healthFactor: number | null
  supportedAssets: string[]
  canSwitch: boolean
}

export interface EModeAnalysisResult {
  success: boolean
  data?: EModeAnalysisEntry[]
  error?: string
}

export interface EModeAnalysisBody {
  accountId?: string
  health: number | null
  borrowCapacityUSD: number
  balanceData: {
    collateral: number
    adjustedDebt: number
    deposits: number
    debt: number
    borrowDiscountedCollateral?: number
    nav?: number
  }
  positions: {
    marketUid: string
    depositsUSD: number
    debtUSD: number
    debtStableUSD: number
    collateralEnabled: boolean
  }[]
  userConfig: {
    selectedMode: number
    id?: string
    isWhitelisted?: boolean
  }
}

export async function fetchEModeAnalysis(params: {
  lender: string
  chain: string
  body: EModeAnalysisBody
}): Promise<EModeAnalysisResult> {
  try {
    const qs = new URLSearchParams()
    qs.set('lender', params.lender)
    qs.set('chain', params.chain)

    const res = await fetch(`${BACKEND_BASE_URL}/data/lending/e-mode/analysis?${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params.body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { success: false, error: `HTTP ${res.status}: ${text || res.statusText}` }
    }

    const json = await res.json()
    const rawAnalysis: any[] = json.data ?? json

    // Normalize from API shape (category → modeId)
    const data: EModeAnalysisEntry[] = rawAnalysis.map((e: any) => ({
      modeId: e.modeId ?? e.category ?? e.id,
      label: e.label ?? '',
      healthFactor: e.healthFactor ?? null,
      supportedAssets: e.supportedAssets ?? [],
      canSwitch: e.canSwitch ?? false,
    }))

    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' }
  }
}
