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
