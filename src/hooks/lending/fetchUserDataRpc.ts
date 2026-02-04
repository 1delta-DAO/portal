import { getRpcSelectorEvmClient, RpcAction } from '@1delta/lib-utils'
import type { LenderUserDataEntry } from './useUserData'

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

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: string
  error?: { code: number; message: string }
}

interface ParseApiResponse {
  ok: boolean
  data: {
    [lender: string]: LenderUserDataEntry
  }
}

// ============================================================================
// Output type (matches UserDataApiResponse['data'])
// ============================================================================

export type UserDataApiResponseData = {
  [chainId: string]: {
    [lender: string]: LenderUserDataEntry
  }
}

// ============================================================================
// Constants
// ============================================================================

const BACKEND_BASE_URL = 'https://portal.1delta.io/v1/data'

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
): Promise<UserDataApiResponseData> {
  // Step 1: Get RPC call descriptors from backend
  const rpcCallUrl =
    `${BACKEND_BASE_URL}/lending/user-positions/rpc-call` +
    `?chain=${chainId}&account=${account}&batchSize=10`

  console.log("rpcCallUrl", rpcCallUrl)  // --- IGNORE ---

  const step1Res = await fetch(rpcCallUrl)
  if (!step1Res.ok) {
    const text = await step1Res.text().catch(() => '')
    throw new Error(`rpc-call HTTP ${step1Res.status}: ${text || step1Res.statusText}`)
  }
  const step1Json = (await step1Res.json()) as RpcCallApiResponse
  if (!step1Json.ok) {
    throw new Error('rpc-call API returned ok: false')
  }

  const { rpcCallId, rpcCalls } = step1Json.data

  // Step 2: Execute JSON-RPC calls via user's own RPC provider
  const client = await getRpcSelectorEvmClient(chainId, RpcAction.MULTICALL)
  if (!client) {
    throw new Error(`No RPC client available for chain ${chainId}`)
  }

  const rpcResults = await Promise.allSettled(
    rpcCalls.map((call) =>
      client.request({
        method: call.method,
        params: call.params as any,
      })
    )
  )

  const rawResponses: JsonRpcResponse[] = rpcResults.map((settled, i) => {
    const base = { jsonrpc: '2.0' as const, id: rpcCalls[i].id }
    if (settled.status === 'fulfilled') {
      return { ...base, result: settled.value as string }
    }
    return {
      ...base,
      error: {
        code: -32000,
        message: settled.reason?.message ?? 'RPC call failed',
      },
    }
  })

  // Step 3: Send results to parse endpoint
  const parseUrl = `${BACKEND_BASE_URL}/lending/user-positions/parse`
  const step3Res = await fetch(parseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rpcCallId, rawResponses }),
  })
  if (!step3Res.ok) {
    const text = await step3Res.text().catch(() => '')
    throw new Error(`parse HTTP ${step3Res.status}: ${text || step3Res.statusText}`)
  }
  const step3Json = (await step3Res.json()) as ParseApiResponse
  if (!step3Json.ok) {
    throw new Error('parse API returned ok: false')
  }

  // Step 4: Normalize flat-by-lender response to { [chainId]: { [lender]: ... } }
  const normalized: UserDataApiResponseData = {}
  for (const [lender, entry] of Object.entries(step3Json.data)) {
    const cId = entry.chainId || chainId
    if (!normalized[cId]) normalized[cId] = {}
    normalized[cId][lender] = entry
  }

  return normalized
}
