import { useQuery } from '@tanstack/react-query'
import { BACKEND_BASE_URL } from '../../config/backend'
import { EMPTY_VOCABULARY, type EarnVocabulary } from '../../sdk/earn-helper'

const ENDPOINT = `${BACKEND_BASE_URL}/v1/data/earn/facets`

/**
 * The server's display vocabulary — labels for exit modes, venue kinds,
 * actions, gating reasons and rate kinds.
 *
 * Fetched rather than embedded so this app carries no enum values at all. It is
 * pure constants on the server, so it caches for the session; a stale copy at
 * worst renders a new key as itself, which is the intended fallback anyway.
 */
export function useEarnVocabulary(): EarnVocabulary {
  const { data } = useQuery<EarnVocabulary>({
    queryKey: ['earnVocabulary'],
    queryFn: async () => {
      const res = await fetch(ENDPOINT)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      return (json.data ?? json) as EarnVocabulary
    },
    // Constants — no reason to refetch while the tab is open.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  return data ?? EMPTY_VOCABULARY
}
