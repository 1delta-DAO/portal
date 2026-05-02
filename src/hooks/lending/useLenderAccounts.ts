import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchNextAccount,
  type NextAccountData,
} from '../../sdk/lending-helper/fetchNextAccount'
import { lenderSupportsSubAccounts } from '../../components/lending/actions/helpers'
import type {
  UserSubAccount,
  UserBalanceData,
  UserAprData,
  UserConfigEntry,
} from './useUserData'

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

const ZERO_USER_CONFIG: UserConfigEntry = {
  selectedMode: 0,
  id: '',
  isWhitelisted: false,
}

function makePlaceholder(accountId: string): UserSubAccount {
  return {
    accountId,
    health: null,
    borrowCapacityUSD: 0,
    balanceData: { ...ZERO_BALANCE_DATA },
    aprData: { ...ZERO_APR_DATA },
    userConfig: { ...ZERO_USER_CONFIG },
    positions: [],
  }
}

/**
 * Wraps `fetchNextAccount` in React Query so multiple consumers (dashboard +
 * selector) share one cache entry per (chainId, lender, account).
 */
export function useNextAccount(params: {
  chainId?: string
  lender?: string
  account?: string
  enabled?: boolean
}) {
  const { chainId, lender, account } = params
  const enabled =
    (params.enabled ?? true) &&
    !!chainId &&
    !!lender &&
    !!account &&
    lenderSupportsSubAccounts(lender)

  return useQuery<NextAccountData | null>({
    queryKey: ['nextAccount', chainId, lender, account],
    enabled,
    queryFn: async () => {
      const res = await fetchNextAccount({
        chainId: chainId!,
        lender: lender!,
        account: account!,
      })
      return res.success && res.data ? res.data : null
    },
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })
}

/**
 * Returns the set of sub-accounts to display for a given lender, merged from:
 *   - `user-positions` (authoritative for balances/APRs/positions)
 *   - `next-account.activeAccountIds` (authoritative for account existence)
 *
 * Any `activeAccountId` not present in `userSubAccounts` is rendered as a
 * zero-valued placeholder (health: null) so the UI can show "account exists
 * but is empty" without requiring the backend to emit empty position entries.
 */
export function useLenderAccounts(params: {
  chainId?: string
  lender?: string
  account?: string
  userSubAccounts: UserSubAccount[]
}) {
  const { chainId, lender, account, userSubAccounts } = params

  const nextAccountQuery = useNextAccount({ chainId, lender, account })
  const nextAccount = nextAccountQuery.data ?? null

  const subAccounts = useMemo<UserSubAccount[]>(() => {
    if (!nextAccount || nextAccount.activeAccountIds.length === 0) {
      return userSubAccounts
    }
    const existing = new Set(userSubAccounts.map((s) => s.accountId))
    const placeholders = nextAccount.activeAccountIds
      .filter((id) => !existing.has(id))
      .map(makePlaceholder)
    if (placeholders.length === 0) return userSubAccounts
    return [...userSubAccounts, ...placeholders]
  }, [nextAccount, userSubAccounts])

  return {
    subAccounts,
    nextAccount,
    isNextAccountLoading: nextAccountQuery.isLoading,
  }
}
