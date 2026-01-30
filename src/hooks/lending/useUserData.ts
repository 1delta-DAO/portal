import { useQuery } from '@tanstack/react-query'

// ============================================================================
// Types for the /lending/user-data API response
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

interface UserDataApiResponse {
  ok: boolean
  data: {
    [chainId: string]: {
      [lender: string]: LenderUserDataEntry
    }
  }
}

// ============================================================================
// Derived summary types (for UI consumption)
// ============================================================================

export interface UserPositionInfo {
  subAccount: string
  poolId: string
  underlying: string
  size: number
  sizeUSD: number
}

export interface UserLenderSummary {
  lender: string
  chain: string
  netWorth: number
  netWorth24h: number
  apr: number
  assetsLong: UserPositionInfo[]
  assetsShort: UserPositionInfo[]
  healthFactors: number[]
  leverages: number[]
}

export interface UserDataResult {
  /** Raw per-chain, per-lender, sub-account data */
  raw: UserDataApiResponse['data'] | undefined
  /** Per-lender summaries for table display */
  lenderSummaries: UserLenderSummary[]
  /** Total portfolio net worth (USD) */
  total: number
  /** Total portfolio net worth 24h ago (USD) */
  total24h: number
  /** Weighted portfolio APR */
  apr: number
}

// ============================================================================
// Endpoint
// ============================================================================

const BACKEND_BASE_URL = 'https://beta.data.1delta.io'
const endpointUserData = `${BACKEND_BASE_URL}/lending/user-data`

// ============================================================================
// Helpers
// ============================================================================

/** Extract actual position objects from the positions array (INIT has a leading number) */
function extractPositions(positions: (UserPositionEntry | number)[]): UserPositionEntry[] {
  return positions.filter((p): p is UserPositionEntry => typeof p === 'object' && p !== null)
}

function calculateNetApr(apr: UserAprData, deposits: number, debt: number): number {
  const nav = deposits - debt
  if (nav <= 0) return 0

  const depositApr = apr.depositApr + apr.stakingDepositApr + apr.rewardDepositApr
  const debtApr = apr.borrowApr + apr.stakingBorrowApr - apr.rewardBorrowApr

  return (depositApr * deposits - debtApr * debt) / nav
}

function buildSummaries(data: UserDataApiResponse['data']): {
  lenderSummaries: UserLenderSummary[]
  total: number
  total24h: number
  apr: number
} {
  let total = 0
  let total24h = 0
  let weightedApr = 0
  const lenderSummaries: UserLenderSummary[] = []

  for (const [chainId, lenders] of Object.entries(data)) {
    for (const [lender, lenderEntry] of Object.entries(lenders)) {
      let lenderNav = 0
      let lenderNav24h = 0
      let lenderWeightedApr = 0
      const healthFactors: number[] = []
      const leverages: number[] = []
      const assetsLong: UserPositionInfo[] = []
      const assetsShort: UserPositionInfo[] = []

      for (const sub of lenderEntry.data) {
        const bd = sub.balanceData
        const nav = bd.nav
        const nav24h = bd.nav24h

        if (nav > 0) {
          lenderNav += nav
          total += nav
        }
        if (nav24h > 0) {
          lenderNav24h += nav24h
          total24h += nav24h
        }

        if (nav > 0) {
          const netApr = calculateNetApr(sub.aprData, bd.deposits, bd.debt)
          const aprTimesNav = nav * netApr
          weightedApr += aprTimesNav
          lenderWeightedApr += aprTimesNav
        }

        // leverage & health
        if (nav !== 0) leverages.push(bd.deposits / nav)
        const adjDebt = bd.adjustedDebt ?? 0
        if (adjDebt !== 0) {
          healthFactors.push(bd.collateral / adjDebt)
        }

        // positions
        const positions = extractPositions(sub.positions)
        for (const pos of positions) {
          const depSize = Number(pos.deposits) || 0
          if (depSize > 0) {
            assetsLong.push({
              subAccount: sub.accountId,
              poolId: pos.poolId,
              underlying: pos.underlying,
              size: depSize,
              sizeUSD: pos.depositsUSD,
            })
          }
          const debtSize = Number(pos.debt) || 0
          if (debtSize > 0) {
            assetsShort.push({
              subAccount: sub.accountId,
              poolId: pos.poolId,
              underlying: pos.underlying,
              size: debtSize,
              sizeUSD: pos.debtUSD,
            })
          }
        }
      }

      if (lenderNav !== 0 || assetsLong.length > 0 || assetsShort.length > 0) {
        lenderSummaries.push({
          lender,
          chain: chainId,
          netWorth: lenderNav,
          netWorth24h: lenderNav < 0 ? lenderNav : lenderNav24h,
          apr: lenderNav > 0 ? lenderWeightedApr / lenderNav : 0,
          assetsLong,
          assetsShort,
          healthFactors,
          leverages,
        })
      }
    }
  }

  return {
    lenderSummaries: lenderSummaries.sort((a, b) => b.netWorth - a.netWorth),
    total,
    total24h,
    apr: total > 0 ? weightedApr / total : 0,
  }
}

// ============================================================================
// Hook
// ============================================================================

/**
 * useUserData
 * Fetches user lending positions from the /lending/user-data endpoint.
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
      const r = await fetch(url)
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        throw new Error(`HTTP ${r.status}: ${text || r.statusText}`)
      }
      const json = (await r.json()) as UserDataApiResponse
      if (!json.ok) {
        throw new Error('API returned ok: false')
      }

      const { lenderSummaries, total, total24h, apr } = buildSummaries(json.data)

      return {
        raw: json.data,
        lenderSummaries,
        total,
        total24h,
        apr,
      }
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })

  return {
    userData: data ?? { raw: undefined, lenderSummaries: [], total: 0, total24h: 0, apr: 0 },
    isUserDataLoading: isLoading,
    isUserDataFetching: isFetching,
    error,
    refetch,
  }
}
