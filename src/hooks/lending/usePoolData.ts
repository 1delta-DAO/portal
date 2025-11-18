import { getAvailableMarginChainIds } from "@1delta/lib-utils"
import { LenderData, PoolWithMeta } from "@1delta/margin-fetcher"
import { useQuery } from "@tanstack/react-query"

type PoolsApiResponse = {
    fetchedAt: number | string
    chainIds: string[]
    pools: PoolWithMeta[]
}

// @ts-ignore
const BACKEND_BASE_URL = `https://margin-data.staging.1delta.io` // import.meta.env.VITE_MARGIN_API_URL
const endpointPools = `${BACKEND_BASE_URL}/lending-pools-fast`

/**
 * Helper to build URL with multi-value params (?chainId=1&chainId=10&protocol=aave ...)
 * If you prefer comma-separated, toggle the commented line in appendArray().
 */
function buildPoolsUrl(base: string, chainIds?: (number | string)[], protocols?: string[]) {
    const url = new URL(base)

    const appendArray = (key: string, values?: (string | number)[]) => {
        if (!values || values.length === 0) return
        values.forEach((v) => url.searchParams.append(key, String(v)))
        // If your server expects comma-separated instead of repeated keys:
        // url.searchParams.set(key, values.map(String).join(','))
    }

    appendArray("chainId", chainIds)
    appendArray("protocol", protocols)

    return url.toString()
}

/**
 * useFlattenedPools
 * Fetches from the Worker endpoint that returns flattened PoolWithMeta[] from KV,
 * filtered by chainId[] and protocol[].
 */
export function useFlattenedPools(params?: { chainIds?: string[]; protocols?: string[]; enabled?: boolean }) {
    const chainIds = params?.chainIds
    const protocols = params?.protocols
    const enabled = params?.enabled ?? true

    const url = buildPoolsUrl(endpointPools, chainIds, protocols)

    const { data, isLoading, isFetching, error } = useQuery<PoolsApiResponse>({
        queryKey: ["flattenedPools", url],
        enabled,
        queryFn: async () => {
            const r = await fetch(url)
            if (!r.ok) {
                const text = await r.text().catch(() => "")
                throw new Error(`HTTP ${r.status}: ${text || r.statusText}`)
            }
            const json = (await r.json()) as PoolsApiResponse

            // Defensive narrowing
            const pools = Array.isArray(json?.pools) ? json.pools : []
            const chainIdsResp = Array.isArray(json?.chainIds) ? json.chainIds.map(String) : []

            return {
                fetchedAt: json?.fetchedAt ?? 0,
                chainIds: chainIdsResp,
                pools,
            }
        },
        // Your KV is updated via cron every ~7 minutes:
        // poll slightly less frequently to avoid waste (e.g., 8 minutes)
        refetchInterval: 8 * 60 * 1000,
        staleTime: 30_000, // tweak as you like
        retry: 1,
        // If you want steady UI between refetches:
        // keepPreviousData: true,
        refetchOnWindowFocus: false,
    })

    return {
        pools: data?.pools ?? [],
        fetchedAt: data?.fetchedAt,
        chainIds: data?.chainIds ?? [],
        isPoolsLoading: isLoading, // initial load only
        isPoolsFetching: isFetching, // any in-flight fetch
        error,
    }
}
const endpointLenderData = `${BACKEND_BASE_URL}/lending-multi-fast?chains=`

export function useMarginPublicData(chainId: string) {
    const {
        data: lenderData,
        isLoading,
        isFetching,
        error,
    } = useQuery<LenderData>({
        queryKey: ["lendingPublic", chainId],
        queryFn: async () => {
            const r = await fetch(endpointLenderData + chainId)
            if (!r.ok) {
                const text = await r.text().catch(() => "")
                throw new Error(`HTTP ${r.status}: ${text || r.statusText}`)
            }
            const json = await r.json()
            // Optionally validate json.data here
            return json.data as LenderData
        },
        refetchInterval: 5 * 60 * 1000,
        staleTime: 5_000,
        retry: 1,
    })
    return {
        lenderData,
        isPublicDataLoading: isLoading,
        isPublicDataFetching: isFetching,
        error,
    }
}
