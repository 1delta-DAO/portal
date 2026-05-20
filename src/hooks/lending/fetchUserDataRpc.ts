import type { RawLenderUserDataEntry, UserDataSummary } from './useUserData'
import { executeRpcCallsWithRetry, type RpcCall } from './executeRpcCalls'

// ============================================================================
// Types for the rpc-call endpoint
// ============================================================================

interface RpcCallApiResponse {
  success: boolean
  data: {
    rpcCallId: string
    rpcCalls: RpcCall[]
  }
  error?: { code: string; message: string }
}

// ============================================================================
// Types for the parse endpoint
// ============================================================================

interface ParseApiResponse {
  success: boolean
  data: {
    items: RawLenderUserDataEntry[]
    summary: UserDataSummary
  }
  error?: { code: string; message: string }
}

// ============================================================================
// Output type
// ============================================================================

export type UserDataApiResponseData = RawLenderUserDataEntry[]

export interface FetchUserDataResult {
  data: RawLenderUserDataEntry[]
  summary: UserDataSummary
}

// ============================================================================
// Constants
// ============================================================================

import { BACKEND_BASE_URL } from '../../config/backend'

// ============================================================================
// Helpers
// ============================================================================

async function fetchApi<T extends { success: boolean; error?: { code: string; message: string } }>(
  label: string,
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${label} HTTP ${res.status}: ${text || res.statusText}`)
  }
  const json = (await res.json()) as T
  if (!json.success) {
    throw new Error(json.error?.message ?? `${label} API returned success: false`)
  }
  return json
}

// ============================================================================
// Main function
// ============================================================================

/**
 * Fetches user lending data via the three-step RPC flow:
 * 1. GET /lending/user-positions/rpc-call → call descriptors ({ chainId, call })
 * 2. Execute each call as eth_call via user's RPC provider
 * 3. POST /lending/user-positions/parse → structured user data
 */
export async function fetchUserDataViaRpc(
  chainId: string,
  account: string,
  lenders?: string[]
): Promise<FetchUserDataResult> {
  // Step 1: Get RPC call descriptors from backend
  // Smaller batches on chains with many lenders / flaky RPCs
  const SMALL_BATCH_CHAINS = new Set(['1', '8453', '42161'])
  const batches = SMALL_BATCH_CHAINS.has(chainId) ? `&batchSize=500` : ''
  const lendersParam = lenders && lenders.length > 0 ? `&lenders=${lenders.join(',')}` : ''
  const rpcCallUrl =
    `${BACKEND_BASE_URL}/v1/data/lending/user-positions/rpc-call` +
    `?chains=${chainId}&account=${account}${batches}${lendersParam}`

  const {
    data: { rpcCallId, rpcCalls },
  } = await fetchApi<RpcCallApiResponse>('rpc-call', rpcCallUrl)

  // Step 2: Execute each call as eth_call via user's own RPC provider
  const rawResponses = await executeRpcCallsWithRetry(chainId, rpcCalls)

  // Step 3: Send results to parse endpoint
  const parseUrl = `${BACKEND_BASE_URL}/v1/data/lending/user-positions/parse`
  const parseResult = await fetchApi<ParseApiResponse>('parse', parseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rpcCallId, rawResponses }),
  })

  return { data: parseResult.data.items, summary: parseResult.data.summary }
}
