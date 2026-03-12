import { useQuery } from '@tanstack/react-query'
import { BACKEND_BASE_URL } from '../../config/backend'

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
  points: IrmPoint[]
}

interface IrmApiResponse {
  success: boolean
  data: { count: number; items: IrmMarket[] }
  error?: { code: string; message: string }
}

/**
 * Fetches interest rate model (IRM) curves for a given market.
 * Data is relatively static — long stale time (10 min) and refetch interval (30 min).
 */
export function useIrmData(marketUid: string | undefined) {
  return useQuery<IrmMarket | null>({
    queryKey: ['irm', marketUid],
    queryFn: async () => {
      const encoded = encodeURIComponent(marketUid!)
      const url = `${BACKEND_BASE_URL}/v1/data/lending/irm?marketUids=${encoded}&dataPoints=20`
      const r = await fetch(url)
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        throw new Error(`HTTP ${r.status}: ${text || r.statusText}`)
      }
      const json = (await r.json()) as IrmApiResponse
      if (!json.success) {
        throw new Error(json.error?.message ?? 'API returned success: false')
      }
      return json.data.items[0] ?? null
    },
    enabled: !!marketUid,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  })
}
