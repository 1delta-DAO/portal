import { useQuery } from '@tanstack/react-query'
import { fetchUserDataViaRpc } from './fetchUserDataRpc'

// ============================================================================
// Types for the /lending/user-positions API response
// ============================================================================

export interface UserPositionEntry {
  marketUid: string
  underlying?: string
  deposits: number | string
  debtStable: number | string
  debt: number | string
  depositsUSD: number
  debtStableUSD: number
  debtUSD: number
  depositsUSDOracle?: number
  debtStableUSDOracle?: number
  debtUSDOracle?: number
  stableBorrowRate?: string
  collateralEnabled: boolean
  claimableRewards: number
  withdrawable: number | string
  borrowable: number | string
  isAllowed?: boolean
  underlyingInfo?: {
    asset: {
      chainId: string
      address: string
      symbol: string
      name: string
      decimals: number
      logoURI: string
      assetGroup: string
      currencyId: string
      props?: Record<string, unknown> | null
    }
    oraclePrice: { oraclePrice: number | null; oraclePriceUsd: number | null } | null
    prices: Record<string, unknown> | null
  }
}

export interface UserBalanceData {
  borrowDiscountedCollateral?: number
  borrowDiscountedCollateralAllActive?: number
  collateral: number
  collateralAllActive: number
  deposits: number
  debt: number
  adjustedDebt?: number
  nav: number
  deposits24h: number
  debt24h: number
  nav24h: number
  rewards?: Record<string, unknown>
}

export interface UserAprData {
  apr: number
  borrowApr: number
  depositApr: number
  rewards: Record<string, unknown>
  rewardApr: number
  rewardDepositApr: number
  rewardBorrowApr: number
  intrinsicApr: number
  intrinsicDepositApr: number
  intrinsicBorrowApr: number
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

export interface UserLenderInfo {
  lenderKey: string
  name: string
  logoUri?: string
}

export interface LenderUserDataEntry {
  account: string
  chainId: string
  lender: string
  balanceData: UserBalanceData
  aprData: UserAprData
  healthFactor: number | null
  leverage: number
  lenderInfo?: UserLenderInfo
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
  balanceData: UserBalanceData
  aprData: UserAprData
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
// Raw API response type (no top-level balanceData/aprData/healthFactor)
// ============================================================================

export interface RawLenderUserDataEntry {
  account: string
  chainId: string
  lender: string
  balanceData?: UserBalanceData
  aprData?: UserAprData
  healthFactor?: number | null
  leverage?: number
  lenderInfo?: UserLenderInfo
  data: UserSubAccount[]
}

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
  const balanceData =
    raw.balanceData ?? (subs.length > 0 ? subs[0].balanceData : ZERO_BALANCE_DATA)
  const aprData = raw.aprData ?? (subs.length > 0 ? subs[0].aprData : ZERO_APR_DATA)
  const healthFactor = raw.healthFactor !== undefined ? raw.healthFactor : (subs[0]?.health ?? null)
  const leverage =
    raw.leverage ??
    (balanceData.deposits > 0 && balanceData.nav > 0
      ? balanceData.deposits / balanceData.nav
      : 0)

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

import { BACKEND_BASE_URL } from '../../config/backend'

const endpointUserData = `${BACKEND_BASE_URL}/v1/data/lending/user-positions`
const USE_RPC_FETCH = true

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
        return {
          raw: result.data.map(transformUserDataEntry),
          summary: result.summary,
        }
      }

      const r = await fetch(url)
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        throw new Error(`HTTP ${r.status}: ${text || r.statusText}`)
      }
      const json = (await r.json()) as {
        success: boolean
        data: { items: RawLenderUserDataEntry[]; summary: UserDataSummary }
        error?: { code: string; message: string }
      }
      if (!json.success) {
        throw new Error(json.error?.message ?? 'API returned success: false')
      }
      return {
        raw: json.data.items.map(transformUserDataEntry),
        summary: json.data.summary,
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
