import React from 'react'

interface LenderBadgeProps {
  /** Internal lender key, e.g. AAVE_V3, RADIANT_V2, MORPHO_BLUE. */
  lenderKey: string
  /** Optional human-readable name from the lender enumeration. */
  name?: string
  /** Optional logo URL from the lender enumeration. */
  logoURI?: string
  /**
   * Maximum number of characters to show in the visible label before
   * truncating. Defaults to 14, which is enough to keep "RADIANT_V2"
   * intact while still cutting longer names down.
   */
  maxChars?: number
  className?: string
}

/**
 * Compact, truncating badge for displaying a lender. Use anywhere a row
 * needs a lender chip — the optimizer table, markets table, etc. The full
 * `name` (or key) is always available via the badge's `title` for hover.
 */
export const LenderBadge: React.FC<LenderBadgeProps> = ({
  lenderKey,
  name,
  logoURI,
  maxChars = 14,
  className = '',
}) => {
  const display = name ?? lenderKey
  const truncated = display.length > maxChars ? `${display.slice(0, maxChars - 1)}…` : display
  const tooltip = name ? `${name} (${lenderKey})` : lenderKey

  return (
    <span
      className={`inline-flex items-center gap-1 max-w-[140px] badge badge-ghost badge-sm ${className}`}
      title={tooltip}
    >
      {logoURI && (
        <img
          src={logoURI}
          width={12}
          height={12}
          alt=""
          className="rounded-full object-contain w-3 h-3 shrink-0"
        />
      )}
      <span className="truncate">{truncated}</span>
    </span>
  )
}
