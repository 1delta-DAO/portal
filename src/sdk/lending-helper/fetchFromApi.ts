import { AllocationAction } from './types'

// ---- Shared API envelope types ----

export interface ApiActions {
  transactions: { to: string; data: string; value: string }[]
  permissions: { to: string; data: string; value: string; description: string }[]
}

// ---- Generic POST helper ----

export interface CreateTxnRequestBody {
  chainId: string
  operator: string
  actions: AllocationAction[]
}

export interface CreateTxnResponse<T = any> {
  success: boolean
  data?: T | null
  actions?: ApiActions | null
  error?: string
}

export async function fetchTransactionData<T = any>(
  apiUrl: string,
  body: CreateTxnRequestBody
): Promise<CreateTxnResponse<T>> {
  try {
    const res = await fetch(apiUrl, {
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

    return { success: true, data: json.data, actions: json.actions }
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? 'Unknown error',
    }
  }
}
