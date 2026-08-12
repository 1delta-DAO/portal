import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../sdk/http'

export interface EarnHistoryPoint {
  /** ISO timestamp. */
  t: string
  /** Percent, like every rate on this surface. */
  apr?: number
  tvlUsd?: number
  /** Vault rows only — a lending position has no share price. */
  sharePrice?: number
}

export interface EarnHistory {
  points: EarnHistoryPoint[]
  /**
   * Told by the server rather than inferred from the data: "no history
   * recorded yet" and "this venue has no share price" are different facts, and
   * an empty array cannot distinguish them.
   */
  hasSharePrice: boolean
  isLoading: boolean
  error: Error | null
}

/**
 * The series behind one earn row.
 *
 * ONE endpoint for both halves — the uid tells the server which snapshot table
 * to read. Calling a lending route for one uid and a vault route for another
 * would put the venue-kind branch back in the browser, which is what the
 * unified surface exists to remove.
 */
export function useEarnHistory(earnUid: string | undefined, days = 30): EarnHistory {
  const { data, isLoading, error } = useQuery({
    queryKey: ['earnHistory', earnUid ?? '', days],
    enabled: !!earnUid,
    queryFn: () =>
      apiFetch<{ points: EarnHistoryPoint[]; hasSharePrice: boolean }>('/v1/data/earn/history', {
        params: { earnUid, days },
      }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  return {
    points: data?.points ?? [],
    hasSharePrice: data?.hasSharePrice ?? false,
    isLoading,
    error: (error as Error) ?? null,
  }
}
