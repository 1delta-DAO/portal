import { useEffect, useMemo, useRef, useState } from 'react'
import { parseUnits, zeroAddress } from 'viem'
import type { OptimizerPairRow } from '../../../../hooks/lending/useOptimizerPairs'
import type { OptimizerAssetRef } from '../../../../hooks/lending/useOptimizerPairs'
import { useDebounce } from '../../../../hooks/useDebounce'
import {
  useSendLendingTransaction,
  type LendingTx,
} from '../../../../hooks/useSendLendingTransaction'
import { AmountInput } from '../../../common/AmountInput'
import { HealthFactorProjection } from '../../actions/HealthFactorProjection'
import { NativeCurrencySelector } from '../../actions/NativeCurrencySelector'
import { SubAccountSelector } from '../../actions/SubAccountSelector'
import { lenderSupportsSubAccounts } from '../../actions/helpers'
import { isWNative } from '../../../../lib/lib-utils'
import type { RawCurrency } from '../../../../types/currency'
import { useTokenLists } from '../../../../hooks/useTokenLists'
import { useTokenBalances, type TokenBalance } from '../../../../hooks/lending/useTokenBalances'
import {
  useUserData,
  type UserSubAccount,
  type UserPositionEntry,
} from '../../../../hooks/lending/useUserData'
import { UsdAmount } from '../../../common/UsdAmount'
import { Logo } from '../../../common/Logo'
import { OptimizerLoopPanel } from './OptimizerLoopPanel'
import { DepthChart } from './DepthChart'
import {
  fetchDepositAndBorrow,
  fetchWithdrawAndRepay,
  type CombinedActionResponse,
} from '../../../../sdk/lending-helper/fetchCombinedAction'
import {
  fetchDepositBorrowRange,
  fetchWithdrawRepayRange,
} from '../../../../sdk/lending-helper/fetchLendingRange'

type Op = 'deposit-borrow' | 'withdraw-repay' | 'loop'

interface Props {
  row: OptimizerPairRow
  account?: string
  onClose: () => void
  /** Human-readable lender name (e.g. "Euler V2"). Falls back to the raw key. */
  lenderName?: string
  /** Lender logo URL, shown next to the name in the header. */
  lenderLogo?: string
}

const toRaw = (amt: string, decimals?: number): string => {
  try {
    return parseUnits((amt || '0') as `${number}`, decimals ?? 18).toString()
  } catch {
    return '0'
  }
}
const gt0 = (s: string): boolean => {
  const n = Number(s)
  return Number.isFinite(n) && n > 0
}
const fmtBal = (s?: string): string =>
  Number(s ?? '0').toLocaleString(undefined, { maximumFractionDigits: 6 })

/**
 * Format a chart-picked token size into a clean input string: up to 6 decimals
 * with trailing zeros trimmed (e.g. 78000 → "78000", 0.1234560 → "0.123456").
 */
const pickToAmount = (size: number): string =>
  Number.isFinite(size) && size > 0 ? String(Number(size.toFixed(6))) : ''

// Minimal `RawCurrency` view over an optimizer asset ref so we can reuse the
// shared `isWNative` symbol/flag check for the native-vs-wrapped toggle.
const asCurrency = (t: OptimizerAssetRef): RawCurrency => ({
  chainId: t.chainId,
  address: t.address,
  decimals: t.decimals ?? 18,
  symbol: t.symbol,
})

/**
 * The aggregate (non-brokered) position row for a market inside a sub-account.
 * Per-loan brokered rows share `marketUid`, so we skip them (`!p.term`) and
 * take the aggregate row — matching how the lender-page panels read positions.
 */
const findAggPosition = (
  sub: UserSubAccount | undefined,
  marketUid?: string
): UserPositionEntry | undefined => {
  if (!sub || !marketUid) return undefined
  return sub.positions.find(
    (p) => typeof p === 'object' && p !== null && !p.term && p.marketUid === marketUid
  )
}

const routeLabel: Record<string, string> = {
  native: 'Atomic (native)',
  composer: 'Atomic (composer)',
  sequential: 'Multi-step',
  auction: 'Auction bid',
}

// ---------------------------------------------------------------------------
// Shared mirror form for deposit-and-borrow / withdraw-and-repay
// ---------------------------------------------------------------------------

interface CombinedFormProps {
  mode: 'deposit-borrow' | 'withdraw-repay'
  row: OptimizerPairRow
  account?: string
  walletBalances: Map<string, TokenBalance>
  nativeToken: RawCurrency | null
  isBalancesFetching?: boolean
  refetchBalances?: () => void
  /** Selected sub-account id (multi-account lenders) — scopes the range,
   *  the build, and the simulation to the caller's EXISTING position. */
  accountId?: string
}

function CombinedForm({
  mode,
  row,
  account,
  walletBalances,
  nativeToken,
  isBalancesFetching,
  refetchBalances,
  accountId,
}: CombinedFormProps) {
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
  const [payNative, setPayNative] = useState(false)
  const [receiveNative, setReceiveNative] = useState(false)
  const payNativeSettledRef = useRef(false)

  // Fixed-term broker (Lista) on the BORROW leg — `termsShort` carries one entry
  // per maturity. Selecting a term routes the open through the ATOMIC composer
  // server-side (`buildListaDepositAndBorrow`); omitting it falls back to the
  // multi-step flex borrow. Only relevant when opening (deposit-and-borrow).
  const debtTerms = useMemo(() => (isOpen ? (row.termsShort ?? []) : []), [isOpen, row.termsShort])
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
  const primaryOverMax =
    Number(primaryMax) > 0 && gt0(primary) && Number(primary) > Number(primaryMax) + 1e-9

  const payAsset = primaryCanUseNative && payNative ? zeroAddress : undefined
  const receiveAsset = secondaryCanUseNative && receiveNative ? zeroAddress : undefined

  const [building, setBuilding] = useState(false)
  const [result, setResult] = useState<CombinedActionResponse | null>(null)
  const [buildError, setBuildError] = useState<string | null>(null)

  const dPrimary = useDebounce(primary, 400)
  const dSecondary = useDebounce(secondary, 400)

  const { send, sending } = useSendLendingTransaction({ chainId, account })
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

  const handlePayNative = (next: boolean) => {
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
    payAsset,
    receiveAsset,
    accountId,
    termId,
    isDebtBrokered,
    primaryToken.decimals,
    secondaryToken.decimals,
  ])

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

  const priceP = primaryToken.priceUsd ?? 0
  const priceS = secondaryToken.priceUsd ?? 0

  if (done) {
    return (
      <div className="rounded-lg p-3 bg-success/10 ring-1 ring-success/40 text-sm space-y-2">
        <div className="font-semibold text-success">
          {isOpen ? 'Position opened' : 'Position updated'} ✓
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => {
            setDone(false)
            setPrimary('')
            setSecondary('')
            setResult(null)
            setStep(0)
          }}
        >
          Start another
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Primary leg */}
      <div className="form-control">
        {primaryCanUseNative && nativeToken && (
          <div className="mb-1.5">
            <NativeCurrencySelector
              wrappedSymbol={primaryToken.symbol ?? 'Wrapped'}
              nativeToken={nativeToken}
              useNative={payNative}
              onChange={handlePayNative}
              label="Pay with"
            />
          </div>
        )}
        <span className="label-text text-xs mb-1 block">
          {primaryLabel} ·{' '}
          {(payNative && nativeToken ? nativeToken.symbol : primaryToken.symbol) ?? '—'}
        </span>
        {/* Wallet balance for the leg being spent — tap to fill the full amount. */}
        <div className="text-[10px] flex items-center justify-between px-0.5 mb-1 text-base-content/60">
          <span className="flex items-center gap-1">
            Wallet
            {refetchBalances && (
              <button
                type="button"
                className="text-base-content/30 hover:text-base-content/60 transition-colors"
                onClick={refetchBalances}
                title="Refresh balance"
              >
                {isBalancesFetching ? (
                  <span className="loading loading-spinner w-2 h-2" />
                ) : (
                  <svg
                    className="w-2.5 h-2.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 2v6h-6" />
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                    <path d="M3 22v-6h6" />
                    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                  </svg>
                )}
              </button>
            )}
          </span>
          {primaryBal ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 font-medium hover:text-base-content transition-colors"
              onClick={() => setPrimary(primaryBal.balance)}
              title="Use full balance"
            >
              <span>{fmtBal(primaryBal.balance)}</span>
              {primaryBal.balanceUSD > 0 && <UsdAmount value={primaryBal.balanceUSD} />}
            </button>
          ) : isBalancesFetching ? (
            <span className="text-base-content/40">Loading…</span>
          ) : (
            <span className="text-base-content/40">—</span>
          )}
        </div>
        <AmountInput
          value={primary}
          onChange={setPrimary}
          maxAmount={primaryMax}
          onMaxClick={() => setPrimary(primaryMax)}
          decimals={primaryToken.decimals}
          placeholder="0.0"
          error={primaryOverMax ? `Exceeds wallet balance (${fmtBal(primaryMax)})` : null}
          usdValue={priceP > 0 ? Number(primary) * priceP : undefined}
        />
      </div>

      {/* Fixed-term borrow picker (Lista broker) — shown for the borrow leg like
          the regular Borrow / Loop tabs. Selecting a term enables the atomic
          composer open; leaving it drives the multi-step flex borrow. */}
      {isDebtBrokered && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center rounded-md bg-warning/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide leading-none text-warning">
              Fixed-term
            </span>
            <span className="text-[10px] text-base-content/60 leading-tight">
              Borrow term · {secondaryToken.symbol}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {debtTerms.map((t) => {
              const tid = String(t.termId ?? '')
              const active = tid === termId
              return (
                <button
                  key={tid}
                  type="button"
                  onClick={() => setTermId(tid)}
                  className={`flex flex-col items-start px-2.5 py-1 rounded-lg border text-left transition-colors cursor-pointer ${
                    active
                      ? 'border-primary bg-primary/10 ring-1 ring-primary'
                      : 'border-base-300 bg-base-200/50 hover:bg-base-200'
                  }`}
                >
                  <span className="text-xs font-semibold">
                    {Math.max(1, Math.round(Number(t.durationDays ?? 0)))}-day
                  </span>
                  <span className="text-[10px] font-mono tabular-nums text-warning">
                    {Number(t.apr ?? 0).toFixed(2)}%
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Secondary leg (max from the range endpoint) */}
      <div className="form-control">
        {secondaryCanUseNative && nativeToken && (
          <div className="mb-1.5">
            <NativeCurrencySelector
              wrappedSymbol={secondaryToken.symbol ?? 'Wrapped'}
              nativeToken={nativeToken}
              useNative={receiveNative}
              onChange={setReceiveNative}
              label="Receive as"
            />
          </div>
        )}
        <span className="label-text text-xs mb-1 flex items-center justify-between">
          <span>
            {secondaryLabel} ·{' '}
            {(receiveNative && nativeToken ? nativeToken.symbol : secondaryToken.symbol) ?? '—'}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-base-content/50">
            max {fmtBal(secondaryMax)}
          </span>
        </span>
        <AmountInput
          value={secondary}
          onChange={setSecondary}
          maxAmount={secondaryMax}
          onMaxClick={() => setSecondary(secondaryMax)}
          decimals={secondaryToken.decimals}
          placeholder="0.0"
          error={
            gt0(secondary) && Number(secondary) > Number(secondaryMax) + 1e-9
              ? `Exceeds max (${Number(secondaryMax).toLocaleString(undefined, { maximumFractionDigits: 6 })})`
              : null
          }
          usdValue={priceS > 0 ? Number(secondary) * priceS : undefined}
        />
      </div>

      {/* Borrow-rate depth: how the debt market's rate climbs with the borrow
          size, with a live marker at the entered amount. Borrow leg only. */}
      {isOpen && debtUid && (
        <DepthChart
          marketUid={debtUid}
          side="borrow"
          markerAmount={Number(dSecondary) || 0}
          symbol={secondaryToken.symbol}
          price={priceS}
          onPick={(size) => setSecondary(pickToAmount(size))}
        />
      )}

      {/* Route + health projection */}
      {result?.route && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-base-content/60">Route</span>
          <span className="badge badge-ghost badge-sm">
            {routeLabel[result.route] ?? result.route}
          </span>
        </div>
      )}
      <HealthFactorProjection simulation={result?.simulation} />

      {building && (
        <div className="text-xs text-base-content/50 flex items-center gap-2">
          <span className="loading loading-spinner loading-xs" /> Building…
        </div>
      )}
      {buildError && <div className="text-xs text-error break-words">{buildError}</div>}
      {runError && <div className="text-xs text-error break-words">{runError}</div>}

      {/* Execute */}
      <button
        type="button"
        className="btn btn-success btn-sm w-full"
        disabled={!account || !steps.length || building || running || sending}
        onClick={execute}
      >
        {running || sending ? (
          <>
            <span className="loading loading-spinner loading-xs" />
            {stepLabels[Math.min(step, stepLabels.length - 1)] ?? 'Working…'} (
            {Math.min(step + 1, steps.length)}/{steps.length})
          </>
        ) : !account ? (
          'Connect wallet'
        ) : steps.length > 1 ? (
          `Execute (${steps.length} steps)`
        ) : isOpen ? (
          'Deposit & Borrow'
        ) : (
          'Withdraw & Repay'
        )}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panel: operation tabs over a selected pair
// ---------------------------------------------------------------------------

export function PairActionPanel({ row, account, onClose, lenderName, lenderLogo }: Props) {
  const displayLender = lenderName ?? row.lenderKey
  const [op, setOp] = useState<Op>('deposit-borrow')

  // Wallet balances for both legs (so either operation can show how much the
  // user can supply/repay), plus the native token when either leg is
  // wrapped-native. Fetched once here and shared with the operation forms.
  const { data: chainTokens } = useTokenLists(row.chainId)
  const collateralWNative = isWNative(asCurrency(row.collateral))
  const debtWNative = isWNative(asCurrency(row.debt))
  const nativeToken = collateralWNative || debtWNative ? (chainTokens[zeroAddress] ?? null) : null

  const balanceAssets = useMemo(() => {
    const a = [row.collateral.address, row.debt.address]
    if (collateralWNative || debtWNative) a.push(zeroAddress)
    return a
  }, [row.collateral.address, row.debt.address, collateralWNative, debtWNative])

  const {
    balances: walletBalances,
    isBalancesFetching,
    refetchBalances,
  } = useTokenBalances({
    chainId: row.chainId,
    account,
    assets: balanceAssets,
  })

  // Sub-accounts + the caller's EXISTING position on this lender. Scoped to the
  // single lender (a cache hit if the Lending tab already loaded it). Threading
  // the selected accountId into the range / build / simulate calls makes them
  // extend the RIGHT position ("deposit more / borrow more") rather than a fresh
  // one, and the simulation chains onto the existing collateral/debt.
  const hasSubAccounts = lenderSupportsSubAccounts(row.lenderKey)
  const { userData } = useUserData({
    chainId: row.chainId,
    account,
    enabled: !!account,
    lenders: [row.lenderKey],
  })
  const subAccounts = useMemo<UserSubAccount[]>(() => {
    const entry = userData?.raw?.find(
      (e) => e.chainId === row.chainId && e.lender === row.lenderKey
    )
    return entry?.data ?? []
  }, [userData, row.chainId, row.lenderKey])

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  // Reset the pick when the pair (lender / chain) changes.
  useEffect(() => {
    setSelectedAccountId(null)
  }, [row.chainId, row.lenderKey])
  // Auto-pick the sub-account with the largest net value once data lands, so the
  // flow defaults to the account the user actually holds this position in.
  useEffect(() => {
    if (!hasSubAccounts || selectedAccountId || subAccounts.length === 0) return
    const best = subAccounts.reduce((acc, s) =>
      (s.balanceData?.nav ?? 0) > (acc.balanceData?.nav ?? 0) ? s : acc
    )
    setSelectedAccountId(best.accountId)
  }, [hasSubAccounts, selectedAccountId, subAccounts])

  // Effective sub-account for display: the selected one on multi-account lenders,
  // the sole entry on single-account lenders. A null selection (user chose "new
  // account") intentionally resolves to nothing → no existing position shown.
  const effectiveSub = hasSubAccounts
    ? subAccounts.find((s) => s.accountId === selectedAccountId)
    : subAccounts[0]
  // accountId sent to the backend — only for multi-account lenders with a
  // concrete pick (null = let the protocol assign a fresh sub-account).
  const accountIdForCalls =
    hasSubAccounts && selectedAccountId != null ? selectedAccountId : undefined

  const collateralPos = findAggPosition(effectiveSub, row.marketLongUid)
  const debtPos = findAggPosition(effectiveSub, row.marketShortUid)
  const curDeposits = Number(collateralPos?.deposits ?? 0)
  const curDebt = Number(debtPos?.debt ?? 0) + Number(debtPos?.debtStable ?? 0)
  const curDepositsUsd = collateralPos?.depositsUSD ?? 0
  const curDebtUsd = (debtPos?.debtUSD ?? 0) + (debtPos?.debtStableUSD ?? 0)
  const hasExistingPosition = curDeposits > 0 || curDebt > 0

  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-3 space-y-3">
      {/* Header: the selected pair + lender */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Overlapping collateral → debt token logos */}
          <div className="flex items-center shrink-0">
            <Logo
              src={row.collateral.logoURI}
              alt={row.collateral.symbol ?? ''}
              fallbackText={row.collateral.symbol ?? '?'}
              className="w-7 h-7 rounded-full ring-2 ring-base-100 relative z-10"
            />
            <Logo
              src={row.debt.logoURI}
              alt={row.debt.symbol ?? ''}
              fallbackText={row.debt.symbol ?? '?'}
              className="w-7 h-7 rounded-full ring-2 ring-base-100 -ml-2"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-sm font-semibold">
              <span className="truncate">{row.collateral.symbol}</span>
              <span className="text-base-content/30 shrink-0">→</span>
              <span className="truncate">{row.debt.symbol}</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5 min-w-0" title={row.lenderKey}>
              {lenderLogo && (
                <Logo
                  src={lenderLogo}
                  alt={displayLender}
                  fallbackText={displayLender}
                  className="w-3.5 h-3.5 rounded-full shrink-0"
                />
              )}
              <span className="text-[11px] text-base-content/60 truncate">{displayLender}</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-circle shrink-0"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Sub-account picker (multi-account lenders: Euler, Fluid, Dolomite, …).
          Drives which position the deposit/borrow extends. The Loop tab embeds
          its own selector (LoopAction), so hide this one there. */}
      {op !== 'loop' && hasSubAccounts && account && (
        <SubAccountSelector
          subAccounts={subAccounts}
          selectedAccountId={selectedAccountId}
          onChange={setSelectedAccountId}
          allowCreate
          chainId={row.chainId}
          lender={row.lenderKey}
          account={account}
        />
      )}

      {/* Existing position on this pair — so the user sees they're adding to a
          position they already hold (deposit more / borrow more), not opening
          fresh. The simulation below chains onto exactly this. */}
      {op !== 'loop' && hasExistingPosition && (
        <div className="rounded-lg border border-base-300 px-2 py-1.5 text-[11px] space-y-0.5">
          <div className="text-[10px] uppercase tracking-wide text-base-content/50">
            Your position
          </div>
          {curDeposits > 0 && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-base-content/60">Deposited {row.collateral.symbol}</span>
              <span className="inline-flex items-center gap-1 text-success font-medium whitespace-nowrap">
                {fmtBal(String(curDeposits))}
                <UsdAmount value={curDepositsUsd} />
              </span>
            </div>
          )}
          {curDebt > 0 && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-base-content/60">Borrowed {row.debt.symbol}</span>
              <span className="inline-flex items-center gap-1 text-error font-medium whitespace-nowrap">
                {fmtBal(String(curDebt))}
                <UsdAmount value={curDebtUsd} />
              </span>
            </div>
          )}
        </div>
      )}

      {/* Operation tabs */}
      <div role="tablist" className="tabs tabs-boxed tabs-xs">
        <button
          type="button"
          className={`tab ${op === 'deposit-borrow' ? 'tab-active' : ''}`}
          onClick={() => setOp('deposit-borrow')}
        >
          Deposit &amp; Borrow
        </button>
        <button
          type="button"
          className={`tab ${op === 'withdraw-repay' ? 'tab-active' : ''}`}
          onClick={() => setOp('withdraw-repay')}
        >
          Withdraw &amp; Repay
        </button>
        <button
          type="button"
          className={`tab ${op === 'loop' ? 'tab-active' : ''}`}
          onClick={() => setOp('loop')}
        >
          Loop
        </button>
      </div>

      {op === 'deposit-borrow' && (
        <CombinedForm
          mode="deposit-borrow"
          row={row}
          account={account}
          walletBalances={walletBalances}
          nativeToken={nativeToken}
          isBalancesFetching={isBalancesFetching}
          refetchBalances={refetchBalances}
          accountId={accountIdForCalls}
        />
      )}
      {op === 'withdraw-repay' && (
        <CombinedForm
          mode="withdraw-repay"
          row={row}
          account={account}
          walletBalances={walletBalances}
          nativeToken={nativeToken}
          isBalancesFetching={isBalancesFetching}
          refetchBalances={refetchBalances}
          accountId={accountIdForCalls}
        />
      )}
      {op === 'loop' && (
        <div className="space-y-2">
          <p className="text-base-content/60 text-xs">
            Leverage this pair up to{' '}
            <span className="font-semibold text-base-content">{row.maxLeverage.toFixed(2)}×</span>.
          </p>
          <OptimizerLoopPanel row={row} account={account} />
        </div>
      )}
    </div>
  )
}
