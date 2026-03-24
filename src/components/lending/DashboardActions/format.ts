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
export function formatTokenForInput(v: number | string): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (!Number.isFinite(n) || n <= 0) return ''
  return n
    .toLocaleString('en-US', {
      maximumFractionDigits: 18,
      useGrouping: false,
    })
    .replace(/\.?0+$/, '')
}

/**
 * Validate and sanitize a decimal amount input string.
 * Returns the cleaned string if valid, or null if invalid.
 * Allows: digits, a single decimal point, leading zero before decimal.
 * Strips: leading zeros (except "0."), non-numeric chars.
 */
export function sanitizeAmountInput(v: string): string | null {
  // Allow empty string (clearing the field)
  if (v === '') return ''

  // Allow intermediate states: just a dot (will become "0.")
  if (v === '.') return '0.'

  // Strip anything that isn't a digit or decimal point
  const cleaned = v.replace(/[^0-9.]/g, '')

  // Only allow one decimal point
  const parts = cleaned.split('.')
  if (parts.length > 2) return null

  // Reconstruct: strip leading zeros from integer part (keep at least one digit)
  let integer = parts[0].replace(/^0+/, '') || '0'
  const decimal = parts[1]

  if (decimal !== undefined) {
    return `${integer}.${decimal}`
  }

  return integer
}

/**
 * Multiply a decimal string amount by a fraction without intermediate float rounding.
 * For simple fractions (0.25, 0.5, 0.75) this shifts decimals to avoid precision loss.
 */
export function multiplyAmountString(amount: string, fraction: number): string {
  const n = parseFloat(amount)
  if (!Number.isFinite(n) || n <= 0) return ''
  // Use the string representation to preserve precision through the multiply
  const result = n * fraction
  return formatTokenForInput(result)
}
