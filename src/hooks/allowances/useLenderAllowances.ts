import { parseLenderDebitResult, prepareLenderDebitMulticall } from '@1delta/calldata-sdk'
import { Lender } from '@1delta/lender-registry'
import { getBestRpcsForChain } from '@1delta/lib-utils'
import { multicallRetryUniversal } from '@1delta/providers'
import { useQuery } from '@tanstack/react-query'

function createLenderDebitQueryFn(params: {
  chainId: string
  lenders: Lender[]
  account: string
  subAccount: string
  tokenAddressesByLender: Record<Lender, (string | undefined)[]>
  spender: string
}) {
  const { chainId, lenders, account, subAccount, tokenAddressesByLender, spender } = params

  return async () => {
    const prep = prepareLenderDebitMulticall({
      chainId,
      account,
      subAccount,
      lenders,
      tokenAddressesByLender,
      spender,
    })

    const rpc = await getBestRpcsForChain(chainId)
    const overrides = rpc && rpc.length > 0 ? { [chainId]: rpc } : undefined

    const raw = await multicallRetryUniversal({
      chain: chainId,
      calls: prep.calls,
      abi: prep.abi,
      allowFailure: true,
      maxRetries: 3,
      ...(overrides && { overrides }),
    })

    return parseLenderDebitResult({
      metadata: prep.meta.metadata,
      raw,
      chainId,
    })
  }
}

/** Get lender allowance info (incl permit datas) */
export function useLenderDebitQuery(params: {
  chainId: string
  lenders: Lender[]
  account: string
  subAccount: string
  tokenAddressesByLender: Record<Lender, (string | undefined)[]>
  spender: string
  enabled?: boolean
}) {
  const {
    chainId,
    lenders,
    account,
    subAccount,
    tokenAddressesByLender,
    spender,
    enabled = true,
  } = params

  return useQuery({
    queryKey: ['lender-debit', chainId, lenders, account, subAccount, tokenAddressesByLender],
    queryFn: createLenderDebitQueryFn({
      chainId,
      lenders,
      account,
      subAccount,
      tokenAddressesByLender,
      spender,
    }),
    enabled: Boolean(enabled && chainId && lenders.length > 0 && account),
    staleTime: 20_000,
  })
}
