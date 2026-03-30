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

function fmtPrice(v: number): string {
  if (v >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  if (v >= 1) return `$${v.toFixed(2)}`
  if (v >= 0.01) return `$${v.toFixed(4)}`
  return `$${v.toPrecision(3)}`
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
  price,
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
      <div className="flex items-center gap-1.5">
        <span className="font-medium text-sm truncate">{token.symbol}</span>
        {price > 0 && (
          <span className="text-[11px] text-base-content/40">{fmtPrice(price)}</span>
        )}
      </div>
      <span className="text-xs text-base-content/50 truncate">{token.name}</span>
      <span
        className="text-[10px] text-base-content/30 font-mono truncate inline-flex items-center gap-0.5 hover:text-base-content/50"
        onClick={(e) => {
          e.stopPropagation()
          navigator.clipboard.writeText(token.address)
        }}
        title="Copy address"
      >
        {token.address.slice(0, 6)}...{token.address.slice(-4)}
        <svg className="w-2.5 h-2.5 inline-block shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </span>
    </div>
    <div className="flex flex-col items-end shrink-0">
      {balanceAmount > 0 && (
        <span className="text-sm font-medium">{fmtBalance(balanceAmount)}</span>
      )}
      {usdValue > 0 && (
        <span className="text-xs text-base-content/50">{fmtUsd(usdValue)}</span>
      )}
    </div>
  </button>
)
