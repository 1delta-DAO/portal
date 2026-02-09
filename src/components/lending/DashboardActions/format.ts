// Re-export shared formatters
export { formatUsd, formatTokenAmount } from '../../../utils/format'

/** Parse a decimal string (e.g. "1.23" or "1,23") into a number */
export function parseAmount(v: number | string): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (!v) return 0
  const normalized = v.replace(/,/g, '')
  const n = parseFloat(normalized)
  return Number.isFinite(n) ? n : 0
}

/** Format a numeric token amount into an input-friendly string (no grouping, no trailing zeros) */
export function formatTokenForInput(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return ''
  return v
    .toLocaleString('en-US', {
      maximumFractionDigits: 6,
      useGrouping: false,
    })
    .replace(/\.?0+$/, '')
}
