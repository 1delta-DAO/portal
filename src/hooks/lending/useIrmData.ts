import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../sdk/http'

export interface IrmPoint {
  utilization: number
  borrowRate: number
  depositRate: number
}

export interface IrmMarket {
  marketUid: string
  protocol: string
  lenderKey: string
  chainId: string
  underlyingAddress: string
  marketName: string
  currentUtilization?: number
  points: IrmPoint[]
}

/**
 * Fetches interest rate model (IRM) curves for a given market.
 * Data is relatively static — long stale time (10 min) and refetch interval (30 min).
 */
export function useIrmData(marketUid: string | undefined) {
  return useQuery<IrmMarket | null>({
    queryKey: ['irm', marketUid],
    queryFn: async () => {
      const data = await apiFetch<{ items: IrmMarket[] }>('/v1/data/lending/irm', {
        params: { marketUids: marketUid, dataPoints: 20 },
      })
      return data.items[0] ?? null
    },
    enabled: !!marketUid,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  })
}
