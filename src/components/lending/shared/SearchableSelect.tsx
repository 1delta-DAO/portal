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

/**
 * Normalise a typed/pasted query: identifiers arrive from clipboards, and a
 * stray separator from a copied list should not read as "no such option".
 */
export const normalizeSelectQuery = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/^[\s,;|]+|[\s,;|]+$/g, '')

/**
 * Does an option match a (already normalised) query?
 *
 * Matches the option's VALUE as well as its label. The value is the identifier
 * — a lender key like `LLAMALEND_5756A035…`, a chain id, a market key — and it
 * used to be unsearchable, so pasting an id that unambiguously names one option
 * returned "No matches". That bit hardest exactly where identifiers matter:
 * per-market lenders, whose label ("LlamaLend crvUSD / wstETH") shares no
 * characters with their key. It appeared to work for lenders without metadata
 * only because their label falls back to the key.
 *
 * The value test runs BOTH directions so a pasted full `marketUid`
 * (`LLAMALEND_x:1:0xabc…`) finds the option whose value is only its lender key
 * — the identifier to hand is usually the longer one.
 */
export const optionMatchesQuery = (option: SearchableSelectOption, query: string): boolean => {
  if (!query) return true
  if (option.label.toLowerCase().includes(query)) return true
  const v = option.value.toLowerCase()
  return v.includes(query) || query.includes(v)
}

interface SearchableSelectBaseProps {
  options: SearchableSelectOption[]
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
  /**
   * Shape of the option icons. `'round'` (default) suits chains and tokens;
   * `'protocol'` leaves lender artwork uncropped — a wordmark inside a circle
   * loses the part that names it.
   */
  iconShape?: 'round' | 'protocol'
}

/**
 * Single- and multi-select share one implementation so the mobile modal's
 * iOS scroll-lock (below) only has to be right once. The two shapes are a
 * discriminated union rather than a `string | string[]` value, so call sites
 * stay type-safe on both sides of the callback.
 */
export type SearchableSelectProps = SearchableSelectBaseProps &
  (
    | {
        multiple?: false
        value: string
        onChange: (value: string) => void
      }
    | {
        multiple: true
        /** Selected values. Order is preserved as the user picks them. */
        values: string[]
        onChange: (values: string[]) => void
        /** Max selectable; further options render disabled once reached. */
        maxSelected?: number
        /** Rendered in the trigger, e.g. `(n) => `${n} chains``. */
        renderLabel?: (selected: SearchableSelectOption[]) => React.ReactNode
        /** Shown under the search box when the cap is hit. */
        maxSelectedHint?: string
      }
  )

export function SearchableSelect(props: SearchableSelectProps) {
  const {
    options,
    placeholder = 'Search...',
    className = '',
    menuClassName = 'min-w-full w-max max-w-xs',
    listMaxHeightClassName = 'max-h-52',
    iconShape = 'round',
  } = props

  const iconClass = iconShape === 'round' ? 'rounded-full token-logo' : 'protocol-logo'

  const isMulti = props.multiple === true
  const selectedValues = useMemo(
    () => (props.multiple === true ? props.values : props.value ? [props.value] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.multiple, props.multiple === true ? props.values : props.value]
  )
  const maxSelected = props.multiple === true ? (props.maxSelected ?? Infinity) : 1
  const atCap = isMulti && selectedValues.length >= maxSelected

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

  // Lock page scroll while the mobile modal is open so touch dragging scrolls
  // the options list, not the page behind it.
  //
  // iOS Safari ignores `overflow: hidden` on <html>/<body> for the main
  // document scroller, so the ONLY reliable lock is pinning <body> to
  // `position: fixed` at a negative top offset (and restoring scroll on close).
  // This is safe for the modal's own scrolling because the options list is a
  // real scroll container with its own max-height + overflow-y-auto (it does
  // NOT depend on the page scroller). Without this, dismissing the keyboard
  // leaves the document scrollable and drags move the background.
  useEffect(() => {
    if (!isMobile || !isOpen) return
    const html = document.documentElement
    const { body } = document
    const scrollY = window.scrollY
    const prev = {
      htmlOverscroll: html.style.overscrollBehavior,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyOverflow: body.style.overflow,
    }
    html.style.overscrollBehavior = 'contain'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    body.style.overflow = 'hidden'
    return () => {
      html.style.overscrollBehavior = prev.htmlOverscroll
      body.style.position = prev.bodyPosition
      body.style.top = prev.bodyTop
      body.style.left = prev.bodyLeft
      body.style.right = prev.bodyRight
      body.style.width = prev.bodyWidth
      body.style.overflow = prev.bodyOverflow
      // Restore the pre-lock scroll position (body was pinned at -scrollY).
      window.scrollTo(0, scrollY)
    }
  }, [isMobile, isOpen])

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues])
  const selectedOptions = useMemo(
    () =>
      selectedValues
        .map((v) => options.find((o) => o.value === v))
        .filter(Boolean) as SearchableSelectOption[],
    [selectedValues, options]
  )
  const selectedOption = selectedOptions[0]

  const filtered = useMemo(() => {
    const q = normalizeSelectQuery(search)
    const matched = q ? options.filter((o) => optionMatchesQuery(o, q)) : options
    if (!isMulti) return matched
    // Float the current selection to the top. Chain lists are long and sorted
    // by id, so an already-picked chain can otherwise sit dozens of rows down
    // — leaving the open dropdown looking like nothing is selected.
    const selectedFirst = matched.filter((o) => selectedSet.has(o.value))
    const rest = matched.filter((o) => !selectedSet.has(o.value))
    return [...selectedFirst, ...rest]
  }, [options, search, isMulti, selectedSet])

  const handleSelect = (val: string) => {
    if (props.multiple === true) {
      // Toggle. The last selected chain can't be removed — an empty selection
      // has no meaningful query behind it, so the UI never offers that state.
      const next = selectedSet.has(val)
        ? selectedValues.filter((v) => v !== val)
        : [...selectedValues, val]
      if (next.length === 0) return
      if (next.length > maxSelected) return
      props.onChange(next)
      // Multi-select stays open: picking several chains shouldn't cost several
      // round-trips through the dropdown.
      return
    }
    props.onChange(val)
    setIsOpen(false)
    setSearch('')
  }

  /** Trigger content — a label for single, a summary for multi. */
  const triggerContent = () => {
    if (props.multiple === true) {
      if (props.renderLabel) return props.renderLabel(selectedOptions)
      return (
        <>
          <span className="flex -space-x-1.5 shrink-0">
            {selectedOptions.slice(0, 3).map((o) => (
              <Logo
                key={o.value}
                src={o.icon}
                alt={o.label}
                fallbackText={o.label}
                className={`w-4 h-4 ring-1 ring-base-100 ${iconClass}`}
              />
            ))}
          </span>
          {selectedOptions.length === 1
            ? selectedOptions[0].label
            : `${selectedOptions.length} chains`}
        </>
      )
    }
    if (!selectedOption) return <span className="opacity-50">Select...</span>
    return (
      <>
        {selectedOption.icon !== undefined && (
          <Logo
            src={selectedOption.icon}
            alt={selectedOption.label}
            fallbackText={selectedOption.label}
            className={`w-4 h-4 ${iconClass}`}
          />
        )}
        {selectedOption.indicator && <span className="opacity-60">{selectedOption.indicator}</span>}
        {selectedOption.label}
      </>
    )
  }

  /** Whether an option is selectable right now (cap reached ⇒ only deselects). */
  const isDisabled = (val: string) => atCap && !selectedSet.has(val)

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
            {triggerContent()}
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

              {props.multiple === true && atCap && props.maxSelectedHint && (
                <p className="shrink-0 text-[11px] text-base-content/50">{props.maxSelectedHint}</p>
              )}

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
                    disabled={isDisabled(opt.value)}
                    className={`w-full text-left px-2.5 py-2 text-sm rounded-lg transition-colors flex items-center gap-1.5 min-w-0 ${
                      selectedSet.has(opt.value)
                        ? 'bg-primary text-primary-content font-medium'
                        : 'bg-base-200 hover:bg-base-300'
                    } ${isDisabled(opt.value) ? 'opacity-40' : ''}`}
                    onClick={() => handleSelect(opt.value)}
                  >
                    {isMulti && (
                      <input
                        type="checkbox"
                        readOnly
                        tabIndex={-1}
                        checked={selectedSet.has(opt.value)}
                        className="checkbox checkbox-xs shrink-0 pointer-events-none"
                      />
                    )}
                    {opt.icon !== undefined && (
                      <Logo
                        src={opt.icon}
                        alt={opt.label}
                        fallbackText={opt.label}
                        className={`w-4 h-4 shrink-0 ${iconClass}`}
                      />
                    )}
                    {opt.indicator && (
                      <span className="opacity-60 text-xs shrink-0">{opt.indicator}</span>
                    )}
                    <span className="flex-1 min-w-0 truncate" title={opt.label}>
                      {opt.label}
                    </span>
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
        <span className="truncate flex items-center gap-1.5 pr-4">{triggerContent()}</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className={`absolute z-50 mt-1 rounded-box border border-base-300 bg-base-100 shadow-lg ${menuClassName}`}
        >
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
            {props.multiple === true && atCap && props.maxSelectedHint && (
              <p className="px-1 pt-1 text-[10px] text-base-content/50">{props.maxSelectedHint}</p>
            )}
          </div>

          {/* Options list */}
          <ul className={`${listMaxHeightClassName} overflow-y-auto py-1`}>
            {filtered.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  disabled={isDisabled(opt.value)}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-base-200 transition-colors cursor-pointer flex items-center gap-1 min-w-0 ${
                    selectedSet.has(opt.value) ? 'bg-primary/10 font-medium' : ''
                  } ${isDisabled(opt.value) ? 'opacity-40 cursor-not-allowed' : ''}`}
                  onClick={() => handleSelect(opt.value)}
                >
                  {isMulti && (
                    <input
                      type="checkbox"
                      readOnly
                      tabIndex={-1}
                      checked={selectedSet.has(opt.value)}
                      className="checkbox checkbox-xs shrink-0 mr-1 pointer-events-none"
                    />
                  )}
                  {opt.icon !== undefined && (
                    <Logo
                      src={opt.icon}
                      alt={opt.label}
                      fallbackText={opt.label}
                      className={`w-4 h-4 shrink-0 ${iconClass}`}
                    />
                  )}
                  {opt.indicator && (
                    <span className="opacity-60 text-xs shrink-0">{opt.indicator}</span>
                  )}
                  <span className="flex-1 min-w-0 truncate" title={opt.label}>
                    {opt.label}
                  </span>
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
