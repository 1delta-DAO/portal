import { useState, useCallback, useRef, useEffect } from 'react'

/**
 * Persist filter state to localStorage, scoped by a storage key.
 *
 * - On mount, reads from localStorage and merges with defaults
 * - On every state change, writes to localStorage
 * - Provides a `resetToDefaults` function
 *
 * Usage:
 *   const { filters, setFilter, setFilters, resetToDefaults } = usePersistedFilters(
 *     'markets-view',
 *     { search: '', maxRiskScore: '4', sortKey: 'apr' },
 *     { chainId }  // optional extra key segments
 *   )
 */

type FilterValues = Record<string, string | number | boolean>

function buildKey(namespace: string, segments?: Record<string, string | undefined>): string {
  let key = `filters:${namespace}`
  if (segments) {
    for (const [k, v] of Object.entries(segments)) {
      if (v) key += `:${k}=${v}`
    }
  }
  return key
}

function readStored<T extends FilterValues>(key: string, defaults: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return defaults
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return defaults
    // Only keep keys that exist in defaults, with correct types
    const result = { ...defaults }
    for (const k of Object.keys(defaults)) {
      if (k in parsed && typeof parsed[k] === typeof defaults[k]) {
        result[k as keyof T] = parsed[k]
      }
    }
    return result
  } catch {
    return defaults
  }
}

function writeStored(key: string, values: FilterValues): void {
  try {
    localStorage.setItem(key, JSON.stringify(values))
  } catch {
    // quota exceeded or unavailable — silently ignore
  }
}

export function usePersistedFilters<T extends FilterValues>(
  namespace: string,
  defaults: T,
  segments?: Record<string, string | undefined>
) {
  const storageKey = buildKey(namespace, segments)
  const defaultsRef = useRef(defaults)

  const [filters, setFiltersState] = useState<T>(() => readStored(storageKey, defaults))

  // Re-read from storage when the key changes (e.g. chain switch)
  const prevKeyRef = useRef(storageKey)
  useEffect(() => {
    if (prevKeyRef.current !== storageKey) {
      prevKeyRef.current = storageKey
      setFiltersState(readStored(storageKey, defaultsRef.current))
    }
  }, [storageKey])

  // Write to storage on change
  useEffect(() => {
    writeStored(storageKey, filters)
  }, [storageKey, filters])

  const setFilter = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setFiltersState((prev) => ({ ...prev, [key]: value }))
  }, [])

  const setFilters = useCallback((partial: Partial<T>) => {
    setFiltersState((prev) => ({ ...prev, ...partial }))
  }, [])

  const resetToDefaults = useCallback(() => {
    setFiltersState(defaultsRef.current)
  }, [])

  return { filters, setFilter, setFilters, resetToDefaults }
}
