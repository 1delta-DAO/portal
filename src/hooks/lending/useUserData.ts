import { useQuery } from '@tanstack/react-query'
import { fetchUserDataViaRpc } from './fetchUserDataRpc'

// ============================================================================
// Types for the /lending/user-positions API response
// ============================================================================

export interface UserPositionEntry {
  marketUid: string
  underlying: string
  deposits: number | string
  debtStable: number | string
  debt: number | string
  depositsUSD: number
  debtStableUSD: number
  debtUSD: number
  stableBorrowRate: string
  collateralEnabled: boolean
  claimableRewards: number
  withdrawable: number | string
  borrowable: number | string
  isAllowed?: boolean
}

export interface UserBalanceData {
  borrowDiscountedCollateral: number
  borrowDiscountedCollateralAllActive: number
  collateral: number
  collateralAllActive: number
  deposits: number
  debt: number
  adjustedDebt: number
  nav: number
  deposits24h: number
  debt24h: number
  nav24h: number
  rewards: Record<string, unknown>
}

export interface UserAprData {
  apr: number
  borrowApr: number
  depositApr: number
  rewards: Record<string, unknown>
  rewardApr: number
  rewardDepositApr: number
  rewardBorrowApr: number
  stakingApr: number
  stakingDepositApr: number
  stakingBorrowApr: number
}

export interface UserConfigEntry {
  selectedMode: number
  id: string
  isWhitelisted: boolean
}

export interface UserSubAccount {
  health: number | null
  borrowCapacityUSD: number
  accountId: string
  balanceData: UserBalanceData
  aprData: UserAprData
  userConfig: UserConfigEntry
  positions: UserPositionEntry[]
}

export interface LenderUserDataEntry {
  account: string
  chainId: string
  lender: string
  totalDepositsUSD: number
  totalDebtUSD: number
  netWorth: number
  netWorth24h: number
  depositApr: number
  borrowApr: number
  netApr: number
  rewardApr: number
  healthFactor: number | null
  leverage: number
  collateral: number
  data: UserSubAccount[]
}

// ============================================================================
// Summary from the API
// ============================================================================

export interface ChainSummary {
  chainId: string
  totalDepositsUSD: number
  totalDebtUSD: number
  netWorth: number
  lenderCount: number
}

export interface UserDataSummary {
  totalDepositsUSD: number
  totalDebtUSD: number
  totalNetWorth: number
  totalNetWorth24h: number
  avgDepositApr: number
  avgBorrowApr: number
  avgNetApr: number
  totalRewardApr: number
  overallLeverage: number
  activeLenders: number
  activeChains: number
  chains: ChainSummary[]
}

// ============================================================================
// Result type
// ============================================================================

export interface UserDataResult {
  /** Flat array of per-lender entries */
  raw: LenderUserDataEntry[] | undefined
  /** Pre-computed summary from the API */
  summary: UserDataSummary | undefined
}

// ============================================================================
// Endpoint
// ============================================================================

import { BACKEND_BASE_URL } from '../../config/backend'

const endpointUserData = `${BACKEND_BASE_URL}/v1/data/lending/user-positions`
const USE_RPC_FETCH = false

// ============================================================================
// Hook
// ============================================================================

/**
 * useUserData
 * Fetches user lending positions from the /lending/user-positions endpoint.
 */
export function useUserData(params: { chainId: string; account?: string; enabled?: boolean }) {
  const { chainId, account } = params
  const enabled = (params.enabled ?? true) && !!account

  const url = `${endpointUserData}?chains=${chainId}&account=${account}`

  const { data, isLoading, isFetching, error, refetch } = useQuery<UserDataResult>({
    queryKey: ['userData', chainId, account],
    enabled,
    queryFn: async () => {
      if (USE_RPC_FETCH) {
        const result = await fetchUserDataViaRpc(chainId, account!)
        return { raw: result.data, summary: result.summary }
      }

      const r = await fetch(url)
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        throw new Error(`HTTP ${r.status}: ${text || r.statusText}`)
      }
      const json = (await r.json()) as {
        success: boolean
        data: { data: LenderUserDataEntry[]; summary: UserDataSummary }
        error?: { code: string; message: string }
      }
      if (!json.success) {
        throw new Error(json.error?.message ?? 'API returned success: false')
      }
      return { raw: json.data.data, summary: json.data.summary }
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
