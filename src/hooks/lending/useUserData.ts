import { useQuery } from '@tanstack/react-query'
import { fetchUserDataViaRpc } from './fetchUserDataRpc'

// ============================================================================
// Types for the /lending/user-positions API response
// ============================================================================

export interface UserPositionEntry {
  poolId: string
  underlying: string
  deposits: number | string
  depositsRaw: string
  debtStable: number | string
  debt: number | string
  depositsUSD: number
  debtStableUSD: number
  debtUSD: number
  stableBorrowRate: string
  collateralEnabled: boolean
  claimableRewards: number
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
  accountId: string
  balanceData: UserBalanceData
  aprData: UserAprData
  userConfig: UserConfigEntry
  positions: (UserPositionEntry | number)[]
}

export interface LenderUserDataEntry {
  account: string
  chainId: string
  data: UserSubAccount[]
}

// ============================================================================
// Summary from the API
// ============================================================================

export interface UserDataSummary {
  totalDepositsUSD: number
  totalDebtUSD: number
  totalNetWorth: number
  avgDepositApr: number
  avgBorrowApr: number
  avgNetApr: number
  totalRewardApr: number
  overallLeverage: number
  activeLenders: number
  activeChains: number
}

// ============================================================================
// Result type
// ============================================================================

export interface UserDataResult {
  /** Raw per-chain, per-lender, sub-account data */
  raw: {
    [chainId: string]: {
      [lender: string]: LenderUserDataEntry
    }
  } | undefined
  /** Pre-computed summary from the API */
  summary: UserDataSummary | undefined
}

// ============================================================================
// Endpoint
// ============================================================================

const BACKEND_BASE_URL = 'https://portal.1delta.io/v1'
const endpointUserData = `${BACKEND_BASE_URL}/lending/user-positions`
const USE_RPC_FETCH = true

// ============================================================================
// Hook
// ============================================================================

/**
 * useUserData
 * Fetches user lending positions from the /lending/user-positions endpoint.
 */
export function useUserData(params: {
  chainId: string
  account?: string
  enabled?: boolean
}) {
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
      const json = await r.json() as { ok: boolean; data: UserDataResult['raw']; summary: UserDataSummary }
      if (!json.ok) {
        throw new Error('API returned ok: false')
      }
      return { raw: json.data, summary: json.summary }
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
