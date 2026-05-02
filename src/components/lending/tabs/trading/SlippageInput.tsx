import React from 'react'
import { sanitizeAmountInput } from '../../actions/format'
import { PresetButton } from '../../../common/PresetButton'

const presets = [0.1, 0.3, 0.5, 1.0]

interface SlippageInputProps {
  value: string
  onChange: (v: string) => void
}

export const SlippageInput: React.FC<SlippageInputProps> = ({ value, onChange }) => (
  <div className="form-control">
    <div className="flex items-center justify-between mb-1">
      <span className="label-text text-xs">Slippage %</span>
      <div className="flex gap-1">
        {presets.map((p) => (
          <PresetButton
            key={p}
            active={value === String(p)}
            onClick={() => onChange(String(p))}
          >
            {p}%
          </PresetButton>
        ))}
      </div>
    </div>
    <input
      type="text"
      inputMode="decimal"
      className="input input-bordered input-xs w-full"
      value={value}
      onChange={(e) => { const v = sanitizeAmountInput(e.target.value); if (v !== null) onChange(v) }}
    />
  </div>
)
