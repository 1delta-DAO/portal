// src/components/lending/AmountUsdHint.tsx
import React from 'react'

interface AmountUsdHintProps {
  amountUsd?: number
}

/**
 * Abbreviates large USD values:
 *  - 1234 → 1.23K
 *  - 5400000 → 5.4M
 *  - 7800000000 → 7.8B
 */
function formatUsdCompact(value: number): string {
  if (value < 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  if (value < 1_000_000) {
    return (value / 1_000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + 'K'
  }
  if (value < 1_000_000_000) {
    return (value / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + 'M'
  }
  if (value < 1_000_000_000_000) {
    return (value / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + 'B'
  }
  return (value / 1_000_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + 'T'
}

export const AmountUsdHint: React.FC<AmountUsdHintProps> = ({ amountUsd }) => {
  if (amountUsd === undefined || Number.isNaN(amountUsd)) {
    return null
  }

  return (
    <span
      className="
        pointer-events-none absolute inset-y-0 right-0
        flex items-center
        px-1.5 rounded-md
        text-[10px] text-base-content/70
      "
    >
      ≈ ${formatUsdCompact(amountUsd)}
    </span>
  )
}
