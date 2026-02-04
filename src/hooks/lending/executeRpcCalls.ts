import { getRpcUrlByIndex } from "@1delta/lib-utils"

export interface RawRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: string
  error?: {
    code: number
    message: string
  }
}

// Helper to execute raw RPC calls with retry logic (now expects single multicall per batch)
async function executeRpcCalls(
  rpcUrl: string,
  rpcCalls: any[],
  maxRetries = 3,
  initialDelayMs = 1000,
): Promise<RawRpcResponse[]> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rpcCalls),
      })

      // Retry on rate limiting or server errors
      if (response.status === 429 || response.status >= 500) {
        const delayMs = initialDelayMs * Math.pow(2, attempt)
        console.log(
          `RPC call returned ${response.status}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries + 1})`,
        )
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        continue
      }

      if (!response.ok) {
        throw new Error(`RPC call failed: ${response.statusText}`)
      }

      const result: any = await response.json()
      // Handle case where single RPC call returns object instead of array
      return Array.isArray(result) ? result : [result]
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Don't retry on the last attempt
      if (attempt < maxRetries) {
        const delayMs = initialDelayMs * Math.pow(2, attempt)
        console.log(
          `RPC call error: ${lastError.message}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries + 1})`,
        )
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }

  throw lastError || new Error('RPC call failed after all retries')
}

export async function executeRpcCallsWithRetry(
  chainId: string,
  rpcCalls: any[],
  maxRetries = 5,
  initialDelayMs = 1000,
): Promise<RawRpcResponse[]> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const rpc = getRpcUrlByIndex(chainId, i)
      console.log(`Using RPC URL for chain ${chainId}, index ${i}: ${rpc}`)

      const result = await executeRpcCalls(rpc, rpcCalls, 1, initialDelayMs)

      if (result[0]?.error) {
        console.error(`RPC call returned error:`, result[0].error)
        continue
      }

      return result
    } catch (e) {
      console.error(`Error getting RPC URL for chain ${chainId}:`, e)
    }
  }
  throw new Error(`Failed to execute RPC calls after ${maxRetries} attempts`)
}