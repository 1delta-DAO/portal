import { apiFetch, apiFetchEnvelope, errorMessage, type ApiTransaction } from '../http'

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
    const payload = await apiFetch<{ items?: any[]; data?: any[] }>('/v1/data/lending/e-mode', {
      params: { lenders: params.lender, chains: params.chain },
    })

    const rawEntries: any[] = payload?.items ?? payload?.data ?? []

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
  } catch (err) {
    return { success: false, error: errorMessage(err) }
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

    const payload = await apiFetch<{ data?: any[] } | any[]>('/v1/data/lending/e-mode/analysis', {
      params: Object.fromEntries(qs),
    })

    const rawAnalysis: any[] = Array.isArray(payload) ? payload : (payload?.data ?? [])

    // Normalize from API shape (category → modeId)
    const data: EModeAnalysisEntry[] = rawAnalysis.map((e: any) => ({
      modeId: e.modeId ?? e.category ?? e.id,
      label: e.label ?? '',
      healthFactor: e.healthFactor ?? null,
      supportedAssets: e.supportedAssets ?? [],
      canSwitch: e.canSwitch ?? false,
    }))

    return { success: true, data }
  } catch (err) {
    return { success: false, error: errorMessage(err) }
  }
}

// ============================================================================
// E-Mode Switch — build calldata for switching e-mode category
// ============================================================================

export type EModeSwitchTx = ApiTransaction

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
    const envelope = await apiFetchEnvelope<unknown>('/v1/actions/lending/e-mode', {
      params: { chainId: params.chainId, lender: params.lender, eMode: params.eMode },
    })

    const tx = envelope.actions?.transactions?.[0]
    return {
      success: true,
      data: tx ? { to: tx.to, data: tx.data, value: tx.value ?? '0' } : undefined,
    }
  } catch (err) {
    return { success: false, error: errorMessage(err) }
  }
}
