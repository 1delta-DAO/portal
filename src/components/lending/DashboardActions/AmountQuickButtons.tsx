import React from 'react'
import { formatTokenForInput } from './format'

interface AmountQuickButtonsProps {
  maxAmount: number
  onSelect: (amountStr: string) => void
  /** Called when "Max" is clicked instead of onSelect, e.g. to toggle isAll */
  onMax?: () => void
}

const entries = [
  { label: '25%', fraction: 0.25 },
  { label: '50%', fraction: 0.5 },
  { label: '75%', fraction: 0.75 },
  { label: 'Max', fraction: 1 },
]

export const AmountQuickButtons: React.FC<AmountQuickButtonsProps> = ({
  maxAmount,
  onSelect,
  onMax,
}) => {
  if (!maxAmount || !Number.isFinite(maxAmount) || maxAmount <= 0) {
    return null
  }

  return (
    <div className="flex items-center gap-1">
      {entries.map((e) => (
        <button
          key={e.label}
          type="button"
          className="btn btn-ghost btn-xs px-1.5 py-0 h-5 min-h-0 text-[10px]"
          onClick={() => {
            if (e.fraction === 1 && onMax) {
              onMax()
            } else {
              onSelect(formatTokenForInput(maxAmount * e.fraction))
            }
          }}
        >
          {e.label}
        </button>
      ))}
    </div>
  )
}
