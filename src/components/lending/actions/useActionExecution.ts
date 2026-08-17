import { useState, useEffect, useRef } from 'react'
import { parseUnits } from 'viem'
import type { PoolDataItem } from '../../../sdk/lending-helper/marketTypes'
import type { UserSubAccount } from '../../../sdk/lending-helper/userPositionTypes'
import {
  fetchLendingAction,
  type LendingActionResponseWithSimulation,
  type LendingActionSimulation,
  type RateImpactEntry,
} from '../../../sdk/lending-helper/fetchLendingAction'
import type { LoopRangeSimulationBody } from '../../../sdk/lending-helper/fetchLoopRange'
import { useDebounce } from '../../../hooks/useDebounce'
import { usePermissionLadder } from '../../../hooks/usePermissionLadder'
import type { ActionType } from './types'

export function useActionExecution(params: {
  actionType: ActionType
  pool: PoolDataItem | null
  account?: string
  /**
   * Address that should receive the action's output (shares on Deposit,
   * underlying on Withdraw, …). Defaults to `account` when omitted. Used by
   * the earn deposit flow's "custom receiver" affordance so integrators can
   * simulate flows where depositor ≠ receiver.
   */
  receiver?: string
  amount: string
  isAll: boolean
  /** For Deposit / Repay: address of the token to pay with */
  payAsset?: string
  /** For Withdraw / Borrow: address of the token to receive */
  receiveAsset?: string
  /** Sub-account ID for multi-account lenders */
  accountId?: string
  /** Brokered Borrow: chosen fixed-term id from the market's `terms[]` rate card. */
  termId?: number
  /**
   * Liquity-family only: the borrower-chosen rate in WAD. Percent→WAD lives in
   * `fetchLiquityRate.aprPercentToWad`; never pass a percent here.
   */
  interestRate?: string
  /** Brokered Repay: the loan's posId (or `FLEX_LOAN_ID` for the flex position). */
  loanId?: string
  /** Chain ID string for query invalidation */
  chainId?: string
  /** Active sub-account — when provided, enables simulation via `simulate` param */
  subAccount?: UserSubAccount
  /**
   * Fluid smart vaults: the second leg of a two-token LP side, already in RAW
   * units (the panel owns the decimals of a token that is NOT `pool.asset`).
   * Both or neither — `amount1` alone is a server-side error.
   */
  asset1?: string
  amount1?: string
  /**
   * Size the operation in LP shares rather than tokens (`operatePerfect`).
   * When set it REPLACES the token amount as the sizing input, so the amount
   * field becomes a display of the estimated split rather than the request.
   */
  shares?: string
}) {
  const {
    actionType,
    pool,
    account,
    receiver,
    amount,
    isAll,
    payAsset,
    receiveAsset,
    accountId,
    termId,
    interestRate,
    loanId,
    chainId,
    subAccount,
    asset1,
    amount1,
    shares,
  } = params
  const effectiveReceiver = receiver && receiver.length > 0 ? receiver : account

  const [result, setResult] = useState<LendingActionResponseWithSimulation | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [txSuccess, setTxSuccess] = useState<{
    actionType: ActionType
    amount: string
    symbol: string
    hash?: string
  } | null>(null)

  const ladder = usePermissionLadder({
    chainId: chainId ?? '',
    account,
    permissions: result?.permissions ?? [],
    transactions: result?.transactions ?? [],
    onDone: (hash) =>
      setTxSuccess({
        actionType,
        amount,
        symbol: pool?.asset.symbol ?? '',
        hash,
      }),
  })

  const debouncedAmount = useDebounce(amount, 500)
  const fetchIdRef = useRef(0)
  const shouldSimulate = !!subAccount

  const simulationBody: LoopRangeSimulationBody | undefined = subAccount
    ? {
        balanceData: {
          borrowDiscountedCollateral: subAccount.balanceData.borrowDiscountedCollateral ?? 0,
          collateral: subAccount.balanceData.collateral,
          debt: subAccount.balanceData.debt,
          adjustedDebt: subAccount.balanceData.adjustedDebt ?? 0,
          deposits: subAccount.balanceData.deposits,
          nav: subAccount.balanceData.nav,
          deposits24h: subAccount.balanceData.deposits24h,
          debt24h: subAccount.balanceData.debt24h,
          nav24h: subAccount.balanceData.nav24h,
        },
        aprData: subAccount.aprData,
        modeId: String(subAccount.userConfig.selectedMode),
        positions: subAccount.positions.map((p) => ({
          marketUid: p.marketUid,
          deposits: String(p.deposits),
          depositsUSD: p.depositsUSD,
          debt: String(p.debt),
          debtUSD: p.debtUSD,
          debtStableUSD: p.debtStableUSD,
          collateralEnabled: p.collateralEnabled,
        })),
      }
    : undefined

  const simulation: LendingActionSimulation | undefined = result?.simulation
  const rateImpact: RateImpactEntry[] | undefined = result?.rateImpact

  const resetState = () => {
    setResult(null)
    setFetchError(null)
    setTxSuccess(null)
    ladder.resetLadder()
    fetchIdRef.current++
  }

  const dismissSuccess = () => {
    setTxSuccess(null)
    setResult(null)
    ladder.resetLadder()
  }

  // Auto-fetch when debounced inputs change
  useEffect(() => {
    if (!account || !pool) {
      setResult(null)
      setFetchError(null)
      return
    }

    const parsedAmt = parseFloat(debouncedAmount || '0')
    // A share-sized request is a real request with a zero token amount — the
    // pool decides the split — so it must not be filtered out as "no input".
    const sharesSized = !!shares && shares !== '0'
    if (parsedAmt <= 0 && !isAll && !sharesSized) {
      setResult(null)
      setFetchError(null)
      setLoading(false)
      return
    }

    const fetchId = ++fetchIdRef.current
    const decimals = pool.asset.decimals ?? 18

    const doFetch = async () => {
      setLoading(true)
      setFetchError(null)
      // A new bundle invalidates the approval progress: the amount an approval
      // was granted for is no longer the amount being sent.
      ladder.resetLadder()

      const parsedAmount = parseUnits(debouncedAmount || '0', decimals)

      const response = await fetchLendingAction({
        marketUid: pool.marketUid,
        operator: account,
        amount: parsedAmount.toString(),
        actionType,
        receiver: effectiveReceiver,
        isAll: isAll || undefined,
        payAsset,
        receiveAsset,
        accountId,
        termId,
        loanId,
        interestRate,
        // Already raw: the second leg is a DIFFERENT token from `pool.asset`,
        // so its decimals are the panel's to know, not this hook's.
        asset1,
        amount1,
        shares,
        // `minShares`/`maxShares` are deliberately never sent — the API quotes
        // the bound off the DexResolver, and a client-side estimate over a
        // concentrated pool understates impact exactly where it matters.
        simulate: shouldSimulate,
        simulationBody,
      })

      if (fetchIdRef.current !== fetchId) return

      setLoading(false)
      if (!response.success) {
        setFetchError(response.error ?? 'Failed to fetch transaction data')
        return
      }
      setResult(response.data ?? null)
    }

    doFetch()
    // `ladder`/`simulationBody` are rebuilt per render; the fields below are
    // their stable identities. `ladder.resetLadder` only touches stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedAmount,
    pool?.marketUid,
    account,
    effectiveReceiver,
    isAll,
    payAsset,
    receiveAsset,
    accountId,
    termId,
    interestRate,
    loanId,
    actionType,
    shouldSimulate,
    asset1,
    amount1,
    shares,
  ])

  // The ladder owns the execution sequence; these wrappers only add the
  // "nothing to execute yet" guard.
  const executeMain = async () => {
    if (!result || !pool) return
    await ladder.executeMain()
  }

  const executeAll = async () => {
    if (!result || !pool) return
    await ladder.executeAll()
  }

  return {
    result,
    simulation,
    rateImpact,
    loading,
    executing: ladder.executing,
    executingPermission: ladder.executingPermission,
    executingMain: ladder.executingMain,
    permissions: ladder.permissions,
    hasPermissions: ladder.hasPermissions,
    permissionsCompleted: ladder.permissionsCompleted,
    allPermissionsDone: ladder.allPermissionsDone,
    batchSupported: ladder.batchSupported,
    batchNeedsUpgrade: ladder.batchNeedsUpgrade,
    error: fetchError ?? ladder.error,
    txSuccess,
    executeNextPermission: ladder.executeNextPermission,
    executeMain,
    executeAll,
    resetState,
    dismissSuccess,
  }
}

export type ActionExecution = ReturnType<typeof useActionExecution>
