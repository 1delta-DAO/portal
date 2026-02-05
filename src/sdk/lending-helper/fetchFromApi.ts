import { AllocationAction } from './types'

// ---- Generic POST helper ----

export interface CreateTxnRequestBody {
  chainId: string
  operator: string
  actions: AllocationAction[]
}

export interface CreateTxnResponse<T = any> {
  success: boolean
  data?: T
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

    const json = (await res.json()) as T

    return { success: true, data: json }
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? 'Unknown error',
    }
  }
}
