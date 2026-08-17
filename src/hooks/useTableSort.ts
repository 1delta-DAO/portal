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
 * The one definition of "what a header click does": clicking the active column
 * flips the direction, clicking a new one switches to it at `defaultDir`.
 *
 * Pure, so it serves both storage models. Views that keep sort in local state
 * use {@link useTableSort}, which wraps this. Views that persist it (Earn and
 * Lending route it through `usePersistedFilters`, so it survives a reload) call
 * this directly with their own setters — they can't use the hook, but they must
 * not re-implement the semantics, which is how the tables drifted apart before.
 */
export function nextSort<K extends string>(
  current: { sortKey: K; sortDir: SortDirection },
  key: K,
  defaultDir: SortDirection = 'desc'
): { sortKey: K; sortDir: SortDirection } {
  if (key === current.sortKey) {
    return { sortKey: key, sortDir: current.sortDir === 'asc' ? 'desc' : 'asc' }
  }
  return { sortKey: key, sortDir: defaultDir }
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
  defaultDir: SortDirection = 'desc'
): TableSort<K> {
  const [sortKey, setSortKey] = useState<K>(initialKey)
  const [sortDir, setSortDir] = useState<SortDirection>(initialDir)

  const toggleSort = useCallback(
    (key: K) => {
      const next = nextSort({ sortKey, sortDir }, key, defaultDir)
      setSortKey(next.sortKey)
      setSortDir(next.sortDir)
    },
    [sortKey, sortDir, defaultDir]
  )

  return { sortKey, sortDir, toggleSort, setSortKey, setSortDir }
}
