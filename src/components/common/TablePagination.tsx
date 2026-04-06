import React from 'react'
import type { TablePagination as TablePaginationState } from '../../hooks/useTablePagination'

interface TablePaginationProps {
  /** State object returned by `useTablePagination`. */
  pagination: Pick<
    TablePaginationState<unknown>,
    'page' | 'totalPages' | 'start' | 'end' | 'hasPrev' | 'hasNext' | 'next' | 'prev'
  >
  /** Total item count, for the "X–Y of Z" label. */
  totalItems: number
  /** Optional noun for the count label, e.g. "pools". */
  itemNoun?: string
  className?: string
}

/**
 * Bottom-of-table pagination bar: "X–Y of Z" + prev/next buttons +
 * "page N / M". Single source of truth for the pagination chrome that was
 * previously copy-pasted in LendingMarketTable, TradingMarketTable, and
 * ConfigMarketView.
 *
 * Renders nothing when `totalPages <= 1`.
 */
export const TablePagination: React.FC<TablePaginationProps> = ({
  pagination,
  totalItems,
  itemNoun,
  className = '',
}) => {
  const { page, totalPages, start, end, hasPrev, hasNext, next, prev } = pagination

  if (totalPages <= 1) return null

  return (
    <div
      className={`flex items-center justify-between px-3 py-2 border-t border-base-300 text-xs text-base-content/60 ${className}`}
    >
      <span>
        {start}&ndash;{end} of {totalItems}
        {itemNoun ? ` ${itemNoun}` : ''}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn btn-xs btn-ghost"
          disabled={!hasPrev}
          onClick={prev}
          aria-label="Previous page"
        >
          &lsaquo;
        </button>
        <span>
          {page + 1} / {totalPages}
        </span>
        <button
          type="button"
          className="btn btn-xs btn-ghost"
          disabled={!hasNext}
          onClick={next}
          aria-label="Next page"
        >
          &rsaquo;
        </button>
      </div>
    </div>
  )
}
