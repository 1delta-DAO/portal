interface UsdAmountProps {
  /** Dollar value to render. */
  value: number
  /** Prefix with a tilde to signal an estimate. */
  approx?: boolean
  /**
   * Render without the capsule background — bare muted figures. Use inside an
   * input or another bordered container where a chip would nest awkwardly.
   */
  plain?: boolean
  className?: string
}

/**
 * Compact dollar figure: `$1.97K`, `$3.3K`, `$150.99M`. Values under 1000 stay
 * exact (`$234`, `$12.34`); larger ones collapse to K/M/B/T with up to two
 * decimals and trailing zeros trimmed, so magnitudes stay skimmable without
 * losing the leading significant figures.
 */
function compactUsd(abs: number): string {
  const unit = (n: number, suffix: string) => `${Number((abs / n).toFixed(2))}${suffix}`
  if (abs >= 1e12) return unit(1e12, 'T')
  if (abs >= 1e9) return unit(1e9, 'B')
  if (abs >= 1e6) return unit(1e6, 'M')
  if (abs >= 1e3) return unit(1e3, 'K')
  return abs.toLocaleString(undefined, { maximumFractionDigits: abs < 1 ? 4 : 2 })
}

/**
 * Canonical, recognizable representation of a USD amount.
 *
 * Renders every dollar value the same way across tables and panels — a
 * de-emphasized `$` glyph + monospaced, compact tabular figures — so USD reads
 * as a distinct value type at a glance and stays visually consistent wherever it
 * appears. By default it sits in a subtle capsule; pass `plain` to drop it.
 */
export function UsdAmount({
  value,
  approx = false,
  plain = false,
  className = '',
}: UsdAmountProps) {
  const sign = value < 0 ? '−' : ''
  const num = compactUsd(Math.abs(value))
  return (
    <span
      className={`inline-flex items-baseline gap-px whitespace-nowrap font-mono leading-tight tabular-nums ${
        plain
          ? 'text-base-content/55'
          : 'rounded-[3px] bg-base-content/[0.06] px-1 text-[0.92em] text-base-content/70'
      } ${className}`}
      translate="no"
    >
      {approx ? '~' : ''}
      {sign}
      <span className="text-base-content/40">$</span>
      {num}
    </span>
  )
}
