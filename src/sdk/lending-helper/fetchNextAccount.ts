import { BACKEND_BASE_URL } from '../../config/backend'

export interface NextAccountData {
  accountType: 'SELECT' | 'AUTOGEN'
  nextAccountId: string
  activeAccountIds: string[]
  accountIdRange: [string, string]
  createHint: string
}

export interface NextAccountResult {
  success: boolean
  data?: NextAccountData
  error?: string
}

export async function fetchNextAccount(params: {
  chainId: string
  lender: string
  account: string
}): Promise<NextAccountResult> {
  try {
    const qs = new URLSearchParams()
    qs.set('chainId', params.chainId)
    qs.set('lender', params.lender)
    qs.set('account', params.account)

    const res = await fetch(`${BACKEND_BASE_URL}/v1/data/lending/next-account?${qs}`)

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { success: false, error: `HTTP ${res.status}: ${text || res.statusText}` }
    }

    const json = await res.json()

    if (!json.success) {
      return { success: false, error: json.error?.message ?? 'API error' }
    }

    return { success: true, data: json.data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' }
  }
}
