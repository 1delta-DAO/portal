// src/components/lending/OperationSelect.tsx
import React, { useState, useRef, useEffect } from 'react'
import { LenderOperationKind } from '../../contexts/LenderSelectionContext'
import { useIsMobile } from '../../hooks/useIsMobile'

interface OperationSelectProps {
  value: LenderOperationKind
  onChange: (op: LenderOperationKind) => void
  className?: string
}

const OPTIONS: { value: LenderOperationKind; label: string; color: string }[] = [
  { value: 'deposit', label: 'Deposit', color: 'text-success' },
  { value: 'withdraw', label: 'Withdraw', color: 'text-warning' },
  { value: 'borrow', label: 'Borrow', color: 'text-error' },
  { value: 'repay', label: 'Repay', color: 'text-primary' },
]

export const OperationSelect: React.FC<OperationSelectProps> = ({
  value,
  onChange,
  className = '',
}) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const isMobile = useIsMobile()

  const selected = OPTIONS.find((o) => o.value === value)!

  // Close dropdown when clicking outside (desktop only)
  useEffect(() => {
    if (isMobile) return
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isMobile])

  const handleSelect = (op: LenderOperationKind) => {
    onChange(op)
    setOpen(false)
  }

  // Mobile: Modal
  if (isMobile) {
    return (
      <>
        <div className={className}>
          <label className="label py-0">
            <span className="label-text text-xs">Operation</span>
          </label>
          <button
            type="button"
            className="w-full h-8 px-3 text-sm rounded-btn border border-base-300 bg-base-100 flex justify-between items-center hover:border-primary/60 transition-colors"
            onClick={() => setOpen(true)}
          >
            <span className={selected.color}>{selected.label}</span>
            <span className="opacity-60 text-xs">▼</span>
          </button>
        </div>

        {open && (
          <div className="modal modal-open" onClick={() => setOpen(false)}>
            <div className="modal-box max-w-xs" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-bold text-lg mb-4">Select Operation</h3>
              <div className="space-y-2">
                {OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={`btn btn-sm w-full justify-start ${
                      o.value === value ? 'btn-primary' : 'btn-ghost'
                    }`}
                    onClick={() => handleSelect(o.value)}
                  >
                    <span className={o.value === value ? '' : o.color}>{o.label}</span>
                  </button>
                ))}
              </div>
              <div className="modal-action">
                <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // Desktop: Dropdown
  return (
    <div className={`relative ${className}`} ref={ref}>
      <label className="label py-0">
        <span className="label-text text-xs">Operation</span>
      </label>

      {/* Trigger button */}
      <button
        type="button"
        className="
                rounded-md
          w-full h-8 px-3 text-sm rounded-btn border border-base-300
          bg-base-100 flex justify-between items-center
          hover:border-primary/60 transition-colors
        "
        onClick={() => setOpen(!open)}
      >
        <span className={selected.color}>{selected.label}</span>
        <span className="opacity-60 text-xs">▼</span>
      </button>

      {/* Dropdown menu */}
      {open && (
        <ul
          className="
            absolute z-20 mt-1 w-full
            menu bg-base-100 rounded-box shadow border border-base-300
          "
        >
          {OPTIONS.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                className="
                  w-full flex justify-between px-3 py-2 text-sm
                  hover:bg-base-200/80 transition-colors
                "
                onClick={() => handleSelect(o.value)}
              >
                <span className={o.color}>{o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
