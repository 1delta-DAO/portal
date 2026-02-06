import React, { useState, useRef, useEffect, useMemo } from 'react'

export interface SearchableSelectOption {
  value: string
  label: string
  /** Optional leading indicator (e.g. "● " for balance marker) */
  indicator?: string
}

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Focus input when opening
  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  const selectedOption = options.find((o) => o.value === value)

  const filtered = useMemo(() => {
    if (!search.trim()) return options
    const q = search.toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, search])

  const handleSelect = (val: string) => {
    onChange(val)
    setIsOpen(false)
    setSearch('')
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        className="select select-bordered select-sm flex items-center text-left w-full"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="truncate">
          {selectedOption ? (
            <>
              {selectedOption.indicator && (
                <span className="opacity-60">{selectedOption.indicator}</span>
              )}
              {selectedOption.label}
            </>
          ) : (
            <span className="opacity-50">Select...</span>
          )}
        </span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full min-w-48 rounded-box border border-base-300 bg-base-100 shadow-lg">
          {/* Search input */}
          <div className="p-1.5">
            <input
              ref={inputRef}
              type="text"
              className="input input-bordered input-xs w-full"
              placeholder={placeholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsOpen(false)
                  setSearch('')
                } else if (e.key === 'Enter' && filtered.length === 1) {
                  handleSelect(filtered[0].value)
                }
              }}
            />
          </div>

          {/* Options list */}
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-base-200 transition-colors cursor-pointer flex items-center gap-1 ${
                    opt.value === value ? 'bg-primary/10 font-medium' : ''
                  }`}
                  onClick={() => handleSelect(opt.value)}
                >
                  {opt.indicator && (
                    <span className="opacity-60 text-xs">{opt.indicator}</span>
                  )}
                  {opt.label}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-base-content/50 text-center">
                No matches
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
