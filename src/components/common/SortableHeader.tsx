import React from 'react'
import type { SortDirection } from '../../hooks/useTableSort'

interface SortableHeaderProps<K extends string> {
  /** The sort key this header controls. */
  sortKey: K
  /** Currently active sort key (from useTableSort or parent state). */
  activeKey: K
  /** Currently active sort direction. */
  activeDir: SortDirection
  /** Called with this header's sortKey when clicked. */
  onToggle: (key: K) => void
  children: React.ReactNode
  className?: string
  title?: string
}

/**
 * `<th>` with click-to-sort behavior and an arrow indicator. Replaces the
 * inline `cursor-pointer select-none` + `sortArrow(key)` recipe duplicated
 * across the lending tables.
 */
export function SortableHeader<K extends string>({
  sortKey,
  activeKey,
  activeDir,
  onToggle,
  children,
  className = '',
  title,
}: SortableHeaderProps<K>) {
  const isActive = sortKey === activeKey
  return (
    <th
      className={`cursor-pointer select-none ${className}`}
      onClick={() => onToggle(sortKey)}
      title={title}
    >
      {children}
      {isActive && (
        <span className="ml-1 text-xs">{activeDir === 'asc' ? '\u2191' : '\u2193'}</span>
      )}
    </th>
  )
}
