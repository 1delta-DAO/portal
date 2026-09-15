import React, { useEffect, useRef, useState } from 'react'
import { riskDotColor } from '../tabs/earn/helpers'

/**
 * One ceiling per score, 1–6. The value is sent verbatim as `maxRiskScore` and
 * the server filters `risk_score <= n`, so every integer is a real, distinct
 * cut — a 3 admits the score-3 rows and hides the 4s that wear the same
 * "medium" chip. That is the point of offering all six instead of the three
 * bands this used to collapse to: a user who wants "medium but not 4" can say
 * so, and one who wants 6 (`compromised` — drained / insolvent / abandoned, see
 * `riskBand`) has to ask for it by name. The band name next to each number is
 * `riskBand`'s, so the dot colour matches the chip the row will carry.
 */
const OPTIONS = [
  { value: 1, label: 'Risk ≤ 1', dropdownLabel: '1 · low', risk: 'low' },
  { value: 2, label: 'Risk ≤ 2', dropdownLabel: '2 · low', risk: 'low' },
  { value: 3, label: 'Risk ≤ 3', dropdownLabel: '3 · medium', risk: 'medium' },
  { value: 4, label: 'Risk ≤ 4', dropdownLabel: '4 · medium', risk: 'medium' },
  { value: 5, label: 'Risk ≤ 5', dropdownLabel: '5 · high', risk: 'high' },
  { value: 6, label: 'Risk ≤ 6', dropdownLabel: '6 · compromised', risk: 'compromised' },
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

  // The narrowest option that still ADMITS everything the current ceiling
  // admits, so an out-of-range value (a stale `100` from an old link, say)
  // never displays a ceiling tighter than what is being served.
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
