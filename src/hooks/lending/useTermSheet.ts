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

interface LendingLatestApiResponse {
  success: boolean
  data?: {
    items?: {
      markets?: { marketUid?: string; termSheet?: AnyTermSheet }[]
    }[]
  }
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
    // Keyed on (chain, lender) rather than on the market, because the request
    // IS per-lender: one call returns every market that lender has on the
    // chain. A loop panel needs two sheets from the SAME lender, and keying on
    // marketUid made those two identical 3.4 MB responses (Aave V3 on Ethereum,
    // 67 markets at `terms=full`) miss each other in the cache and download
    // twice. Sharing the key lets React Query dedupe them, and `select` picks
    // the row — so both sides also land in the same render rather than
    // popping in one after the other.
    queryKey: ['termSheets', String(chainId ?? ''), lender ?? ''],
    select: (rows: Map<string, TermSheet>) =>
      marketUid ? rows.get(marketUid) : undefined,
    enabled: enabled && !!marketUid && !!chainId && !!lender,
    // Governance and oracle move far slower than rates, and the whole sheet is
    // a snapshot — a long stale window is correct here, not a shortcut.
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Map<string, TermSheet>> => {
      // `/lending/latest`, NOT `/lending/pools`.
      //
      // `/pools` carries no `config` map at all, and almost everything a
      // borrower reads is derived from it: LTV, liquidation threshold,
      // penalty, the e-mode `modes[]` (Aave V3 mainnet has EIGHT categories)
      // and the accepted-collateral set. A sheet built from `/pools` is
      // technically "full" — every block present — while being empty of the
      // numbers that matter, which is exactly how Aave V3 ended up showing
      // nothing but a headline.
      //
      // Note the parameter names differ between the two endpoints:
      // `/latest` takes `chains` + `lenders` (plural), `/pools` takes
      // `chainId` + `lender`. Getting that wrong 500s.
      const url = new URL(`${BACKEND_BASE_URL}/v1/data/lending/latest`)
      url.searchParams.set('chains', String(chainId))
      url.searchParams.set('lenders', String(lender))
      url.searchParams.set('terms', 'full')
      const r = await fetch(url.toString())
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = (await r.json()) as LendingLatestApiResponse
      if (!json.success) throw new Error(json.error?.message ?? 'terms fetch failed')
      // Only actual FULL sheets go in the map — a digest here would silently
      // replace the caller's fallback with something no richer.
      //
      // Returning a Map (never `undefined`) also matters: a TanStack v5
      // `queryFn` that resolves to `undefined` THROWS "Query data cannot be
      // undefined", so the old shape turned "this market has no full sheet"
      // into a retrying error rather than a quiet fallback.
      const out = new Map<string, TermSheet>()
      for (const m of (json.data?.items ?? []).flatMap((i) => i.markets ?? [])) {
        if (m.marketUid && isFullSheet(m.termSheet)) out.set(m.marketUid, m.termSheet)
      }
      return out
    },
  })

  const sheet = data ?? fallback
  return { sheet, isFull: isFullSheet(sheet), isLoading, error }
}
