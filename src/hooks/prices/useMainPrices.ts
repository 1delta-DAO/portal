import { useQuery } from '@tanstack/react-query'
import { fetchMainPrices, fetchMainPricesHist } from './getMainPrices'

interface OracleData {
  [key: string]: number
}

/**
 * Live prices hook – refetches every 3 minutes.
 */
export function useMainPrices() {
  return useQuery<OracleData>({
    queryKey: ['mainPrices'],
    queryFn: fetchMainPrices,
    // 3 minutes
    refetchInterval: 3 * 60 * 1000,
    refetchIntervalInBackground: true,
    // consider data "fresh" slightly less than interval
    staleTime: 2.5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })
}

/**
 * 24h historical prices hook – only fetched once per session.
 * We achieve "once per session" by:
 *  - staleTime: Infinity (never becomes stale)
 *  - cacheTime: Infinity (never garbage collected while app is running)
 *  - no automatic refetching
 */
export function useMainPricesHist() {
  return useQuery<OracleData>({
    queryKey: ['mainPricesHist'],
    queryFn: fetchMainPricesHist,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  })
}
