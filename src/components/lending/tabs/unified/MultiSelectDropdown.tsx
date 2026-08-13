import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EarnFacetBucket } from '../../../../sdk/earn-helper'

interface Props {
  /** Button label when nothing is selected, e.g. "All venues". */
  placeholder: string
  options: EarnFacetBucket[]
  selected: string[]
  onChange: (next: string[]) => void
  /** Show the filter box above ~this many options. */
  searchThreshold?: number
}

/**
 * Multi-select over a facet dimension.
 *
 * Replaces the inline chip cloud, which did not survive contact with real data:
 * one chain renders 60+ venues, so the chips pushed the table three screens
 * down and every `MORPHO_BLUE_<32-byte id>` key wrapped across two lines.
 *
 * Options are whatever the server sent — this component has no idea what a
 * venue or a brand is, and long keys are truncated with the full value on
 * `title` rather than shortened by a rule that would have to know their shape.
 *
 * Open state is REACT STATE, not `<details open>`. The native element closes
 * only when its own summary is clicked again — so opening a second filter left
 * the first one hanging over the table — and it cannot be dismissed with
 * Escape. Every other menu in this app (RiskSelect, SearchableSelect, the
 * settings and theme menus) is the ref + outside-mousedown pattern below; this
 * was the odd one out.
 */
export const MultiSelectDropdown: React.FC<Props> = ({
  placeholder,
  options,
  selected,
  onChange,
  searchThreshold = 8,
}) => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  // Dropping the filter text on close: reopening onto a stale "silo" query
  // hides the very options the summary says are selected.
  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) => o.key.toLowerCase().includes(q) || (o.label ?? '').toLowerCase().includes(q)
    )
  }, [options, query])

  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key])

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (options.find((o) => o.key === selected[0])?.label ?? selected[0])
        : `${placeholder} · ${selected.length}`

  if (options.length === 0) return null

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="btn btn-xs btn-outline max-w-[16rem] flex-nowrap"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="truncate">{summary}</span>
        <span className="opacity-60">▾</span>
      </button>

      {open && (
        // z-50 per the DESIGN.md ladder. At z-20 it TIED with the table's
        // sticky headers, and a tie is broken by DOM order — the table comes
        // later, so the header painted over the top of the open menu.
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg">
          {options.length > searchThreshold && (
            <input
              type="text"
              className="input input-bordered input-xs mb-2 w-full"
              placeholder="Filter…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}

          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-1 py-2 text-xs opacity-60">No matches</div>
            )}
            {filtered.map((o) => (
              <label
                key={o.key}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-base-200"
                // Truncation hides the tail of a long key; the full value stays
                // reachable rather than being lost.
                title={o.description ? `${o.key} — ${o.description}` : o.key}
              >
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs shrink-0"
                  checked={selected.includes(o.key)}
                  onChange={() => toggle(o.key)}
                />
                <span className="min-w-0 flex-1 truncate text-xs">{o.label ?? o.key}</span>
                <span className="shrink-0 text-[10px] opacity-50">{o.count}</span>
              </label>
            ))}
          </div>

          {selected.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-xs mt-1 w-full"
              onClick={() => onChange([])}
            >
              Clear {selected.length}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
