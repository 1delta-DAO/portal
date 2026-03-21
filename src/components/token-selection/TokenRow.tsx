import React from 'react'
import type { RawCurrency } from '../../types/currency'

interface TokenRowProps {
  token: RawCurrency
  balanceAmount: number
  usdValue: number
  price: number
  isSelected: boolean
  onClick: () => void
}

function fmtBalance(v: number): string {
  if (v === 0) return '0'
  if (v < 0.0001) return '<0.0001'
  if (v < 1) return v.toFixed(6)
  if (v < 1000) return v.toFixed(4)
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function fmtUsd(v: number): string {
  if (v === 0) return ''
  if (v < 0.01) return '<$0.01'
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

export const TokenRow: React.FC<TokenRowProps> = ({
  token,
  balanceAmount,
  usdValue,
  isSelected,
  onClick,
}) => (
  <button
    type="button"
    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
      isSelected
        ? 'bg-primary/10 border border-primary'
        : 'hover:bg-base-200 border border-transparent'
    }`}
    onClick={onClick}
  >
    <img
      src={token.logoURI}
      alt={token.symbol}
      className="w-8 h-8 rounded-full object-contain shrink-0"
      onError={(e) => {
        ;(e.target as HTMLImageElement).style.display = 'none'
      }}
    />
    <div className="flex flex-col items-start min-w-0 flex-1">
      <span className="font-medium text-sm truncate">{token.symbol}</span>
      <span className="text-xs text-base-content/50 truncate">{token.name}</span>
    </div>
    {balanceAmount > 0 && (
      <div className="flex flex-col items-end shrink-0">
        <span className="text-sm font-medium">{fmtBalance(balanceAmount)}</span>
        {usdValue > 0 && (
          <span className="text-xs text-base-content/50">{fmtUsd(usdValue)}</span>
        )}
      </div>
    )}
  </button>
)
