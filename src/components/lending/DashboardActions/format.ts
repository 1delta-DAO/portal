// Re-export shared formatters
export { formatUsd, formatTokenAmount } from '../../../utils/format'

/**
 * Compare two non-negative decimal string amounts.
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 * Falls back to parseFloat for malformed strings.
 */
export function compareAmountStrings(a: string, b: string): number {
  // Normalize: split into integer and decimal parts
  const normalize = (s: string) => {
    const dot = s.indexOf('.')
    const int = (dot >= 0 ? s.slice(0, dot) : s).replace(/^0+/, '') || '0'
    const dec = dot >= 0 ? s.slice(dot + 1).replace(/0+$/, '') : ''
    return { int, dec }
  }

  const na = normalize(a)
  const nb = normalize(b)

  // Compare integer parts by length first, then lexicographically
  if (na.int.length !== nb.int.length) return na.int.length < nb.int.length ? -1 : 1
  if (na.int !== nb.int) return na.int < nb.int ? -1 : 1

  // Compare decimal parts: pad to same length and compare
  const maxDec = Math.max(na.dec.length, nb.dec.length)
  const da = na.dec.padEnd(maxDec, '0')
  const db = nb.dec.padEnd(maxDec, '0')
  if (da === db) return 0
  return da < db ? -1 : 1
}

/**
 * Returns the smaller of two non-negative decimal string amounts,
 * preserving full string precision (no parseFloat).
 */
export function minAmountString(a: string, b: string): string {
  return compareAmountStrings(a, b) <= 0 ? a : b
}

/**
 * Add two non-negative decimal string amounts using BigInt arithmetic.
 */
export function addAmountStrings(a: string, b: string): string {
  const parse = (s: string) => {
    const dot = s.indexOf('.')
    const int = dot >= 0 ? s.slice(0, dot) : s
    const dec = dot >= 0 ? s.slice(dot + 1) : ''
    return { int, dec, decimals: dec.length }
  }
  const pa = parse(a)
  const pb = parse(b)
  const maxDec = Math.max(pa.decimals, pb.decimals)
  const scaledA = BigInt(pa.int + pa.dec.padEnd(maxDec, '0'))
  const scaledB = BigInt(pb.int + pb.dec.padEnd(maxDec, '0'))
  const sum = scaledA + scaledB
  const sumStr = sum.toString()
  if (maxDec === 0) return sumStr
  const padded = sumStr.padStart(maxDec + 1, '0')
  const intPart = padded.slice(0, padded.length - maxDec)
  const decPart = padded.slice(padded.length - maxDec).replace(/0+$/, '')
  return decPart ? `${intPart}.${decPart}` : intPart
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
 * Multiply a decimal string amount by a fraction using BigInt arithmetic
 * to avoid floating-point precision loss. Truncates (rounds down) to the
 * input's decimal precision so the result never exceeds the original balance.
 */
export function multiplyAmountString(amount: string, fraction: number): string {
  if (!amount || fraction <= 0) return ''

  if (fraction === 1) return amount

  // Determine the input's decimal places
  const dotIdx = amount.indexOf('.')
  const inputDecimals = dotIdx >= 0 ? amount.length - dotIdx - 1 : 0

  // Convert fraction to integer numerator/denominator (e.g. 0.25 → 25/100)
  // Use enough precision to represent the fraction exactly
  const fractionStr = fraction.toString()
  const fractionDot = fractionStr.indexOf('.')
  const fractionDecimals = fractionDot >= 0 ? fractionStr.length - fractionDot - 1 : 0
  const fractionScale = 10 ** fractionDecimals
  const fractionNumerator = BigInt(Math.round(fraction * fractionScale))
  const fractionDenominator = BigInt(fractionScale)

  // Convert the amount string to a scaled BigInt (remove decimal point)
  const integerPart = dotIdx >= 0 ? amount.slice(0, dotIdx) : amount
  const decimalPart = dotIdx >= 0 ? amount.slice(dotIdx + 1) : ''
  const scaledStr = integerPart + decimalPart
  let scaledBigInt: bigint
  try {
    scaledBigInt = BigInt(scaledStr)
  } catch {
    return ''
  }
  if (scaledBigInt <= 0n) return ''

  // Multiply and divide using BigInt (floor division = truncation)
  const result = (scaledBigInt * fractionNumerator) / fractionDenominator

  // Convert back to decimal string
  const resultStr = result.toString()
  if (inputDecimals === 0) return resultStr

  const padded = resultStr.padStart(inputDecimals + 1, '0')
  const intPart = padded.slice(0, padded.length - inputDecimals)
  const decPart = padded.slice(padded.length - inputDecimals).replace(/0+$/, '')
  return decPart ? `${intPart}.${decPart}` : intPart
}
