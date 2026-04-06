import { useCallback, useState } from 'react'

export type SortDirection = 'asc' | 'desc'

export interface TableSort<K extends string> {
  sortKey: K
  sortDir: SortDirection
  /**
   * Toggles the direction when the same key is clicked, otherwise switches
   * to the new key with `defaultDir` (defaults to "desc" — most numeric
   * lending columns are biggest-first).
   */
  toggleSort: (key: K) => void
  setSortKey: (key: K) => void
  setSortDir: (dir: SortDirection) => void
}

/**
 * Local sort state for tables that own their sorting (LendingMarketTable,
 * TradingMarketTable). Tables whose parent owns sorting (MarketsTable) can
 * still reuse the `toggleSort` semantics by calling this hook in the parent.
 *
 * Domain-agnostic: only knows about a string key and a direction. The
 * actual `sortPools` / `sortBy` call lives in the consumer.
 */
export function useTableSort<K extends string>(
  initialKey: K,
  initialDir: SortDirection = 'desc',
  defaultDir: SortDirection = 'desc',
): TableSort<K> {
  const [sortKey, setSortKey] = useState<K>(initialKey)
  const [sortDir, setSortDir] = useState<SortDirection>(initialDir)

  const toggleSort = useCallback(
    (key: K) => {
      if (key === sortKey) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortKey(key)
        setSortDir(defaultDir)
      }
    },
    [sortKey, defaultDir],
  )

  return { sortKey, sortDir, toggleSort, setSortKey, setSortDir }
}
