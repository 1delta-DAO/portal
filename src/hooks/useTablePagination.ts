import { useEffect, useMemo, useState } from 'react'

export interface TablePagination<T> {
  /** Current zero-based page index. */
  page: number
  pageSize: number
  /** At least 1, even when `items` is empty. */
  totalPages: number
  /** The slice of `items` for the current page. */
  pagedItems: T[]
  /** 1-based index of the first visible item, for display ("X–Y of Z"). */
  start: number
  /** 1-based index of the last visible item. */
  end: number
  hasPrev: boolean
  hasNext: boolean
  setPage: (next: number) => void
  next: () => void
  prev: () => void
}

/**
 * Generic, opinionated table pagination hook. Owns the page index, slices
 * the input array, and auto-resets to page 0 whenever the item count or any
 * of the supplied `resetDeps` change (typically the search/sort state).
 *
 * Domain-agnostic: works with any array of `T`.
 */
export function useTablePagination<T>(
  items: T[],
  pageSize: number,
  /**
   * Extra dependencies that should reset the current page back to 0 when
   * they change (e.g. search query, sort key, sort direction).
   */
  resetDeps: ReadonlyArray<unknown> = [],
): TablePagination<T> {
  const [page, setPage] = useState(0)

  const itemCount = items.length
  // Reset to first page on items.length / resetDeps change. We deliberately
  // depend on length, not the array reference, so re-renders that produce a
  // fresh array don't bounce the user back to page 0.
  useEffect(() => {
    setPage(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemCount, ...resetDeps])

  const totalPages = Math.max(1, Math.ceil(itemCount / pageSize))

  // Clamp the page if items shrunk below the current page's start.
  const safePage = Math.min(page, totalPages - 1)

  const pagedItems = useMemo(
    () => items.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [items, safePage, pageSize],
  )

  const start = itemCount === 0 ? 0 : safePage * pageSize + 1
  const end = Math.min((safePage + 1) * pageSize, itemCount)

  return {
    page: safePage,
    pageSize,
    totalPages,
    pagedItems,
    start,
    end,
    hasPrev: safePage > 0,
    hasNext: safePage < totalPages - 1,
    setPage,
    next: () => setPage((p) => Math.min(totalPages - 1, p + 1)),
    prev: () => setPage((p) => Math.max(0, p - 1)),
  }
}
