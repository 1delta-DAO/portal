import { getRpcUrlByIndex } from '../../lib/lib-utils'

// New format: { chainId, call: { to, data } }
interface RpcCallDescriptor {
  chainId: string
  call: { to: string; data: string }
}

// Old format: full JSON-RPC object
interface JsonRpcCall {
  jsonrpc: '2.0'
  id: number
  method: 'eth_call'
  params: unknown[]
}

export type RpcCall = RpcCallDescriptor | JsonRpcCall

export interface RawRpcResponse {
  chainId: string
  result: string
}

function isJsonRpcCall(obj: any): obj is JsonRpcCall {
  return obj && typeof obj === 'object' && 'method' in obj && obj.method === 'eth_call'
}

/**
 * Resolve the RPC body from whatever format the backend returns:
 *  - Pure JSON-RPC: { jsonrpc, id, method, params }            → send as-is
 *  - Descriptor with JSON-RPC call: { chainId, call: {jsonrpc…} } → unwrap call
 *  - Descriptor with plain call:    { chainId, call: {to, data} } → wrap in eth_call
 */
function toRpcBody(call: RpcCall): object {
  if (isJsonRpcCall(call)) return call
  if (isJsonRpcCall(call.call)) return call.call
  return { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [call.call, 'latest'] }
}

async function executeCall(
  rpcUrl: string,
  call: RpcCall,
  chainId: string,
  maxRetries = 3,
  initialDelayMs = 1000
): Promise<RawRpcResponse> {
  let lastError: Error | null = null

  const body = toRpcBody(call)
  const responseChainId = isJsonRpcCall(call) ? chainId : call.chainId

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Raw `fetch`, not `sdk/http.ts`: this talks JSON-RPC to a chain node,
      // not to the 1delta backend, so it has no `{ success, data }` envelope
      // and must not carry backend headers.
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (response.status === 429 || response.status >= 500) {
        const delayMs = initialDelayMs * Math.pow(2, attempt)
        console.log(
          `RPC call returned ${response.status}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries + 1})`
        )
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        continue
      }

      if (!response.ok) {
        throw new Error(`RPC call failed: ${response.statusText}`)
      }

      const result: any = await response.json()
      if (result.error) {
        throw new Error(`RPC error: ${result.error.message}`)
      }
      return { chainId: responseChainId, result: result.result }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < maxRetries) {
        const delayMs = initialDelayMs * Math.pow(2, attempt)
        console.log(
          `RPC call error: ${lastError.message}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries + 1})`
        )
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }

  throw lastError || new Error('RPC call failed after all retries')
}

/**
 * Group prepared calls by the chain they target.
 *
 * The prepare endpoints return a flat `rpcCalls` array covering every
 * requested chain (one entry per chain for balances, potentially many per
 * chain for batched user positions), each tagged with its `chainId`. Legacy
 * bare JSON-RPC entries carry no chain, so they fall back to `defaultChainId`.
 */
export function groupCallsByChain(
  rpcCalls: RpcCall[],
  defaultChainId: string
): Map<string, RpcCall[]> {
  const byChain = new Map<string, RpcCall[]>()
  for (const call of rpcCalls) {
    const chainId = isJsonRpcCall(call) ? defaultChainId : String(call.chainId ?? defaultChainId)
    const existing = byChain.get(chainId)
    if (existing) existing.push(call)
    else byChain.set(chainId, [call])
  }
  return byChain
}

export interface MultiChainRpcResult {
  rawResponses: RawRpcResponse[]
  /** Chains whose RPCs all failed — their data is simply absent. */
  missingChains: string[]
}

/**
 * Execute prepared calls across several chains in parallel, tolerating
 * per-chain failure.
 *
 * A single unreachable chain must not take down a multi-chain view, so each
 * chain's batch is settled independently and failures are reported rather than
 * thrown. Throws only when every chain failed, since an empty result would
 * otherwise be indistinguishable from "this account holds nothing".
 */
export async function executeRpcCallsMultiChain(
  rpcCalls: RpcCall[],
  defaultChainId: string,
  maxRetries = 5,
  initialDelayMs = 1000
): Promise<MultiChainRpcResult> {
  const byChain = groupCallsByChain(rpcCalls, defaultChainId)

  const settled = await Promise.allSettled(
    [...byChain.entries()].map(async ([chainId, calls]) => ({
      chainId,
      responses: await executeRpcCallsWithRetry(chainId, calls, maxRetries, initialDelayMs),
    }))
  )

  const rawResponses: RawRpcResponse[] = []
  const missingChains: string[] = []
  settled.forEach((s, i) => {
    const chainId = [...byChain.keys()][i]
    if (s.status === 'fulfilled') rawResponses.push(...s.value.responses)
    else missingChains.push(chainId)
  })

  if (rawResponses.length === 0) {
    throw new Error(`All chain RPCs failed (${missingChains.join(', ') || defaultChainId})`)
  }

  return { rawResponses, missingChains }
}

export async function executeRpcCallsWithRetry(
  chainId: string,
  rpcCalls: RpcCall[],
  maxRetries = 5,
  initialDelayMs = 1000
): Promise<RawRpcResponse[]> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const rpcUrl = getRpcUrlByIndex(chainId, i)
      console.log(`Using RPC URL for chain ${chainId}, index ${i}: ${rpcUrl}`)

      const rawResponses = await Promise.all(
        rpcCalls.map((call) => executeCall(rpcUrl, call, chainId, 1, initialDelayMs))
      )

      return rawResponses
    } catch (e) {
      console.error(`Error executing RPC calls for chain ${chainId} (attempt ${i + 1}):`, e)
    }
  }
  throw new Error(`Failed to execute RPC calls after ${maxRetries} attempts`)
}
