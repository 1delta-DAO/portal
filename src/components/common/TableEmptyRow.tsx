import React from 'react'

interface TableEmptyRowProps {
  /** colSpan must match the table's column count. */
  colSpan: number
  /** Defaults to a generic "No results" string. */
  children?: React.ReactNode
  className?: string
}

/**
 * Single-row empty state for `<table>`. Use inside a `<tbody>` when there
 * are no rows to render — replaces the bespoke
 * `<tr><td colSpan={N} className="text-center py-6 text-sm text-base-content/60">…</td></tr>`
 * boilerplate scattered across the lending tables.
 */
export const TableEmptyRow: React.FC<TableEmptyRowProps> = ({
  colSpan,
  children = 'No results',
  className = '',
}) => (
  <tr>
    <td
      colSpan={colSpan}
      className={`text-center py-6 text-sm text-base-content/60 ${className}`}
    >
      {children}
    </td>
  </tr>
)
