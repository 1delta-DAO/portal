import { useQuery } from '@tanstack/react-query'
import { BACKEND_BASE_URL } from '../../config/backend'
import type { AnyTermSheet, TermSheet } from '../../components/lending/terms/types'
import { isFullSheet } from '../../components/lending/terms/types'

/**
 * Fetch the FULL term sheet for one market.
 *
 * The list endpoints default to `?terms=digest` — headline, tags and the
 * exposure rollup, but no exit terms, liquidation params, fees, oracle or
 * governance blocks. That is the right trade for a table of hundreds of rows,
 * and the wrong one for the action panel, where those blocks ARE the content.
 *
 * So the panel asks for the one market it is on. `/lending/pools` is already
 * lender-scoped and cheap at `limit=1`, and the response is cached edge-side,
 * so this is a small request rather than a second full page load.
 */

interface PoolsApiResponse {
  success: boolean
  data?: { items?: { marketUid?: string; termSheet?: AnyTermSheet }[] }
  error?: { message?: string }
}

export function useTermSheet(params: {
  marketUid?: string
  chainId?: string
  /**
   * The digest already on the row. Returned immediately so the panel renders
   * headline + chips + findings with no waiting, then upgrades in place when
   * the full sheet lands. A digest is never WORSE than nothing.
   */
  fallback?: AnyTermSheet
  enabled?: boolean
}): {
  sheet: AnyTermSheet | undefined
  isFull: boolean
  isLoading: boolean
  /** Surfaced so a caller can tell "still fetching" from "genuinely failed". */
  error: unknown
} {
  const { marketUid, chainId, fallback, enabled = true } = params
  const lender = marketUid?.split(':')[0]

  const { data, isLoading, error } = useQuery({
    queryKey: ['termSheet', marketUid ?? ''],
    enabled: enabled && !!marketUid && !!chainId && !!lender,
    // Governance and oracle move far slower than rates, and the whole sheet is
    // a snapshot — a long stale window is correct here, not a shortcut.
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<TermSheet | undefined> => {
      const url = new URL(`${BACKEND_BASE_URL}/v1/data/lending/pools`)
      // `chainId`, NOT `chains`. The origin rejects `chains` with a 500
      // ("chainId is required") — and because this hook falls back to the
      // digest on any failure, getting it wrong shows "Full terms are not
      // loaded" on EVERY market instead of surfacing an error.
      url.searchParams.set('chainId', String(chainId))
      url.searchParams.set('lender', String(lender))
      url.searchParams.set('terms', 'full')
      const r = await fetch(url.toString())
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = (await r.json()) as PoolsApiResponse
      if (!json.success) throw new Error(json.error?.message ?? 'terms fetch failed')
      const row = (json.data?.items ?? []).find((i) => i.marketUid === marketUid)
      // Only accept an actual full sheet — a digest here would silently
      // replace the fallback with something no richer.
      return isFullSheet(row?.termSheet) ? row!.termSheet : undefined
    },
  })

  const sheet = data ?? fallback
  return { sheet, isFull: isFullSheet(sheet), isLoading, error }
}
