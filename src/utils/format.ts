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
