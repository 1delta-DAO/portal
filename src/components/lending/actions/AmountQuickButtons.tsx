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
  /** Override the default preset fractions (25/50/75/Max). */
  presets?: { label: string; fraction: number }[]
}

const defaultEntries = [
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
  presets,
}) => {
  const entries = presets ?? defaultEntries
  const n = parseFloat(maxAmount)
  // Render the buttons unconditionally so they're always visible — when there's
  // nothing to scale (no wallet balance / no withdrawable / no borrowable),
  // they render disabled with a tooltip rather than silently disappearing.
  const hasMax = !!maxAmount && Number.isFinite(n) && n > 0
  const disabledTitle = hasMax ? undefined : 'No balance to scale from'

  return (
    <div className="flex items-center gap-1">
      {entries.map((e) => (
        <PresetButton
          key={e.label}
          title={disabledTitle}
          className={hasMax ? '' : 'btn-disabled opacity-50 cursor-not-allowed'}
          onClick={() => {
            if (!hasMax) return
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
