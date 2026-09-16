import { useQuery } from '@tanstack/react-query'
import {
  fetchLoopPayAssets,
  type LoopPayAssetsData,
} from '../../sdk/lending-helper/fetchLoopPayAssets'

/**
 * The margin assets a leveraged open on (debt market, collateral market)
 * accepts, from `/v1/actions/loop/leverage/pay-assets`.
 *
 * The answer is a pure function of the pair on the server (no RPC, no
 * account), so it is cached generously and re-fetched only when the pair
 * changes. `undefined` while loading or on failure — the panel falls back to
 * its local collateral / debt / native derivation in that case, so a hiccup
 * on this call never removes the chips.
 */
export function useLoopPayAssets(params: {
  marketUidIn?: string
  marketUidOut?: string
  enabled?: boolean
}): {
  data: LoopPayAssetsData | undefined
  isLoading: boolean
  error: unknown
} {
  const { marketUidIn, marketUidOut, enabled = true } = params
  const { data, isLoading, error } = useQuery({
    queryKey: ['loopPayAssets', marketUidIn ?? '', marketUidOut ?? ''],
    queryFn: ({ signal }) =>
      fetchLoopPayAssets({ marketUidIn: marketUidIn!, marketUidOut: marketUidOut! }, signal),
    enabled: enabled && !!marketUidIn && !!marketUidOut,
    staleTime: 5 * 60_000,
    retry: 1,
  })
  return { data, isLoading, error }
}
