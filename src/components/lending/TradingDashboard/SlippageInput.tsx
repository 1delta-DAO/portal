import React from 'react'

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
          <button
            key={p}
            type="button"
            className={`btn btn-ghost btn-xs px-1.5 py-0 h-5 min-h-0 text-[10px] ${
              value === String(p) ? 'btn-active' : ''
            }`}
            onClick={() => onChange(String(p))}
          >
            {p}%
          </button>
        ))}
      </div>
    </div>
    <input
      type="text"
      inputMode="decimal"
      className="input input-bordered input-xs w-full"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
)
