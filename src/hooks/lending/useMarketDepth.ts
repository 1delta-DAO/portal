import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { apiFetch } from '../../sdk/http'

/**
 * Client for the rate-at-depth endpoint:
 *
 *   GET /v1/data/lending/irm/depth?marketUids=…&side=borrow|supply|both
 *
 * Returns, per market, a grid of (borrow/supply AMOUNT → resulting utilization
 * → rate). For a utilization pool the whole balance re-prices to one rate, so
 * each point is the SPOT rate at the post-action utilization — `size = 0` is the
 * current rate, any selected amount is a lookup. Used to draw the per-pair depth
 * chart and the live "rate at your borrow amount" preview in the optimizer.
 */

export interface DepthGridPoint {
  /** Cumulative amount from 0, in token units (same units as the API totals). */
  size: number
  sizeUsd: number | null
  utilization: number
  borrowAprPct: number
  depositAprPct: number
}

export interface DepthGrid {
  side: 'borrow' | 'supply'
  currentUtilization: number
  currentBorrowAprPct: number
  currentDepositAprPct: number
  fillable: number
  fillableUsd: number | null
  points: DepthGridPoint[]
}

export interface MarketDepthItem {
  marketUid: string
  protocol?: string
  lenderKey?: string
  chainId?: string
  decimals?: number
  borrow?: DepthGrid
  supply?: DepthGrid
}

async function fetchMarketDepth(
  marketUids: string[],
  side: 'borrow' | 'supply' | 'both',
): Promise<MarketDepthItem[]> {
  if (marketUids.length === 0) return []
  const data = await apiFetch<{ items?: MarketDepthItem[] }>('/v1/data/lending/irm/depth', {
    params: { marketUids: marketUids.join(','), side },
  })
  return data?.items ?? []
}

/**
 * Fetch depth grids for one or more markets. Falsy UIDs are dropped, so callers
 * can pass `[row.marketShortUid]` without guarding. The query is disabled (no
 * request) when nothing resolves.
 */
export function useMarketDepth(
  marketUids: Array<string | undefined | null>,
  side: 'borrow' | 'supply' | 'both' = 'borrow',
) {
  const uids = marketUids.filter((u): u is string => !!u)
  const key = [...uids].sort().join(',')
  return useQuery({
    queryKey: ['market-depth', key, side],
    queryFn: () => fetchMarketDepth(uids, side),
    enabled: uids.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
}
