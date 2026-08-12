import { useQuery } from '@tanstack/react-query'
import { apiFetch, apiUrl } from '../../sdk/http'

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

export interface AvailableAssetsParams {
  chainId?: string
  chainIds?: string[]
  lender?: string
  assetGroup?: string
}

export function useAvailableLendingAssets(params: AvailableAssetsParams, enabled = true) {
  const query_params = {
    // chainIds wins when both are supplied — the plural form is the wider ask.
    chainIds: params.chainIds?.length ? params.chainIds.join(',') : undefined,
    chainId: params.chainIds?.length ? undefined : params.chainId,
    lender: params.lender,
    assetGroup: params.assetGroup,
  }

  // The URL doubles as the query key, so a param change refetches.
  const url = apiUrl('/v1/data/token/available', query_params)
  const canQuery = enabled && (!!params.chainId || !!params.chainIds?.length)

  const query = useQuery<{ count: number; items: AvailableAsset[] }>({
    queryKey: ['availableLendingAssets', url],
    enabled: canQuery,
    staleTime: 60 * 60 * 1000, // backend cache is 1h — match it
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: () =>
      apiFetch<{ count: number; items: AvailableAsset[] }>('/v1/data/token/available', {
        params: query_params,
      }),
  })

  return {
    assets: query.data?.items ?? [],
    count: query.data?.count ?? 0,
    isLoading: query.isLoading,
    error: query.error,
  }
}
