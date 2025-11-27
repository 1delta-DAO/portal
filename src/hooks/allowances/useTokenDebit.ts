import {
  prepareDebitDataMulticall,
  parseDebitDataResult,
  type DebitData,
} from '@1delta/calldata-sdk'
import { getBestRpcsForChain } from '@1delta/lib-utils'
import { multicallRetryUniversal } from '@1delta/providers'
import { useQuery } from '@tanstack/react-query'

function createDebitQueryFn(params: {
  chainId: string
  tokenAddresses: string[]
  account: string
  spenders: string[]
  allTokenLists: any
}) {
  const { chainId, tokenAddresses, account, spenders, allTokenLists } = params

  return async (): Promise<Record<string, DebitData>> => {
    // Build calldata
    const prep = prepareDebitDataMulticall({
      chainId,
      tokenAddresses,
      account,
      spenders,
    })

    // RPC source selection
    const rpcFromRpcSelector = await getBestRpcsForChain(chainId)
    const overrides =
      rpcFromRpcSelector && rpcFromRpcSelector.length > 0
        ? { [chainId]: rpcFromRpcSelector }
        : undefined

    // Execute multicall
    const raw = await multicallRetryUniversal({
      chain: chainId,
      calls: prep.calls,
      abi: prep.abi,
      maxRetries: 3,
      allowFailure: true,
      ...(overrides && { overrides }),
    })

    // Parse result
    return parseDebitDataResult({
      raw,
      tokenAddresses,
      spenders,
      tokenListForChain: allTokenLists[chainId],
    })
  }
}

interface UseDebitQueryParams {
  chainId: string
  tokenAddresses: string[]
  account: string
  spenders: string[]
  allTokenLists: any
  enabled?: boolean
  refetchInterval?: number | false
}

/** Get token allowance info (incl permit datas) */
export function useDebitQuery({
  chainId,
  tokenAddresses,
  account,
  spenders,
  allTokenLists,
  enabled = true,
  refetchInterval = false,
}: UseDebitQueryParams) {
  return useQuery<Record<string, DebitData>>({
    queryKey: ['debit-data', chainId, tokenAddresses, account, spenders],
    queryFn: createDebitQueryFn({
      chainId,
      tokenAddresses,
      account,
      spenders,
      allTokenLists,
    }),
    enabled: enabled && Boolean(chainId) && tokenAddresses.length > 0 && Boolean(account),
    refetchInterval,
    staleTime: 20_000, // optional tuning
    gcTime: 5 * 60_000,
  })
}
