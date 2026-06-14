/**
 * Shared formatting utilities for USD values, token amounts, etc.
 */

import type { PoolDataItem } from '../hooks/lending/usePoolData'

/** Sum deposits - debt across all markets for a lender to get TVL. */
export function computeLenderTvl(markets: PoolDataItem[]): number {
  return markets.reduce((sum, m) => sum + (m.totalDepositsUSD ?? 0) - (m.totalDebtUSD ?? 0), 0)
}

/** Sort lender keys by TVL descending, computed from their markets. */
export function sortLenderKeysByTvl(
  lenderData: Record<string, PoolDataItem[]> | undefined
): string[] {
  const keys = Object.keys(lenderData ?? {})
  return keys.sort(
    (a, b) => computeLenderTvl(lenderData?.[b] ?? []) - computeLenderTvl(lenderData?.[a] ?? [])
  )
}

export function formatUsd(v: number): string {
  if (!Number.isFinite(v)) return '0'
  return v.toLocaleString(undefined, {
    maximumFractionDigits: v < 1000 ? 2 : 0,
  })
}

export function abbreviateUsd(v: number): string {
  if (!Number.isFinite(v) || v === 0) return '$0'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000_000_000) return `${sign}$${(abs / 1_000_000_000_000).toFixed(2)}T`
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(2)}`
}

export function abbreviateNumber(v: number): string {
  if (!Number.isFinite(v) || v === 0) return '0'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000_000_000) return `${sign}${(abs / 1_000_000_000_000).toFixed(2)}T`
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`
  if (abs < 0.0001) return `${sign}<0.0001`
  if (abs < 1) return `${sign}${abs.toFixed(4)}`
  return `${sign}${abs.toFixed(2)}`
}

export function formatTokenAmount(v: number | string): string {
  const num = typeof v === 'string' ? parseFloat(v) : v
  if (!Number.isFinite(num) || num === 0) return '0'
  if (num < 0.0001) return '<0.0001'
  if (num < 1) return num.toFixed(6)
  if (num < 1000) return num.toFixed(4)
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

/**
 * The canonical placeholder for a missing / non-meaningful value. Use this
 * everywhere instead of hand-rolling '—' / '–' / 'N/A' / '-' so empty cells
 * read identically across every table and panel.
 */
export const EMPTY_VALUE = '—'

/**
 * Render a value, falling back to {@link EMPTY_VALUE} when it is null,
 * undefined or non-finite. Pass a formatter to format the present case.
 *
 *   formatEmptyValue(apr, (n) => formatPercent(n))   // "4.25%" | "—"
 *   formatEmptyValue(name)                            // "USDC"  | "—"
 */
export function formatEmptyValue<T>(
  value: T | null | undefined,
  format: (v: T) => string = (v) => String(v),
  placeholder: string = EMPTY_VALUE
): string {
  if (value === null || value === undefined) return placeholder
  if (typeof value === 'number' && !Number.isFinite(value)) return placeholder
  return format(value)
}

/**
 * Format a rate / percentage. Precision is preserved (no aggressive rounding —
 * see research finding) and defaults to 2 decimals, the de-facto APR precision
 * across the app.
 *
 * @param value      the percentage in *percent units* by default (4.25 → "4.25%")
 * @param decimals   fraction digits (default 2)
 * @param fromRatio  set true when `value` is a 0–1 ratio (0.0425 → "4.25%")
 */
export function formatPercent(
  value: number,
  decimals: number = 2,
  fromRatio: boolean = false
): string {
  if (!Number.isFinite(value)) return EMPTY_VALUE
  const pct = fromRatio ? value * 100 : value
  return `${pct.toFixed(decimals)}%`
}

/** Format a leverage / multiplier value: 2.5 → "2.50×". Uses a true ×, not "x". */
export function formatLeverage(value: number, decimals: number = 2): string {
  if (!Number.isFinite(value)) return EMPTY_VALUE
  return `${value.toFixed(decimals)}×`
}

/**
 * Format a USD price with precision that scales to magnitude — large prices get
 * 2 decimals, sub-dollar prices get more so cents/sub-cents stay legible.
 * (Consolidates the bespoke price formatters in AssetPopover / PoolSelector.)
 */
export function formatPrice(v: number): string {
  if (!Number.isFinite(v)) return EMPTY_VALUE
  const abs = Math.abs(v)
  if (abs === 0) return '$0.00'
  if (abs >= 1) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  if (abs >= 0.01) return `$${v.toFixed(4)}`
  return `$${v.toPrecision(4)}`
}
