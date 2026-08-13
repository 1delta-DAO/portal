import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import {
  fetchEarnPositions,
  mergeEarnPositions,
  EMPTY_POSITION_TOTALS,
  type EarnPosition,
  type EarnPositionSourceStatus,
  type EarnPositionTotals,
} from '../../sdk/earn-helper'

export interface UseEarnPositionsParams {
  chainIds: string[]
  account?: string
  venueKind?: 'lending' | 'vault'
  includeZero?: boolean
  enabled?: boolean
}

export interface UseEarnPositionsResult {
  items: EarnPosition[]
  /** Over the rows PRESENT — see `pendingChains` before calling it complete. */
  totals: EarnPositionTotals
  /** Per-half health, merged across chains. Worst status wins. */
  sources: EarnPositionSourceStatus[]
  /** A lending read was incomplete — totals are a lower bound. */
  partial: boolean
  /** Something came from a last-known-good snapshot rather than a live read. */
  stale: boolean
  /**
   * Chains still loading. **Non-empty ⇒ `totals` is not the whole portfolio**
   * — it covers the chains that have answered. A caller must say so rather
   * than presenting a partial sum as the user's net worth.
   */
  pendingChains: string[]
  /** Chains whose request failed outright. Their rows are missing entirely. */
  failedChains: string[]
  /** True only when NOTHING has resolved yet. */
  isLoading: boolean
  isFetching: boolean
  /** Set only when every chain failed; a partial result reports per-chain. */
  error: Error | null
  refetch: () => void
}

const QUERY_OPTIONS = {
  // Balances are refetched harder than the catalogue (30s/60s): a listing may
  // lag a little, a balance shown after the user has moved it is wrong.
  staleTime: 15_000,
  refetchInterval: 30_000,
  refetchOnWindowFocus: false,
  retry: 1,
} as const

/**
 * The account's supply-side portfolio — lending positions AND vault balances,
 * every selected chain.
 *
 * Replaces the `useUserData` + `useVaultsCatalog` + `useUserVaults` trio the
 * older Earn tab needs, and with it the two things that trio cannot do
 * correctly: its vault half is single-chain (so the older tab silently drops
 * every vault position off `chainIds[0]`) and it cannot DISCOVER, so it has to
 * be handed each chain's whole catalogue as a query string.
 *
 * **One query per chain AND per half, though the endpoint accepts a CSV and
 * both halves at once.** Chain selection is a thing users change constantly,
 * and a single multi-chain query makes the selection part of the cache key — so
 * adding a fourth chain would throw away the three already on screen and
 * re-read every position on all four. Keyed per chain instead:
 *
 *  - **removing a chain costs no network at all** — its rows simply leave;
 *  - **adding one fetches only that chain**, the rest render from cache;
 *  - a slow or failing chain degrades to a named row rather than blocking the
 *    portfolio or emptying the table.
 *
 * Splitting the HALVES on top of that is about latency, not caching: the two
 * are wildly unequal and one request runs at the pace of the slower one — see
 * the note on `requests` below.
 *
 * The cost is that totals are re-derived client-side over the rows present.
 * That is deliberate: while a chain is still loading, the server's own totals
 * would describe a portfolio the table is not showing. See
 * `mergeEarnPositions`.
 */
export function useEarnPositions(params: UseEarnPositionsParams): UseEarnPositionsResult {
  const { chainIds, account, venueKind, includeZero = false, enabled = true } = params

  // Sorted + de-duplicated so a reorder never re-keys a query.
  const chains = useMemo(
    () => [...new Set(chainIds)].sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chainIds.join(',')]
  )

  const queryEnabled = enabled && !!account && chains.length > 0

  /**
   * One request per (chain, HALF) — not per chain.
   *
   * The two halves are wildly unequal and the combined request runs at the pace
   * of the slower one. Measured on the hosted API for one account on chain 1:
   * the vault half answers in ~2.8 s, the lending half in ~11.5 s, and asking
   * for both in one request takes ~11.9 s. Split, the vault positions are on
   * screen four times sooner and the lending half lands when it lands.
   *
   * A caller that asked for one half gets exactly that one — the split is only
   * ours to make when the caller wanted everything.
   */
  const requests = useMemo(
    () =>
      chains.flatMap((chainId) =>
        (venueKind ? [venueKind] : (['lending', 'vault'] as const)).map((half) => ({
          chainId,
          half,
        }))
      ),
    [chains, venueKind]
  )

  const results = useQueries({
    queries: requests.map(({ chainId, half }) => ({
      queryKey: ['earnPositions', chainId, account ?? '', half, includeZero ? '1' : '0'],
      enabled: queryEnabled,
      queryFn: async () => {
        const res = await fetchEarnPositions({
          chainIds: [chainId],
          account: account!,
          venueKind: half,
          includeZero,
        })
        if (!res.success) {
          throw new Error(res.error ?? `Failed to load ${half} positions on ${chainId}`)
        }
        return res
      },
      ...QUERY_OPTIONS,
    })),
  })

  return useMemo(() => {
    const merged = mergeEarnPositions(results.map((r) => r.data))

    // Per CHAIN, though the queries are per half: the caller reports chains,
    // and a chain is only fully read once both of its halves are in.
    const pending = new Set<string>()
    const failed = new Set<string>()
    results.forEach((r, i) => {
      const { chainId } = requests[i]
      if (r.error) failed.add(chainId)
      // Pending means "has never resolved". A background refetch over data we
      // already hold is `isFetching`, not a hole in the portfolio.
      //
      // ONE half outstanding still counts: `totals` would be missing every
      // lending position, and this flag is what tells the caller the sum on
      // screen is not the user's net worth.
      else if (r.data === undefined) pending.add(chainId)
    })
    const pendingChains = chains.filter((c) => pending.has(c))
    const failedChains = chains.filter((c) => failed.has(c))

    return {
      ...merged,
      totals: merged.items.length ? merged.totals : EMPTY_POSITION_TOTALS,
      pendingChains,
      failedChains,
      // Only when nothing at all has resolved. With one chain of four still in
      // flight the other three are real positions and must be on screen.
      isLoading: queryEnabled && results.length > 0 && results.every((r) => r.isLoading),
      isFetching: results.some((r) => r.isFetching),
      // A per-chain failure is reported per chain, not as a dead hook — the
      // rest of the portfolio is still true. Only EVERY request failing is a
      // dead hook, which with split halves means both halves of every chain.
      error:
        results.length > 0 && results.every((r) => r.error)
          ? ((results[0]?.error as Error) ?? null)
          : null,
      refetch: () => results.forEach((r) => r.refetch()),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, chains, requests, queryEnabled])
}
