import React from 'react'
import type { TradingQuote, TradingOperation, QuoteMarketRole } from './types'
import type { RateImpactEntry } from '../../../../sdk/lending-helper/fetchLendingAction'
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
  /** marketUid → role map. When set, each rateImpact entry renders the rate
   *  matching its market's role (debt → borrow APR, collateral → deposit APR). */
  marketRoles?: Record<string, QuoteMarketRole>
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

function fmtRatePct(v: number): string {
  if (!Number.isFinite(v)) return '—'
  return `${v.toFixed(2)}%`
}

/** Signed compact USD, e.g. "+$6.69K" / "−$446". */
function fmtSignedCompactUsd(v: number): string {
  return `${v < 0 ? '−' : '+'}${fmtCompactUsd(Math.abs(v))}`
}

/**
 * Post-trade effective rate (percent) for one side of the trade.
 * `noRwd` = base(projected) + intrinsic — the market-table headline;
 * `total` additionally counts rewards (earned on deposits, rebated on borrows).
 */
function postTradeRate(
  entry: RateImpactEntry,
  role: QuoteMarketRole,
  side: 'deposit' | 'borrow'
): { total: number; noRwd: number; rwd: number } | null {
  const r = side === 'borrow' ? entry.borrowRate : entry.depositRate
  const projected = Number(r?.projected)
  const base = Number.isFinite(projected) ? projected : Number(r?.current)
  if (!Number.isFinite(base)) return null
  const iy = Number.isFinite(role.intrinsicYield) ? role.intrinsicYield! : 0
  const rwd = Number.isFinite(role.rewardApr) ? role.rewardApr! : 0
  const noRwd = base + iy
  return { total: side === 'borrow' ? noRwd - rwd : noRwd + rwd, noRwd, rwd }
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
            className="text-[10px] text-base-content/50 tabular-nums truncate"
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
  marketRoles,
}) => {
  const resolvedInSymbol = quote.inSymbol ?? inSymbol ?? ''
  const resolvedOutSymbol = quote.outSymbol ?? outSymbol ?? ''
  const impactUsd = quote.priceImpactUSD
  const impactPct = quote.priceImpactPct

  // Rate impact entries with a known market role — the role picks which side
  // (borrow vs deposit APR) is relevant on this market for the operation.
  const rateEntries = (() => {
    if (!marketRoles) return []
    const entries = (quote.rateImpact ?? [])
      .filter((e): e is RateImpactEntry => e != null)
      .flatMap((e) => {
        const role = marketRoles[e.marketUid]
        return role ? [{ entry: e, role }] : []
      })
    // Markets the backend has no IRM item for (no utilization curve to shift —
    // e.g. Compound V3 Comet collateral, fixed-rate lenders): synthesize a
    // flat current=projected entry from the pool's own rates. The trade can't
    // move a rate that has no curve, so a zero-shift BASE entry is exact — and
    // the asset's intrinsic yield + rewards still land via the role, so a
    // 0%-base leg is never dropped.
    const covered = new Set(entries.map((x) => x.entry.marketUid))
    for (const [uid, role] of Object.entries(marketRoles)) {
      if (covered.has(uid)) continue
      const flat = (v: number | undefined) => {
        const n = Number.isFinite(v) ? v! : 0
        return { current: n, projected: n }
      }
      entries.push({
        entry: {
          marketUid: uid,
          depositRate: flat(role.depositRatePct),
          borrowRate: flat(role.borrowRatePct),
          utilization: { current: Number.NaN, projected: Number.NaN },
        },
        role,
      })
    }
    return entries
  })()

  // Net APR of this trade at post-trade rates: every leg weighted by its own
  // USD delta (works for all four ops — same-role swaps included). Expressed
  // on the net equity contributed (≈ margin); when no meaningful equity is
  // added (pure leverage, swaps) only the $/yr carry change is shown.
  const netLegs = rateEntries.flatMap(({ entry, role }) => {
    const delta = quote.positionDeltas?.find((d) =>
      role.assetAddress && d.assetAddress
        ? d.assetAddress.toLowerCase() === role.assetAddress.toLowerCase()
        : d.symbol != null && d.symbol === role.symbol
    )
    if (!delta || !Number.isFinite(delta.amountUSD)) return []
    const side = role.role === 'debt' ? ('borrow' as const) : ('deposit' as const)
    const rate = postTradeRate(entry, role, side)
    if (!rate) return []
    const sign = role.role === 'debt' ? -1 : 1
    return [
      {
        role,
        side,
        usd: delta.amountUSD,
        rate,
        annual: (sign * delta.amountUSD * rate.total) / 100,
        annualNoRwd: (sign * delta.amountUSD * rate.noRwd) / 100,
      },
    ]
  })

  const netApr = (() => {
    if (!netLegs.length) return null
    const annualUsd = netLegs.reduce((s, l) => s + l.annual, 0)
    const annualUsdNoRwd = netLegs.reduce((s, l) => s + l.annualNoRwd, 0)
    const equity = netLegs.reduce((s, l) => s + (l.side === 'borrow' ? -l.usd : l.usd), 0)
    const maxLeg = Math.max(...netLegs.map((l) => Math.abs(l.usd)))
    // Percent basis: the equity contributed (≈ margin) when meaningful;
    // otherwise (pure leverage, swaps — no net equity added) the position
    // size moved, so the chip can always show a rate, not just $/yr.
    const hasEquity = equity > Math.max(maxLeg * 0.02, 1)
    const basis = hasEquity ? equity : maxLeg
    const aprPct = basis > 1 ? (annualUsd / basis) * 100 : null
    const aprPctNoRwd = basis > 1 ? (annualUsdNoRwd / basis) * 100 : null
    return { annualUsd, annualUsdNoRwd, equity, hasEquity, basis, aprPct, aprPctNoRwd }
  })()

  const netAprTitle = netApr
    ? (() => {
        const lines = ['Projected annual carry at post-trade rates:']
        for (const l of netLegs)
          lines.push(
            `${l.role.symbol ?? (l.side === 'borrow' ? 'Debt' : 'Collateral')} ${l.side === 'borrow' ? 'borrow' : 'deposit'}: ${fmtSignedCompactUsd(l.usd)} × ${fmtRatePct(l.rate.total)} = ${fmtSignedCompactUsd(l.annual)}/yr`
          )
        lines.push(
          netApr.aprPct == null
            ? `Net: ${fmtSignedCompactUsd(netApr.annualUsd)}/yr`
            : netApr.hasEquity
              ? `Net: ${fmtSignedCompactUsd(netApr.annualUsd)}/yr on ${fmtCompactUsd(netApr.equity)} equity = ${fmtRatePct(netApr.aprPct)} APR`
              : `Net: ${fmtSignedCompactUsd(netApr.annualUsd)}/yr on ${fmtCompactUsd(netApr.basis)} position = ${fmtRatePct(netApr.aprPct)} APR (no net equity added — rate on position size)`
        )
        lines.push('Rates incl. intrinsic yield & rewards.')
        if (netLegs.some((l) => l.rate.rwd > 0.005))
          lines.push(
            netApr.aprPctNoRwd != null
              ? `Excl. rewards: ${fmtRatePct(netApr.aprPctNoRwd)} APR`
              : `Excl. rewards: ${fmtSignedCompactUsd(netApr.annualUsdNoRwd)}/yr`
          )
        return lines.join('\n')
      })()
    : undefined

  const isBest =
    bestPriceImpactUSD != null &&
    impactUsd != null &&
    Math.abs(impactUsd - bestPriceImpactUSD) < 0.005

  const impactPositive = impactUsd != null && impactUsd >= 0
  const impactColor =
    impactUsd == null ? 'text-base-content/60' : impactPositive ? 'text-success' : 'text-error'

  // Hover breakdown for the Impact figure — the position deltas moved here
  // from the visible footer to keep the card to one clean line per concern.
  const fmtSignedFullUsd = (v: number) => `${v < 0 ? '−' : '+'}${fmtFullUsd(Math.abs(v))}`
  const impactTitle = (() => {
    if (impactUsd == null) return undefined
    const lines = [`Net value gained vs. contributed: ${fmtSignedFullUsd(impactUsd)}`]
    if (operation === 'Loop') {
      if (quote.positionCollateralUSD != null)
        lines.push(`Δ Collateral: ${fmtSignedFullUsd(quote.positionCollateralUSD)}`)
      if (quote.positionDebtUSD != null)
        lines.push(`Δ Debt: ${fmtSignedFullUsd(quote.positionDebtUSD)}`)
      if (quote.positionCollateralUSD != null && quote.positionDebtUSD != null) {
        const margin = quote.positionCollateralUSD - quote.positionDebtUSD - impactUsd
        if (margin > 0.5) lines.push(`Margin paid in: ${fmtFullUsd(margin)} (netted out)`)
      }
    }
    return lines.join('\n')
  })()

  const hasFooter =
    impactUsd != null ||
    rateEntries.length > 0 ||
    (operation === 'Loop' && (quote.positionCollateralUSD != null || quote.positionDebtUSD != null))

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
          {isSelected && <span className="text-[10px] font-bold text-primary leading-none">✓</span>}
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

      {/* Footer: one row — Impact (deltas in tooltip) + Net APR (leg breakdown
          in tooltip). Same-role ops without a col/debt net keep per-market chips. */}
      {hasFooter && (
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 mt-1.5 pt-1.5 border-t border-base-300/60 text-[10px] leading-tight">
          {impactUsd != null && (
            <div className="flex items-baseline gap-1 cursor-help" title={impactTitle}>
              <span className="text-base-content/50 border-b border-dotted border-base-content/30">
                Impact
              </span>
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
          {netApr && (
            <div className="flex items-baseline gap-1 cursor-help" title={netAprTitle}>
              <span className="text-base-content/50 border-b border-dotted border-base-content/30">
                Net APR
              </span>
              <span
                className={`font-semibold tabular-nums ${
                  netApr.annualUsd >= 0 ? 'text-success' : 'text-error'
                }`}
              >
                {netApr.aprPct != null
                  ? `${netApr.aprPct >= 0 ? '+' : ''}${netApr.aprPct.toFixed(2)}%`
                  : `${fmtSignedCompactUsd(netApr.annualUsd)}/yr`}
              </span>
              {netApr.aprPct != null && (
                <span className="tabular-nums text-base-content/50">
                  ({fmtSignedCompactUsd(netApr.annualUsd)}/yr)
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </button>
  )
}
