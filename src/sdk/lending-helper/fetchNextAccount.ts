import { apiFetch, errorMessage } from '../http'

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
    const data = await apiFetch<NextAccountData>('/v1/data/lending/next-account', {
      params: { chainId: params.chainId, lender: params.lender, account: params.account },
    })
    return { success: true, data }
  } catch (err) {
    return { success: false, error: errorMessage(err) }
  }
}
