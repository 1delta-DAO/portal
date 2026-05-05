import React from 'react'
import type { TradingQuote, TradingOperation } from './types'
import { Logo } from '../../../common/Logo'

interface QuoteCardProps {
  quote: TradingQuote
  index: number
  isSelected: boolean
  onClick: () => void
  operation: TradingOperation
  /** Caller-supplied input symbol — used as fallback when the quote's deltas
   *  don't include asset metadata. The quote's resolved symbol takes priority. */
  inSymbol?: string
  outSymbol?: string
  /** Best (least-negative / most-positive) priceImpactUSD across all sibling
   *  quotes, used to flag the winning route. */
  bestPriceImpactUSD?: number
}

/** Compact native-token amount: under 1k keeps decimals, otherwise K/M/B/T. */
function fmtCompact(v: number): string {
  if (!Number.isFinite(v) || v === 0) return '0'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs < 0.0001) return '<0.0001'
  if (abs < 1) return `${sign}${abs.toFixed(4)}`
  if (abs < 1_000) return `${sign}${abs.toFixed(2)}`
  if (abs < 1_000_000) return `${sign}${(abs / 1_000).toFixed(2)}K`
  if (abs < 1_000_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`
  if (abs < 1_000_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`
  return `${sign}${(abs / 1_000_000_000_000).toFixed(2)}T`
}

function fmtCompactUsd(v: number): string {
  if (!Number.isFinite(v) || v === 0) return '$0'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs < 1_000) return `${sign}$${abs.toFixed(2)}`
  if (abs < 1_000_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`
  if (abs < 1_000_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs < 1_000_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`
  return `${sign}$${(abs / 1_000_000_000_000).toFixed(2)}T`
}

function fmtFullAmount(v: number): string {
  if (!Number.isFinite(v)) return ''
  return v.toLocaleString(undefined, { maximumFractionDigits: 8 })
}

function fmtFullUsd(v: number): string {
  if (!Number.isFinite(v)) return ''
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

interface SideProps {
  amount: number
  symbol: string
  usd?: number
  logoURI?: string
  /** 'in' = error/red (giving), 'out' = success/green (receiving) */
  side: 'in' | 'out'
}

const Side: React.FC<SideProps> = ({ amount, symbol, usd, logoURI, side }) => {
  const colorClass = side === 'in' ? 'text-error' : 'text-success'
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Logo
        src={logoURI}
        alt={symbol}
        fallbackText={symbol}
        className="rounded-full object-contain w-4 h-4 shrink-0 token-logo"
      />
      <div className="min-w-0 leading-tight">
        <div
          className={`text-xs font-semibold tabular-nums truncate ${colorClass}`}
          title={`${fmtFullAmount(amount)} ${symbol}`}
        >
          {fmtCompact(amount)}
          <span className="text-base-content/60 font-normal ml-0.5">{symbol}</span>
        </div>
        {usd != null && (
          <div
            className="text-[10px] text-base-content/55 tabular-nums truncate"
            title={fmtFullUsd(usd)}
          >
            {fmtCompactUsd(usd)}
          </div>
        )}
      </div>
    </div>
  )
}

export const QuoteCard: React.FC<QuoteCardProps> = ({
  quote,
  index,
  isSelected,
  onClick,
  operation,
  inSymbol,
  outSymbol,
  bestPriceImpactUSD,
}) => {
  const resolvedInSymbol = quote.inSymbol ?? inSymbol ?? ''
  const resolvedOutSymbol = quote.outSymbol ?? outSymbol ?? ''
  const impactUsd = quote.priceImpactUSD
  const impactPct = quote.priceImpactPct

  const isBest =
    bestPriceImpactUSD != null &&
    impactUsd != null &&
    Math.abs(impactUsd - bestPriceImpactUSD) < 0.005

  const impactPositive = impactUsd != null && impactUsd >= 0
  const impactColor = impactUsd == null
    ? 'text-base-content/60'
    : impactPositive
      ? 'text-success'
      : 'text-error'

  const hasFooter =
    impactUsd != null ||
    (operation === 'Loop' &&
      (quote.positionCollateralUSD != null || quote.positionDebtUSD != null))

  return (
    <button
      type="button"
      className={`w-full text-left p-1.5 rounded-lg border transition-colors text-xs ${
        isSelected
          ? 'border-primary bg-primary/10 ring-1 ring-primary'
          : 'border-base-300 bg-base-200/50 hover:bg-base-200'
      }`}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-semibold text-sm truncate leading-none">
          {quote.aggregator || `Route ${index + 1}`}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {isBest && (
            <span
              className="text-[9px] font-bold uppercase tracking-wider text-success bg-success/15 px-1 py-0.5 rounded leading-none"
              title="Best price impact among returned quotes"
            >
              Best
            </span>
          )}
          {isSelected && (
            <span className="text-[10px] font-bold text-primary leading-none">✓</span>
          )}
        </div>
      </div>

      {/* In → Out */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1.5">
        <Side
          amount={quote.tradeAmountIn}
          symbol={resolvedInSymbol}
          usd={quote.tradeAmountInUSD}
          logoURI={quote.inLogoURI}
          side="in"
        />
        <span className="text-base-content/30 text-sm leading-none">→</span>
        <Side
          amount={quote.tradeAmountOut}
          symbol={resolvedOutSymbol}
          usd={quote.tradeAmountOutUSD}
          logoURI={quote.outLogoURI}
          side="out"
        />
      </div>

      {/* Footer: price impact + (loop) position deltas */}
      {hasFooter && (
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 mt-1.5 pt-1.5 border-t border-base-300/60 text-[10px] leading-tight">
          {impactUsd != null && (
            <div className="flex items-baseline gap-1" title={fmtFullUsd(impactUsd)}>
              <span className="text-base-content/50">Impact</span>
              <span className={`font-semibold tabular-nums ${impactColor}`}>
                {impactPositive ? '+' : ''}
                {fmtCompactUsd(impactUsd)}
              </span>
              {impactPct != null && (
                <span className={`tabular-nums ${impactColor}`}>
                  ({impactPositive ? '+' : ''}
                  {(impactPct * 100).toFixed(2)}%)
                </span>
              )}
            </div>
          )}
          {operation === 'Loop' && quote.positionCollateralUSD != null && (
            <div
              className="flex items-baseline gap-1"
              title={fmtFullUsd(quote.positionCollateralUSD)}
            >
              <span className="text-base-content/50">Δ Col</span>
              <span className="text-success font-medium tabular-nums">
                {quote.positionCollateralUSD >= 0 ? '+' : ''}
                {fmtCompactUsd(quote.positionCollateralUSD)}
              </span>
            </div>
          )}
          {operation === 'Loop' && quote.positionDebtUSD != null && (
            <div
              className="flex items-baseline gap-1"
              title={fmtFullUsd(quote.positionDebtUSD)}
            >
              <span className="text-base-content/50">Δ Debt</span>
              <span className="text-error font-medium tabular-nums">
                {quote.positionDebtUSD >= 0 ? '+' : ''}
                {fmtCompactUsd(quote.positionDebtUSD)}
              </span>
            </div>
          )}
        </div>
      )}
    </button>
  )
}
