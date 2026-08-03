import type { RawLenderUserDataEntry, UserDataSummary } from './useUserData'
import { executeRpcCallsMultiChain, type RpcCall } from './executeRpcCalls'

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
  /** Chains whose RPCs failed — their positions are absent from `data`. */
  missingChains: string[]
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
 * Chains whose lender count / RPC reliability warrants splitting the multicall
 * into smaller batches.
 */
const SMALL_BATCH_CHAINS = new Set(['1', '8453', '42161'])

/**
 * Fetches user lending data via the three-step RPC flow:
 * 1. GET /lending/user-positions/rpc-call → call descriptors ({ chainId, call })
 * 2. Execute each call as eth_call via the user's RPC provider
 * 3. POST /lending/user-positions/parse → structured user data
 *
 * Multi-chain by design: the prepare endpoint takes a `chains` CSV and returns
 * calls tagged per chain, which are then executed per chain in parallel. A
 * chain whose RPCs are down is reported in `missingChains` rather than failing
 * the whole read.
 *
 * Note the prepare endpoint's parameter is `chains` (plural) even for one
 * chain — the published OpenAPI spec documents a singular `chain`, but the
 * live API rejects that with "Missing required parameter: chains".
 */
export async function fetchUserDataViaRpc(
  chainIds: string | string[],
  account: string,
  lenders?: string[]
): Promise<FetchUserDataResult> {
  const chains = Array.isArray(chainIds) ? chainIds : [chainIds]
  if (chains.length === 0) throw new Error('fetchUserDataViaRpc: no chains requested')

  // Step 1: Get RPC call descriptors from backend
  const batches = chains.some((c) => SMALL_BATCH_CHAINS.has(c)) ? `&batchSize=500` : ''
  const lendersParam = lenders && lenders.length > 0 ? `&lenders=${lenders.join(',')}` : ''
  const rpcCallUrl =
    `${BACKEND_BASE_URL}/v1/data/lending/user-positions/rpc-call` +
    `?chains=${chains.join(',')}&account=${account}${batches}${lendersParam}`

  const {
    data: { rpcCallId, rpcCalls },
  } = await fetchApi<RpcCallApiResponse>('rpc-call', rpcCallUrl)

  // Step 2: Execute each call as eth_call via the user's own RPC provider,
  // grouped per chain so one dead RPC only costs that chain.
  const { rawResponses, missingChains } = await executeRpcCallsMultiChain(rpcCalls, chains[0])

  // Step 3: Send results to parse endpoint
  const parseUrl = `${BACKEND_BASE_URL}/v1/data/lending/user-positions/parse`
  const parseResult = await fetchApi<ParseApiResponse>('parse', parseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rpcCallId, rawResponses }),
  })

  return { data: parseResult.data.items, summary: parseResult.data.summary, missingChains }
}
