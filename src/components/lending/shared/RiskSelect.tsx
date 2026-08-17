import React, { useEffect, useRef, useState } from 'react'
import { riskDotColor } from '../tabs/earn/helpers'

/**
 * Ceilings, one per risk band — see `scoreToRiskLabel`: 1–2 low, 3 medium,
 * 4–5 high.
 *
 * "Up to medium" is 3, not 4. It was 4, which let a score-4 market through
 * under a label promising medium risk — the same off-by-one band that made a
 * 4 render amber in the tables.
 */
const OPTIONS = [
  { value: 2, label: 'Low', dropdownLabel: 'Low only', risk: 'low' },
  { value: 3, label: 'Up to medium', dropdownLabel: 'Up to medium', risk: 'medium' },
  { value: 5, label: 'Up to high', dropdownLabel: 'Up to high', risk: 'high' },
] as const

interface RiskSelectProps {
  value: number
  onChange: (value: number) => void
}

export const RiskSelect: React.FC<RiskSelectProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // The narrowest band that still ADMITS everything the current ceiling
  // admits. A stored or URL-supplied 4 is not an option value, and falling
  // back to a fixed entry (this used to be OPTIONS[1]) displayed "Up to
  // medium" while high-risk rows were being served.
  const current = OPTIONS.find((o) => o.value >= value) ?? OPTIONS[OPTIONS.length - 1]

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn btn-xs btn-outline gap-1 px-2 whitespace-nowrap"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${riskDotColor(current.risk)}`} />
        <span className="text-xs">{current.label}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-base-200 border border-base-300 rounded-lg shadow-xl py-1 min-w-24">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`flex items-center gap-2 w-full px-3 py-1 text-xs whitespace-nowrap hover:bg-base-300 transition-colors ${
                value === opt.value ? 'font-semibold' : ''
              }`}
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${riskDotColor(opt.risk)}`} />
              {opt.dropdownLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
