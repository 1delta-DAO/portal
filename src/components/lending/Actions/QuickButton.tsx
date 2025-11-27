// src/components/lending/AmountQuickButtons.tsx
import React from 'react'

interface AmountQuickButtonsProps {
  /** Maximum token amount (e.g. total deposits, total debt, max borrowable) */
  maxAmount: number
  /** Called with a *stringified* token amount suitable for putting into an input */
  onSelect: (amountStr: string) => void
  className?: string
}

/** Format a numeric token amount into an input-friendly string (no grouping, trimmed zeros). */
const formatTokenForInput = (v: number): string => {
  if (!Number.isFinite(v)) return ''
  return v
    .toLocaleString('en-US', {
      maximumFractionDigits: 6,
      useGrouping: false,
    })
    .replace(/\.?0+$/, '')
}

export const AmountQuickButtons: React.FC<AmountQuickButtonsProps> = ({
  maxAmount,
  onSelect,
  className = '',
}) => {
  if (!maxAmount || !Number.isFinite(maxAmount) || maxAmount <= 0) {
    return null
  }

  const entries: { label: string; fraction: number }[] = [
    { label: '25%', fraction: 0.25 },
    { label: '50%', fraction: 0.5 },
    { label: '75%', fraction: 0.75 },
    { label: 'Max', fraction: 1 },
  ]

  const handleClick = (fraction: number) => {
    const val = maxAmount * fraction
    onSelect(formatTokenForInput(val))
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {entries.map((e) => (
        <button
          key={e.label}
          type="button"
          className="btn btn-ghost btn-xs px-2 py-0 h-5 min-h-0 text-[10px]"
          onClick={() => handleClick(e.fraction)}
        >
          {e.label}
        </button>
      ))}
    </div>
  )
}
