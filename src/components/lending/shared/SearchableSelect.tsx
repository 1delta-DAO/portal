import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { EmptyState } from '../../common/EmptyState'
import { Logo } from '../../common/Logo'

export interface SearchableSelectOption {
  value: string
  label: string
  /** Optional leading indicator (e.g. "● " for balance marker) */
  indicator?: string
  /** Optional icon URL displayed before the label */
  icon?: string
  /** Optional muted text shown at the right edge of the option (e.g. abbreviated TVL) */
  trailing?: string
  /** Optional title attribute for the trailing text (full-precision tooltip) */
  trailingTitle?: string
}

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /**
   * Desktop: width constraints for the dropdown panel. Defaults to a compact
   * `max-w-xs`; pass a roomier value (e.g. `max-w-md`) for option lists with
   * long labels + trailing text so they don't truncate as aggressively.
   */
  menuClassName?: string
  /**
   * Desktop: max-height of the scrollable options list. Defaults to `max-h-52`
   * (~6 rows); bump it to show more options at once.
   */
  listMaxHeightClassName?: string
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
  menuClassName = 'min-w-full w-max max-w-xs',
  listMaxHeightClassName = 'max-h-52',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isMobile = useIsMobile()

  // Close on outside click (desktop only)
  useEffect(() => {
    if (isMobile) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isMobile])

  // Focus input when opening
  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  // Lock page scroll while the mobile modal is open so touch scrolling
  // happens inside the options list instead of the page behind it.
  //
  // The app's scroll container is <html> (overflow-y: auto in globals.css), so
  // freezing `overflow: hidden` on it locks the page at its current position.
  // We deliberately DON'T pin <body> with `position: fixed` — that trick
  // preserves scroll position but breaks touch-scrolling of the modal's inner
  // `overflow-y-auto` list on iOS/Android, which is exactly the bug this
  // replaces. `overscroll-behavior: contain` keeps scroll chaining out.
  useEffect(() => {
    if (!isMobile || !isOpen) return
    const html = document.documentElement
    const { body } = document
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
    }
    html.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'contain'
    body.style.overflow = 'hidden'
    return () => {
      html.style.overflow = prev.htmlOverflow
      html.style.overscrollBehavior = prev.htmlOverscroll
      body.style.overflow = prev.bodyOverflow
    }
  }, [isMobile, isOpen])

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

  // Mobile: Modal
  if (isMobile) {
    return (
      <>
        <button
          type="button"
          className={`select select-bordered select-sm flex items-center text-left w-full min-w-0 ${className}`}
          onClick={() => setIsOpen(true)}
        >
          <span className="truncate flex-1 min-w-0 flex items-center gap-1.5 pr-4">
            {selectedOption ? (
              <>
                {selectedOption.icon !== undefined && (
                  <Logo
                    src={selectedOption.icon}
                    alt={selectedOption.label}
                    fallbackText={selectedOption.label}
                    className="w-4 h-4 rounded-full token-logo"
                  />
                )}
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

        {isOpen && (
          <div className="modal modal-open" onClick={() => setIsOpen(false)}>
            <div
              className="modal-box w-[calc(100vw-1rem)] max-w-sm max-h-[90dvh] p-3 sm:p-4 flex flex-col gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header: search + close */}
              <div className="flex items-center gap-2 shrink-0">
                <input
                  ref={inputRef}
                  type="text"
                  className="input input-bordered input-sm flex-1 min-w-0"
                  placeholder={placeholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-ghost btn-circle shrink-0"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              {/* Options list.
                  iOS-reliable scroll: the list is the scroll container with its
                  OWN explicit max-height + overflow-y-auto. We deliberately do
                  NOT use `flex-1 min-h-0` here — inside a position:fixed,
                  grid-centered `.modal`, iOS Safari fails to give a flex-1 child
                  a bounded height, so the list grows to full content height, the
                  parent just clips it, and the drag chains to the page instead of
                  scrolling the list. An explicit max-height makes the list a real
                  scroller. */}
              <div
                className="overflow-y-auto overscroll-contain touch-pan-y max-h-[70dvh] -mx-1 px-1 space-y-1"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {filtered.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`w-full text-left px-2.5 py-2 text-sm rounded-lg transition-colors flex items-center gap-1.5 min-w-0 ${
                      opt.value === value
                        ? 'bg-primary text-primary-content font-medium'
                        : 'bg-base-200 hover:bg-base-300'
                    }`}
                    onClick={() => handleSelect(opt.value)}
                  >
                    {opt.icon !== undefined && (
                      <Logo
                        src={opt.icon}
                        alt={opt.label}
                        fallbackText={opt.label}
                        className="w-4 h-4 rounded-full shrink-0 token-logo"
                      />
                    )}
                    {opt.indicator && (
                      <span className="opacity-60 text-xs shrink-0">{opt.indicator}</span>
                    )}
                    <span className="flex-1 min-w-0 truncate" title={opt.label}>{opt.label}</span>
                    {opt.trailing && (
                      <span
                        className="shrink-0 ml-2 text-[10px] opacity-60 tabular-nums"
                        title={opt.trailingTitle}
                      >
                        {opt.trailing}
                      </span>
                    )}
                  </button>
                ))}
                {filtered.length === 0 && <EmptyState size="sm" title="No matches" />}
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // Desktop: Dropdown
  return (
    <div ref={containerRef} className={`relative inline-block max-w-full ${className}`}>
      {/* Trigger button — width adapts to selected option label */}
      <button
        type="button"
        className="select select-bordered select-sm flex items-center text-left w-auto max-w-xs"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="truncate flex items-center gap-1.5 pr-4">
          {selectedOption ? (
            <>
              {selectedOption.icon !== undefined && (
                <Logo
                  src={selectedOption.icon}
                  alt={selectedOption.label}
                  fallbackText={selectedOption.label}
                  className="w-4 h-4 rounded-full token-logo"
                />
              )}
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
        <div className={`absolute z-50 mt-1 rounded-box border border-base-300 bg-base-100 shadow-lg ${menuClassName}`}>
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
          <ul className={`${listMaxHeightClassName} overflow-y-auto py-1`}>
            {filtered.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-base-200 transition-colors cursor-pointer flex items-center gap-1 min-w-0 ${
                    opt.value === value ? 'bg-primary/10 font-medium' : ''
                  }`}
                  onClick={() => handleSelect(opt.value)}
                >
                  {opt.icon !== undefined && (
                    <Logo
                      src={opt.icon}
                      alt={opt.label}
                      fallbackText={opt.label}
                      className="w-4 h-4 rounded-full shrink-0 token-logo"
                    />
                  )}
                  {opt.indicator && (
                    <span className="opacity-60 text-xs shrink-0">{opt.indicator}</span>
                  )}
                  <span className="flex-1 min-w-0 truncate" title={opt.label}>{opt.label}</span>
                  {opt.trailing && (
                    <span
                      className="shrink-0 ml-2 text-[10px] text-base-content/50 tabular-nums"
                      title={opt.trailingTitle}
                    >
                      {opt.trailing}
                    </span>
                  )}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li>
                <EmptyState size="sm" title="No matches" />
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
