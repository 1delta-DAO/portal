import { useCallback, useEffect, useMemo, useState } from 'react'

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
  resetDeps: ReadonlyArray<unknown> = []
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
    [items, safePage, pageSize]
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

/** {@link TablePagination} without the slice — the server did the cutting. */
export type ServerPagination = Omit<TablePagination<never>, 'pagedItems'>

/**
 * Page index for a list the SERVER pages.
 *
 * {@link useTablePagination} slices an array it already holds; this is its
 * counterpart for a table that fetches one page at a time and learns the total
 * from the response. Hence the two steps: `page` goes into the request, and
 * `paginate(total)` turns the answer into the state `<TablePagination>` takes.
 *
 * `resetKey` is everything that makes page N a different page N — filters,
 * sort, page size. The reset is derived during render rather than run in an
 * effect, so a filter change never sends one request for the old page index
 * under the new filter first.
 */
export function useServerPagination(
  pageSize: number,
  resetKey: string
): {
  page: number
  setPage: (next: number) => void
  paginate: (total: number) => ServerPagination
} {
  const [state, setState] = useState({ page: 0, key: resetKey })
  const page = state.key === resetKey ? state.page : 0

  const setPage = useCallback(
    (next: number) => setState({ page: Math.max(0, next), key: resetKey }),
    [resetKey]
  )

  const paginate = (total: number): ServerPagination => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    return {
      page,
      pageSize,
      totalPages,
      start: total === 0 ? 0 : page * pageSize + 1,
      end: Math.min((page + 1) * pageSize, total),
      hasPrev: page > 0,
      hasNext: page < totalPages - 1,
      setPage,
      next: () => setPage(Math.min(totalPages - 1, page + 1)),
      prev: () => setPage(page - 1),
    }
  }

  return { page, setPage, paginate }
}
