import { useQuery } from '@tanstack/react-query'
import { BACKEND_BASE_URL } from '../config/backend'

interface ChainsApiResponse {
  success: boolean
  data: { count: number; items: string[] }
}

const DEFAULT_CHAINS = ['1']

export function useChains(): { chains: string[]; isLoading: boolean } {
  const { data, isLoading } = useQuery<string[]>({
    queryKey: ['chains'],
    queryFn: async () => {
      const res = await fetch(`${BACKEND_BASE_URL}/v1/data/chains`)
      const json: ChainsApiResponse = await res.json()
      if (!json.success || !Array.isArray(json.data?.items)) return DEFAULT_CHAINS
      return json.data.items
    },
    staleTime: 5 * 60_000,
  })

  return { chains: data ?? DEFAULT_CHAINS, isLoading }
}
