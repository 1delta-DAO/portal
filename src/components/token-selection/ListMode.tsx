import React from 'react'
import type { Address } from 'viem'
import type { RawCurrency } from '../../types/currency'
import type { TokenRowData } from './types'
import { TokenRow } from './TokenRow'
import { Spinner } from '../common/Loader'

interface TokenSelectorListModeProps {
  chainId: string
  chains: Record<string, any>
  relevant: Address[]
  rows: TokenRowData[]
  tokensMap: Record<string, RawCurrency>
  balances: any
  prices: any
  balancesLoading: boolean
  pricesLoading: boolean
  userAddress?: string
  listsLoading?: boolean
  /** An address is being resolved on-chain because no list carries it. */
  resolvingToken?: boolean
  /** The current query is a well-formed address. */
  queryIsAddress?: boolean
  onChange: (address: Address) => void
}

export const TokenSelectorListMode: React.FC<TokenSelectorListModeProps> = ({
  rows,
  listsLoading,
  resolvingToken,
  queryIsAddress,
  onChange,
}) => {
  // A chain whose list is still being fetched has no rows yet — saying "no
  // tokens found" there reads as an empty chain rather than a pending one.
  if (listsLoading && rows.length === 0) {
    return (
      <div className="flex justify-center py-6">
        <Spinner size="sm" />
      </div>
    )
  }

  // A pasted address is still being read off the chain — not an empty result.
  if (resolvingToken && rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6">
        <Spinner size="sm" />
        <span className="text-xs text-base-content/50">Looking up token…</span>
      </div>
    )
  }

  if (rows.length === 0) {
    // "No tokens found" for a well-formed address reads as "we do not support
    // this token", when what actually happened is that nothing at that address
    // answers as an ERC-20 on this chain — usually a wrong-chain paste.
    return (
      <div className="text-center py-6 text-base-content/50 text-sm">
        {queryIsAddress ? 'No token at this address on this chain' : 'No tokens found'}
      </div>
    )
  }

  return (
    <div className="space-y-0.5 max-h-[60dvh] overflow-y-auto overflow-x-hidden min-w-0">
      {rows.map((row) => (
        <TokenRow
          key={row.addr}
          token={row.token}
          balanceAmount={row.balanceAmount}
          usdValue={row.usdValue}
          price={row.price}
          isSelected={false}
          onClick={() => onChange(row.addr as Address)}
        />
      ))}
    </div>
  )
}
