import { useEffect, useMemo, useRef, useState } from 'react'
import { parseUnits, zeroAddress } from 'viem'
import type {
  OptimizerAssetRef,
  OptimizerPairRow,
} from '../../../../hooks/lending/useOptimizerPairs'
import type { RawCurrency } from '../../../../types/currency'
import type { TokenBalance } from '../../../../hooks/lending/useTokenBalances'
import { useDebounce } from '../../../../hooks/useDebounce'
import {
  useSendLendingTransaction,
  type LendingTx,
} from '../../../../hooks/useSendLendingTransaction'
import { useAtomicBatch } from '../../../../hooks/useAtomicBatch'
import { isWNative } from '../../../../lib/lib-utils'
import {
  fetchDepositAndBorrow,
  fetchWithdrawAndRepay,
  type CombinedActionResponse,
} from '../../../../sdk/lending-helper/fetchCombinedAction'
import {
  fetchDepositBorrowRange,
  fetchWithdrawRepayRange,
} from '../../../../sdk/lending-helper/fetchLendingRange'
import { useTermSheet } from '../../../../hooks/lending/useTermSheet'
import { isFullSheet } from '../../../lending/terms/types'
import type { BandSetterState } from '../../../lending/terms/BandSetterRow'

// ---------------------------------------------------------------------------
// Small helpers shared with the presentational form.
// ---------------------------------------------------------------------------

/** Parse a decimal string to a base-unit string, tolerating garbage → "0". */
export const toRaw = (amt: string, decimals?: number): string => {
  try {
    return parseUnits((amt || '0') as `${number}`, decimals ?? 18).toString()
  } catch {
    return '0'
  }
}

/** True when a decimal string parses to a positive number. */
export const gt0 = (s: string): boolean => {
  const n = Number(s)
  return Number.isFinite(n) && n > 0
}

// Minimal `RawCurrency` view over an optimizer asset ref so we can reuse the
// shared `isWNative` symbol/flag check for the native-vs-wrapped toggle.
export const asCurrency = (t: OptimizerAssetRef): RawCurrency => ({
  chainId: t.chainId,
  address: t.address,
  decimals: t.decimals ?? 18,
  symbol: t.symbol,
})

type FixedTerm = NonNullable<OptimizerPairRow['termsShort']>[number]

export interface UseCombinedActionParams {
  mode: 'deposit-borrow' | 'withdraw-repay'
  row: OptimizerPairRow
  account?: string
  walletBalances: Map<string, TokenBalance>
  nativeToken: RawCurrency | null
  /** Selected sub-account id (multi-account lenders) — scopes the range, the
   *  build, and the simulation to the caller's EXISTING position. */
  accountId?: string
}

/**
 * All the data + transaction flow behind the optimizer's Deposit-and-Borrow /
 * Withdraw-and-Repay form. Keeping it in a hook lets the form stay purely
 * presentational and gives integrators a single, top-to-bottom read of the
 * flow:
 *
 *   1. user types the `primary` amount (deposit / repay)
 *   2. the range endpoint returns the matching `secondaryMax` (borrow / withdraw)
 *   3. once both amounts are set we build the tx + simulation (`result`)
 *   4. `execute()` sends the permissions then the transactions in order
 *
 * The two legs are mirror images, so a per-mode role mapping (`primary` /
 * `secondary`) drives both modes off one implementation.
 */
export function useCombinedAction({
  mode,
  row,
  account,
  walletBalances,
  nativeToken,
  accountId,
}: UseCombinedActionParams) {
  const chainId = row.chainId
  const collateralUid = row.marketLongUid ?? ''
  const debtUid = row.marketShortUid ?? ''

  // Per-mode role mapping. `primary` is the leg the user drives first; the
  // range endpoint fills `secondary`'s max off it.
  const isOpen = mode === 'deposit-borrow'
  const primaryToken: OptimizerAssetRef = isOpen ? row.collateral : row.debt
  const secondaryToken: OptimizerAssetRef = isOpen ? row.debt : row.collateral
  const primaryLabel = isOpen ? 'Deposit collateral' : 'Repay debt'
  const secondaryLabel = isOpen ? 'Borrow' : 'Withdraw collateral'

  // Native/wrapped handling. The primary leg is *paid in* (deposit or repay),
  // so it maps to `payAsset`. The secondary leg is *delivered* — the borrowed
  // debt (deposit-borrow) or the withdrawn collateral (withdraw-repay) — so a
  // wrapped-native secondary can be unwrapped and delivered native via
  // `receiveAsset` (e.g. borrow WBNB → receive BNB). The server gates which
  // lenders can actually unwrap and returns a clear error otherwise.
  const primaryCanUseNative = !!nativeToken && isWNative(asCurrency(primaryToken))
  const secondaryCanUseNative = !!nativeToken && isWNative(asCurrency(secondaryToken))

  const [primary, setPrimary] = useState('')
  const [secondary, setSecondary] = useState('')
  const [secondaryMax, setSecondaryMax] = useState('0')
  const [modeId, setModeId] = useState<string | undefined>(row.eModeConfigId)
  /**
   * LlamaLend band count for the loan being OPENED.
   *
   * `undefined` until the market's term sheet says the parameter exists, so a
   * lender without one never sends the param. Before this existed the panel
   * opened every LlamaLend loan at the market default with no way to choose —
   * the endpoint has accepted `bands` all along.
   */
  const [bandState, setBandState] = useState<BandSetterState | undefined>(undefined)
  const [payNative, setPayNative] = useState(false)
  const [receiveNative, setReceiveNative] = useState(false)
  const payNativeSettledRef = useRef(false)

  /**
   * The BORROW-side term sheet for the debt market. Needed only for its
   * `openParameter`: the band count is a term, and the optimizer panel had no
   * term sheet at all, which is why the control could not be offered here.
   */
  const { sheet: debtSheet } = useTermSheet({
    marketUid: debtUid,
    chainId: row.chainId,
    enabled: isOpen,
  })
  const openParameter =
    isOpen && debtSheet && isFullSheet(debtSheet)
      ? debtSheet.borrow?.liquidation?.openParameter
      : undefined
  /** Only forward a band count when this market actually takes one. */
  const bandsForRequest =
    openParameter?.kind === 'llamalend-bands' && bandState?.valid ? bandState.bands : undefined

  // Fixed-term broker (Lista) on the BORROW leg — `termsShort` carries one entry
  // per maturity. Selecting a term routes the open through the ATOMIC composer
  // server-side (`buildListaDepositAndBorrow`); omitting it falls back to the
  // multi-step flex borrow. Only relevant when opening (deposit-and-borrow).
  const debtTerms: FixedTerm[] = useMemo(
    () => (isOpen ? (row.termsShort ?? []) : []),
    [isOpen, row.termsShort]
  )
  const isDebtBrokered = debtTerms.length > 0
  const [termId, setTermId] = useState<string | null>(null)
  // Auto-pick the first (shortest) term whenever the term set changes.
  useEffect(() => {
    setTermId(debtTerms.length > 0 ? String(debtTerms[0].termId ?? '') : null)
  }, [debtTerms])

  // Wallet balances for the primary (paid) leg — native vs wrapped follows the
  // toggle so the max / balance row track the currency actually being spent.
  const primaryWrappedBal = walletBalances.get(primaryToken.address.toLowerCase()) ?? null
  const nativeBal = walletBalances.get(zeroAddress) ?? null
  const primaryBal = primaryCanUseNative && payNative ? nativeBal : primaryWrappedBal
  const primaryMax = primaryBal?.balance ?? '0'
  // A ZERO balance still warns: the old `primaryMax > 0` gate meant the one
  // balance where nothing is affordable was the one balance that never
  // complained. Presence of the balance entry — not its size — is what makes
  // the ceiling known. Display-only; it gates no button.
  const primaryOverMax = !!primaryBal && gt0(primary) && Number(primary) > Number(primaryMax) + 1e-9

  const payAsset = primaryCanUseNative && payNative ? zeroAddress : undefined
  const receiveAsset = secondaryCanUseNative && receiveNative ? zeroAddress : undefined

  const [building, setBuilding] = useState(false)
  const [result, setResult] = useState<CombinedActionResponse | null>(null)
  const [buildError, setBuildError] = useState<string | null>(null)

  const dPrimary = useDebounce(primary, 400)
  const dSecondary = useDebounce(secondary, 400)

  const { send, sending } = useSendLendingTransaction({ chainId, account })
  const {
    supported: batchSupported,
    needsUpgrade: batchNeedsUpgrade,
    sendBatch,
  } = useAtomicBatch({ chainId, account })
  const [step, setStep] = useState(0)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)

  // Reset transient state when the market pair or mode changes.
  useEffect(() => {
    setPrimary('')
    setSecondary('')
    setSecondaryMax('0')
    setResult(null)
    setBuildError(null)
    setBuilding(false)
    setDone(false)
    setStep(0)
    setRunError(null)
    setModeId(row.eModeConfigId)
    setPayNative(false)
    setReceiveNative(false)
    payNativeSettledRef.current = false
  }, [mode, collateralUid, debtUid, row.eModeConfigId, accountId])

  // One-time default: when the primary leg is wrapped-native but the user only
  // holds the native token (no wrapped balance), default "Pay with" to native so
  // the balance row and max have something to scale from. Settles on first apply
  // or manual pick so it never fights the user.
  useEffect(() => {
    if (!primaryCanUseNative || payNativeSettledRef.current) return
    const w = Number(primaryWrappedBal?.balance ?? '0')
    const n = Number(nativeBal?.balance ?? '0')
    if (w === 0 && n === 0) return
    if (w === 0 && n > 0) setPayNative(true)
    payNativeSettledRef.current = true
  }, [primaryCanUseNative, primaryWrappedBal, nativeBal])

  const setPayNativeManual = (next: boolean) => {
    payNativeSettledRef.current = true
    setPayNative(next)
  }

  // Range: primary amount → secondary max (+ the consistent collateral mode).
  useEffect(() => {
    if (!account || !collateralUid || !debtUid || !gt0(dPrimary)) {
      setSecondaryMax('0')
      return
    }
    let cancelled = false
    const primaryRaw = toRaw(dPrimary, primaryToken.decimals)
    const run = async () => {
      const res = isOpen
        ? await fetchDepositBorrowRange({
            marketUidOut: collateralUid,
            marketUidIn: debtUid,
            account,
            depositAmount: primaryRaw,
            modeId: row.eModeConfigId,
            accountId,
          })
        : await fetchWithdrawRepayRange({
            marketUidOut: collateralUid,
            marketUidIn: debtUid,
            account,
            repayAmount: primaryRaw,
            modeId: row.eModeConfigId,
            accountId,
          })
      if (cancelled) return
      if (res.success && res.data) {
        const side = isOpen ? (res.data as any).maxBorrow : (res.data as any).maxWithdraw
        setSecondaryMax(side?.amount ?? '0')
        if (res.data.collateralModeId) setModeId(res.data.collateralModeId)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [
    dPrimary,
    account,
    collateralUid,
    debtUid,
    isOpen,
    primaryToken.decimals,
    row.eModeConfigId,
    accountId,
  ])

  // Build the tx + simulation whenever both amounts are set.
  useEffect(() => {
    if (!account || !collateralUid || !debtUid || !gt0(dPrimary) || !gt0(dSecondary)) {
      setResult(null)
      setBuildError(null)
      // Clear any in-flight "Building…" state — e.g. after the amounts are
      // reset on a position switch, or when a field is emptied.
      setBuilding(false)
      return
    }
    let cancelled = false
    setBuilding(true)
    setDone(false)
    setStep(0)
    setRunError(null)
    const primaryRaw = toRaw(dPrimary, primaryToken.decimals)
    const secondaryRaw = toRaw(dSecondary, secondaryToken.decimals)
    const run = async () => {
      const res = isOpen
        ? await fetchDepositAndBorrow({
            collateralMarketUid: collateralUid,
            debtMarketUid: debtUid,
            operator: account,
            collateralAmount: primaryRaw,
            borrowAmount: secondaryRaw,
            payAsset,
            receiveAsset,
            modeId,
            bands: bandsForRequest,
            accountId,
            debtTermId: isDebtBrokered && termId != null ? Number(termId) : undefined,
            simulate: true,
          })
        : await fetchWithdrawAndRepay({
            debtMarketUid: debtUid,
            collateralMarketUid: collateralUid,
            operator: account,
            repayAmount: primaryRaw,
            withdrawAmount: secondaryRaw,
            payAsset,
            receiveAsset,
            accountId,
            simulate: true,
          })
      if (cancelled) return
      setBuilding(false)
      if (res.success && res.data) {
        setResult(res.data)
        setBuildError(null)
      } else {
        setResult(null)
        setBuildError(res.error ?? 'Failed to build transaction')
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [
    dPrimary,
    dSecondary,
    account,
    collateralUid,
    debtUid,
    isOpen,
    modeId,
    bandsForRequest,
    payAsset,
    receiveAsset,
    accountId,
    termId,
    isDebtBrokered,
    primaryToken.decimals,
    secondaryToken.decimals,
  ])

  // Flatten the built response into an ordered list of transactions to send
  // (permissions first, then the action txs) plus a human label per step.
  const steps: LendingTx[] = useMemo(() => {
    if (!result) return []
    return [
      ...result.permissions.map((p) => ({ to: p.to, data: p.data, value: p.value })),
      ...result.transactions.map((t) => ({ to: t.to, data: t.data, value: t.value })),
    ]
  }, [result])

  const stepLabels = useMemo(() => {
    if (!result) return [] as string[]
    return [
      ...result.permissions.map((p, i) => p.description || `Approval ${i + 1}`),
      ...result.transactions.map((_t, i) =>
        result.transactions.length > 1
          ? `Step ${i + 1}`
          : isOpen
            ? 'Open position'
            : 'Close position'
      ),
    ]
  }, [result, isOpen])

  const execute = async () => {
    if (!steps.length) return
    setRunning(true)
    setRunError(null)
    for (let i = step; i < steps.length; i++) {
      setStep(i)
      const r = await send(steps[i])
      if (!r.ok) {
        setRunError(r.error ?? 'Transaction failed')
        setRunning(false)
        return
      }
    }
    setStep(steps.length)
    setDone(true)
    setRunning(false)
  }

  /**
   * Atomic path: the same ordered `steps` in ONE wallet confirmation. Nothing
   * partial can land — either every grant plus the open/close applies, or none
   * of it does — so `step` jumps straight to the end on success.
   */
  const executeBatch = async () => {
    if (!steps.length) return
    setRunning(true)
    setRunError(null)
    const { ok, error } = await sendBatch(steps)
    if (!ok) {
      setRunError(error ?? 'Transaction failed')
      setRunning(false)
      return
    }
    setStep(steps.length)
    setDone(true)
    setRunning(false)
  }

  // Clear the "done" screen and the amounts to start a fresh action.
  const startAnother = () => {
    setDone(false)
    setPrimary('')
    setSecondary('')
    setResult(null)
    setStep(0)
  }

  return {
    // roles
    isOpen,
    primaryToken,
    secondaryToken,
    primaryLabel,
    secondaryLabel,
    debtUid,
    // native toggles
    primaryCanUseNative,
    secondaryCanUseNative,
    payNative,
    setPayNative: setPayNativeManual,
    receiveNative,
    setReceiveNative,
    // amounts
    primary,
    setPrimary,
    secondary,
    setSecondary,
    secondaryMax,
    dSecondary,
    priceP: primaryToken.priceUsd ?? 0,
    priceS: secondaryToken.priceUsd ?? 0,
    // primary wallet balance
    primaryBal,
    primaryMax,
    primaryOverMax,
    // fixed-term borrow
    debtTerms,
    isDebtBrokered,
    termId,
    setTermId,
    // open parameter (LlamaLend band count) — the term sheet's liquidation
    // block drives the control; `undefined` means this market has none.
    bandLiquidation:
      isOpen && debtSheet && isFullSheet(debtSheet) ? debtSheet.borrow?.liquidation : undefined,
    bandValue: bandState?.bands,
    setBandState,
    // build result
    building,
    result,
    buildError,
    // execution
    steps,
    stepLabels,
    step,
    running,
    sending,
    done,
    runError,
    execute,
    executeBatch,
    batchSupported,
    batchNeedsUpgrade,
    startAnother,
  }
}

export type CombinedAction = ReturnType<typeof useCombinedAction>
