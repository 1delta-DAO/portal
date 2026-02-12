import { BACKEND_BASE_URL } from '../../config/backend'

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

    const res = await fetch(`${BACKEND_BASE_URL}/v1/data/lending/e-mode?${qs}`)

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { success: false, error: `HTTP ${res.status}: ${text || res.statusText}` }
    }

    const json = await res.json()

    if (!json.success) {
      return { success: false, error: json.error?.message ?? 'API error' }
    }

    const rawEntries: any[] = json.data?.data ?? []

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

export async function fetchEModeAnalysis(params: {
  lender: string
  chain: string
  operator: string
  accountId?: string
}): Promise<EModeAnalysisResult> {
  try {
    const qs = new URLSearchParams()
    qs.set('lender', params.lender)
    qs.set('chain', params.chain)
    qs.set('operator', params.operator)
    qs.set('simulate', 'true')
    if (params.accountId) qs.set('accountId', params.accountId)

    const res = await fetch(`${BACKEND_BASE_URL}/v1/data/lending/e-mode/analysis?${qs}`)

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { success: false, error: `HTTP ${res.status}: ${text || res.statusText}` }
    }

    const json = await res.json()

    if (!json.success) {
      return { success: false, error: json.error?.message ?? 'API error' }
    }

    const rawAnalysis: any[] = json.data?.data ?? json.data ?? []

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

// ============================================================================
// E-Mode Switch — build calldata for switching e-mode category
// ============================================================================

export interface EModeSwitchTx {
  to: string
  data: string
  value: string
}

export interface EModeSwitchResult {
  success: boolean
  data?: EModeSwitchTx
  error?: string
}

export async function fetchEModeSwitch(params: {
  chainId: string
  lender: string
  eMode: number
}): Promise<EModeSwitchResult> {
  try {
    const qs = new URLSearchParams()
    qs.set('chainId', params.chainId)
    qs.set('lender', params.lender)
    qs.set('eMode', String(params.eMode))

    const res = await fetch(`${BACKEND_BASE_URL}/v1/actions/lending/e-mode?${qs}`)

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { success: false, error: `HTTP ${res.status}: ${text || res.statusText}` }
    }

    const json = await res.json()

    if (!json.success) {
      return { success: false, error: json.error?.message ?? 'API error' }
    }

    const tx = json.actions?.transactions?.[0]
    return {
      success: true,
      data: tx ? { to: tx.to, data: tx.data, value: tx.value ?? '0' } : undefined,
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' }
  }
}
