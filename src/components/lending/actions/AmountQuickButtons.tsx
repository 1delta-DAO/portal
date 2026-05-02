import React from 'react'
import { multiplyAmountString } from './format'
import { PresetButton } from '../../common/PresetButton'

interface AmountQuickButtonsProps {
  maxAmount: string
  onSelect: (amountStr: string) => void
  /** Called when "Max" is clicked instead of onSelect, e.g. to toggle isAll */
  onMax?: () => void
  /** Token decimals — clamps preset results to this precision. */
  decimals?: number
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
  decimals,
}) => {
  const n = parseFloat(maxAmount)
  if (!maxAmount || !Number.isFinite(n) || n <= 0) {
    return null
  }

  return (
    <div className="flex items-center gap-1">
      {entries.map((e) => (
        <PresetButton
          key={e.label}
          onClick={() => {
            if (e.fraction === 1) {
              onMax ? onMax() : onSelect(maxAmount)
            } else {
              onSelect(multiplyAmountString(maxAmount, e.fraction, decimals))
            }
          }}
        >
          {e.label}
        </PresetButton>
      ))}
    </div>
  )
}
