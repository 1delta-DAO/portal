import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../sdk/http'
import type { PoolEntry } from '../../sdk/lending-helper/poolTypes'
import { lenderKeyOf } from '../../sdk/lending-helper/fluidSmart'

/**
 * The market rows of ONE vault, for a surface that holds a `marketUid` and
 * nothing else.
 *
 * WHY THIS EXISTS. The Fluid smart descriptor (`fluid`, `autoBalanced`) lives
 * on MARKET rows. Screens built on `/lending/latest` or `/lending/pools` have
 * it already — but the optimizer works from PAIR rows, which carry only a
 * derived `isBasketLong` flag and no legs, no `perShare` and no leg order. So a
 * pair surface cannot build a two-amount form without asking for the markets.
 *
 * A Fluid vault IS a lender key, so this is one filtered request, and React
 * Query dedupes it across the panel's re-renders. Disabled when the uid is
 * missing, so it costs nothing on the ordinary path.
 */
export function useVaultLegs(chainId: string | undefined, marketUid: string | undefined) {
  const lender = marketUid ? lenderKeyOf(marketUid) : undefined
  // Only Fluid keys can be smart today, and asking for every lender's markets
  // on every pair selection would be a real cost for no possible answer.
  const enabled = !!chainId && !!lender && lender.startsWith('FLUID_')

  const { data, isLoading } = useQuery<PoolEntry[]>({
    queryKey: ['vaultLegs', chainId, lender],
    enabled,
    queryFn: async () => {
      const res = await apiFetch<{ items: PoolEntry[] }>('/v1/data/lending/pools', {
        params: { chainId, lender, count: 20 },
      })
      return res.items ?? []
    },
    staleTime: 60_000,
    retry: 1,
  })

  return {
    legs: data ?? [],
    /** The row for this exact market, which carries the descriptor. */
    row: (data ?? []).find((p) => p.marketUid === marketUid),
    isLoading,
  }
}
