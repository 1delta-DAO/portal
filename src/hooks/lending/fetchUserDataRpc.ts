import type {
  RawLenderUserDataEntry,
  UserDataSummary,
} from '../../sdk/lending-helper/userPositionTypes'
import { executeRpcCallsMultiChain, type RpcCall } from './executeRpcCalls'

// ============================================================================
// Types for the rpc-call endpoint
// ============================================================================

interface RpcCallData {
  rpcCallId: string
  rpcCalls: RpcCall[]
}

// ============================================================================
// Types for the parse endpoint
// ============================================================================

interface ParseData {
  items: RawLenderUserDataEntry[]
  summary: UserDataSummary
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

import { apiFetch } from '../../sdk/http'

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
  const { rpcCallId, rpcCalls } = await apiFetch<RpcCallData>(
    '/v1/data/lending/user-positions/rpc-call',
    {
      params: {
        chains: chains.join(','),
        account,
        // Chains whose public RPCs choke on large multicalls get a smaller batch.
        batchSize: chains.some((c) => SMALL_BATCH_CHAINS.has(c)) ? 500 : undefined,
        lenders: lenders?.length ? lenders.join(',') : undefined,
      },
    }
  )

  // Step 2: Execute each call as eth_call via the user's own RPC provider,
  // grouped per chain so one dead RPC only costs that chain.
  const { rawResponses, missingChains } = await executeRpcCallsMultiChain(rpcCalls, chains[0])

  // Step 3: Send results to parse endpoint
  const parsed = await apiFetch<ParseData>('/v1/data/lending/user-positions/parse', {
    body: { rpcCallId, rawResponses },
  })

  return { data: parsed.items, summary: parsed.summary, missingChains }
}
