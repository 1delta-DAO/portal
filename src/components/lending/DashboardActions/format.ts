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
