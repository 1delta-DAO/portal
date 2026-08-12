import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../sdk/http'
import { EMPTY_VOCABULARY, type EarnVocabulary } from '../../sdk/earn-helper'

const ENDPOINT = '/v1/data/earn/facets'

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
    queryFn: () => apiFetch<EarnVocabulary>(ENDPOINT),
    // Constants — no reason to refetch while the tab is open.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  return data ?? EMPTY_VOCABULARY
}
