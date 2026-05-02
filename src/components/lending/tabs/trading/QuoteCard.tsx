import React from 'react'
import type { TradingQuote, TradingOperation } from './types'

interface QuoteCardProps {
  quote: TradingQuote
  index: number
  isSelected: boolean
  onClick: () => void
  operation: TradingOperation
  inSymbol?: string
  outSymbol?: string
}

function fmtAmount(v: number) {
  if (!Number.isFinite(v) || v === 0) return '0'
  if (v < 0.0001) return '<0.0001'
  if (v < 1) return v.toFixed(6)
  if (v < 1000) return v.toFixed(4)
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function fmtUsd(v: number) {
  if (!Number.isFinite(v) || v === 0) return '$0'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(2)}`
}

export const QuoteCard: React.FC<QuoteCardProps> = ({
  quote,
  index,
  isSelected,
  onClick,
  operation,
  inSymbol,
  outSymbol,
}) => (
  <button
    type="button"
    className={`w-full text-left p-2 rounded-lg border transition-colors text-xs ${
      isSelected
        ? 'border-primary bg-primary/10'
        : 'border-base-300 bg-base-200/50 hover:bg-base-200'
    }`}
    onClick={onClick}
  >
    <div className="flex items-center justify-between mb-1">
      <span className="font-semibold">{quote.aggregator || `Route ${index + 1}`}</span>
    </div>
    <div className="flex gap-3 text-base-content/70">
      <span>In: <span className="font-medium text-error">{fmtAmount(quote.tradeAmountIn)} {inSymbol}</span></span>
      <span>Out: <span className="font-medium text-success">{fmtAmount(quote.tradeAmountOut)} {outSymbol}</span></span>
    </div>
    {operation === 'Loop' && quote.positionCollateralUSD != null && (
      <div className="flex gap-3 text-base-content/50 mt-0.5">
        <span>Col: {fmtUsd(quote.positionCollateralUSD)}</span>
        {quote.positionDebtUSD != null && <span>Debt: {fmtUsd(quote.positionDebtUSD)}</span>}
      </div>
    )}
  </button>
)
