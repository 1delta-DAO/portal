import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../sdk/http'
import { fetchUserDataViaRpc } from './fetchUserDataRpc'
import { USER_POSITIONS_RPC } from '../../config/flags'
import type {
  RawLenderUserDataEntry,
  LenderUserDataEntry,
  UserAprData,
  UserBalanceData,
  UserDataResult,
  UserDataSummary,
} from '../../sdk/lending-helper/userPositionTypes'

// ============================================================================
// Transform
// ============================================================================

const ZERO_BALANCE_DATA: UserBalanceData = {
  collateral: 0,
  collateralAllActive: 0,
  deposits: 0,
  debt: 0,
  nav: 0,
  deposits24h: 0,
  debt24h: 0,
  nav24h: 0,
}

const ZERO_APR_DATA: UserAprData = {
  apr: 0,
  borrowApr: 0,
  depositApr: 0,
  rewards: {},
  rewardApr: 0,
  rewardDepositApr: 0,
  rewardBorrowApr: 0,
  intrinsicApr: 0,
  intrinsicDepositApr: 0,
  intrinsicBorrowApr: 0,
}

function transformUserDataEntry(raw: RawLenderUserDataEntry): LenderUserDataEntry {
  const subs = raw.data ?? []

  // Use top-level if provided, otherwise derive from first sub-account
  const balanceData = raw.balanceData ?? (subs.length > 0 ? subs[0].balanceData : ZERO_BALANCE_DATA)
  const aprData = raw.aprData ?? (subs.length > 0 ? subs[0].aprData : ZERO_APR_DATA)
  const healthFactor = raw.healthFactor !== undefined ? raw.healthFactor : (subs[0]?.health ?? null)
  const leverage =
    raw.leverage ??
    (balanceData.deposits > 0 && balanceData.nav > 0 ? balanceData.deposits / balanceData.nav : 0)

  return {
    account: raw.account,
    chainId: raw.chainId,
    lender: raw.lender,
    balanceData,
    aprData,
    healthFactor,
    leverage,
    lenderInfo: raw.lenderInfo,
    data: subs,
  }
}

// ============================================================================
// Endpoint
// ============================================================================

const endpointUserData = '/v1/data/lending/user-positions'

// Global override lives in config/flags.ts (VITE_USER_POSITIONS_RPC); the
// per-chain lists below apply either way.
const USE_RPC_FETCH = USER_POSITIONS_RPC

// Per-chain override: these chains always fetch user positions locally via RPC,
// regardless of USE_RPC_FETCH. Used for chains the API does not (yet) serve well.
//   1329 = SEI Network, 1868 = SONEIUM, 1672 = Pharos, 4663 = Robinhood Chain
const FORCE_RPC_FETCH_CHAINS = new Set<string>(['1329', '1868', '1672', '4663'])

// Chains that must keep using the API even when USE_RPC_FETCH is on — an
// escape hatch for chains whose public RPCs can't serve the multicall.
const FORCE_API_FETCH_CHAINS = new Set<string>()

/** Whether to fetch user positions via RPC (vs the API) for a given chain. */
function shouldUseRpcFetch(chainId: string): boolean {
  if (FORCE_API_FETCH_CHAINS.has(chainId)) return false
  return USE_RPC_FETCH || FORCE_RPC_FETCH_CHAINS.has(chainId)
}

// ============================================================================
// Hook
// ============================================================================

/**
 * useUserData
 * Fetches user lending positions from the /lending/user-positions endpoint.
 *
 * Accepts either a single `chainId` or a `chainIds` list — the endpoint takes
 * a `chains` CSV natively and tags every entry with its `chainId`, so a
 * multi-chain read is one request. Consumers rendering a mixed-chain list must
 * act on `entry.chainId`, never on the tab's selection, or they will build
 * transactions against the wrong chain.
 */
export function useUserData(params: {
  chainId?: string
  chainIds?: string[]
  account?: string
  enabled?: boolean
  lenders?: string[]
}) {
  const { account, lenders } = params
  const chainIds = params.chainIds?.length
    ? params.chainIds
    : params.chainId
      ? [params.chainId]
      : []
  // Sorted so a reordered selection hits the same cache entry.
  const chainsKey = [...chainIds].sort().join(',')
  const enabled = (params.enabled ?? true) && !!account && chainIds.length > 0

  const lendersKey = lenders && lenders.length > 0 ? [...lenders].sort().join(',') : ''

  const { data, isLoading, isFetching, error, refetch } = useQuery<UserDataResult>({
    queryKey: ['userData', chainsKey, account, lendersKey],
    enabled,
    queryFn: async () => {
      // If any selected chain needs the RPC path, the whole selection goes
      // through it. Splitting the read would mean merging two server-computed
      // summaries — summing balances and re-deriving weighted APRs by hand —
      // whereas the prepare endpoint happily takes every chain at once and
      // returns one coherent summary.
      if (chainIds.some(shouldUseRpcFetch)) {
        const result = await fetchUserDataViaRpc(chainIds, account!, lenders)
        return {
          raw: result.data.map(transformUserDataEntry),
          summary: result.summary,
        }
      }

      const data = await apiFetch<{
        items: RawLenderUserDataEntry[]
        summary: UserDataSummary
      }>(endpointUserData, {
        params: { chains: chainsKey, account, lenders: lendersKey },
      })
      return {
        raw: data.items.map(transformUserDataEntry),
        summary: data.summary,
      }
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })

  return {
    userData: data ?? { raw: undefined, summary: undefined },
    isUserDataLoading: isLoading,
    isUserDataFetching: isFetching,
    error,
    refetch,
  }
}
