import React from 'react'
import type { Address } from 'viem'
import type { RawCurrency } from '../../types/currency'
import type { TokenRowData } from './types'
import { TokenRow } from './TokenRow'

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
  onChange: (address: Address) => void
}

export const TokenSelectorListMode: React.FC<TokenSelectorListModeProps> = ({
  rows,
  onChange,
}) => {
  if (rows.length === 0) {
    return (
      <div className="text-center py-6 text-base-content/50 text-sm">
        No tokens found
      </div>
    )
  }

  return (
    <div className="space-y-0.5 max-h-[60vh] overflow-y-auto">
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
