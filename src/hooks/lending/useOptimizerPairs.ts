import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  fetchOptimizerPairs,
  optimizerPairsUrl,
  type OptimizerFilters,
  type OptimizerPairRow,
} from '../../sdk/lending-helper/optimizerPairs'

// The optimizer's wire format, data model and normalisers live in the sdk
// module (`sdk/lending-helper/optimizerPairs`); this file is only the
// react-query binding. The re-export keeps the historical import path working.
export * from '../../sdk/lending-helper/optimizerPairs'

export function useOptimizerPairs(filters: OptimizerFilters, enabled = true) {
  const hasAnyAssetFilter =
    !!filters.collaterals?.length ||
    !!filters.debts?.length ||
    !!filters.collateralGroups?.length ||
    !!filters.debtGroups?.length ||
    !!filters.collateralTags?.length ||
    !!filters.debtTags?.length
  const canQuery = enabled && hasAnyAssetFilter
  const url = canQuery ? optimizerPairsUrl(filters) : ''

  const query = useQuery<{ total: number; rows: OptimizerPairRow[] }>({
    queryKey: ['optimizerPairs', url],
    enabled: canQuery,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchInterval: 2 * 60 * 1000,
    retry: 1,
    queryFn: () => fetchOptimizerPairs(filters),
  })

  return {
    rows: query.data?.rows ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}
