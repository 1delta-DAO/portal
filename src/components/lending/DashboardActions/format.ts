export function formatUsd(v: number) {
  if (!Number.isFinite(v)) return '0'
  return v.toLocaleString(undefined, {
    maximumFractionDigits: v < 1000 ? 2 : 0,
  })
}

export function formatTokenAmount(v: number | string): string {
  const num = typeof v === 'string' ? parseFloat(v) : v
  if (!Number.isFinite(num) || num === 0) return '0'
  if (num < 0.0001) return '<0.0001'
  if (num < 1) return num.toFixed(6)
  if (num < 1000) return num.toFixed(4)
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

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
