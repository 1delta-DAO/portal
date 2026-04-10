import { useQuery } from '@tanstack/react-query'
import { BACKEND_BASE_URL } from '../../config/backend'

/**
 * Client for `GET /v1/data/token/available` — the canonical list of assets
 * the optimizer can actually price/lend. Backend caches for an hour, so we
 * lean on react-query for in-memory dedupe rather than refetching.
 */

export interface AvailableAsset {
  address: string
  chain_id: string
  symbol?: string
  name?: string
  decimals?: number
  logoURI?: string
  assetGroup?: string
  // The schema documents only `address, chain_id, symbol, name, and additional
  // metadata` — keep an escape hatch so we don't have to redeploy when the
  // backend grows new fields.
  [extra: string]: unknown
}

interface ApiResponse {
  success: boolean
  data: { count: number; items: AvailableAsset[] }
  error?: { code: string; message: string }
}

export interface AvailableAssetsParams {
  chainId?: string
  chainIds?: string[]
  lender?: string
  assetGroup?: string
}

export function useAvailableLendingAssets(params: AvailableAssetsParams, enabled = true) {
  const search = new URLSearchParams()
  if (params.chainIds?.length) search.set('chainIds', params.chainIds.join(','))
  else if (params.chainId) search.set('chainId', params.chainId)
  if (params.lender) search.set('lender', params.lender)
  if (params.assetGroup) search.set('assetGroup', params.assetGroup)

  const url = `${BACKEND_BASE_URL}/v1/data/token/available?${search.toString()}`
  const canQuery = enabled && (!!params.chainId || !!params.chainIds?.length)

  const query = useQuery<{ count: number; items: AvailableAsset[] }>({
    queryKey: ['availableLendingAssets', url],
    enabled: canQuery,
    staleTime: 60 * 60 * 1000, // backend cache is 1h — match it
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async () => {
      const r = await fetch(url)
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        throw new Error(`HTTP ${r.status}: ${text || r.statusText}`)
      }
      const json = (await r.json()) as ApiResponse
      if (!json.success) throw new Error(json.error?.message ?? 'API returned success: false')
      return json.data
    },
  })

  return {
    assets: query.data?.items ?? [],
    count: query.data?.count ?? 0,
    isLoading: query.isLoading,
    error: query.error,
  }
}
