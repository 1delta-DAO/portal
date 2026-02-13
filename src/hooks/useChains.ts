import { useQuery } from '@tanstack/react-query'
import { BACKEND_BASE_URL } from '../config/backend'

interface ChainsApiResponse {
  success: boolean
  data: string[]
}

const DEFAULT_CHAINS = ['1']

export function useChains(): string[] {
  const { data } = useQuery<string[]>({
    queryKey: ['chains'],
    queryFn: async () => {
      const res = await fetch(`${BACKEND_BASE_URL}/v1/data/chains`)
      const json: ChainsApiResponse = await res.json()
      if (!json.success || !Array.isArray(json.data)) return DEFAULT_CHAINS
      return json.data
    },
    staleTime: 5 * 60_000,
    placeholderData: DEFAULT_CHAINS,
  })

  return data ?? DEFAULT_CHAINS
}
