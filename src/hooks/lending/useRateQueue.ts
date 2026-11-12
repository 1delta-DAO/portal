import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../sdk/http'
import type { RatePick } from '../../sdk/lending-helper/termSheets'

/** `/v1/data/lending/book` on a user-set-rate market (`pricing: 'queue'`). */
export interface UserSetRateBook {
  picks: RatePick[]
  recommended?: string | null
  levels: { aprPct: number; assets: number; cumulativeAssets: number; fillable?: number }[]
  totalDebt?: number
}

/**
 * The live redemption queue, with its picks resolved at `size` (borrow-token
 * units): the rates that can actually fill this loan. Idle unless `enabled`,
 * and a miss leaves the term sheet's own picks standing.
 */
export function useRateQueue(params: { marketUid?: string; size?: number; enabled?: boolean }) {
  const { marketUid, size = 0, enabled = true } = params
  const rounded = Math.round(size * 100) / 100
  return useQuery<UserSetRateBook>({
    queryKey: ['rateQueue', marketUid ?? '', rounded],
    enabled: enabled && !!marketUid,
    queryFn: () =>
      apiFetch<UserSetRateBook>('/v1/data/lending/book', {
        params: { marketUid, side: 'borrow', size: rounded },
      }),
    placeholderData: (prev) => prev,
    staleTime: 15_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })
}
