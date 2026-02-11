import type { LenderUserDataEntry, UserDataSummary } from './useUserData'
import { executeRpcCallsWithRetry } from './executeRpcCalls'

// ============================================================================
// Types for the rpc-call endpoint
// ============================================================================

interface JsonRpcCall {
  jsonrpc: '2.0'
  id: number
  method: 'eth_call'
  params: unknown[]
}

interface RpcCallApiResponse {
  ok: boolean
  data: {
    rpcCallId: string
    rpcCalls: JsonRpcCall[]
  }
}

// ============================================================================
// Types for the parse endpoint
// ============================================================================

interface ParseApiResponse {
  ok: boolean
  data: LenderUserDataEntry[]
  summary: UserDataSummary
}

// ============================================================================
// Output type
// ============================================================================

export type UserDataApiResponseData = LenderUserDataEntry[]

export interface FetchUserDataResult {
  data: LenderUserDataEntry[]
  summary: UserDataSummary
}

// ============================================================================
// Constants
// ============================================================================

import { BACKEND_BASE_URL } from '../../config/backend'

// ============================================================================
// Helpers
// ============================================================================

async function fetchApi<T extends { ok: boolean }>(
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
  if (!json.ok) {
    throw new Error(`${label} API returned ok: false`)
  }
  return json
}

// ============================================================================
// Main function
// ============================================================================

/**
 * Fetches user lending data via the three-step RPC flow:
 * 1. GET /lending/user-positions/rpc-call → JSON-RPC call descriptors
 * 2. Execute calls via user's RPC provider
 * 3. POST /lending/user-positions/parse → structured user data
 */
export async function fetchUserDataViaRpc(
  chainId: string,
  account: string
): Promise<FetchUserDataResult> {
  // Step 1: Get RPC call descriptors from backend
  const rpcCallUrl =
    `${BACKEND_BASE_URL}/v1/data/lending/user-positions/rpc-call` +
    `?chain=${chainId}&account=${account}`

  const {
    data: { rpcCallId, rpcCalls },
  } = await fetchApi<RpcCallApiResponse>('rpc-call', rpcCallUrl)

  // Step 2: Execute JSON-RPC calls via user's own RPC provider
  const rawResponses = await executeRpcCallsWithRetry(chainId, rpcCalls)

  // Step 3: Send results to parse endpoint
  const parseUrl = `${BACKEND_BASE_URL}/v1/data/lending/user-positions/parse`
  const { data, summary } = await fetchApi<ParseApiResponse>('parse', parseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rpcCallId, rawResponses }),
  })

  return { data, summary }
}
