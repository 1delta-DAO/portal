import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { zeroAddress } from 'viem'
import {
  riskLabelFromScore,
  type OptimizerAssetRef,
  type OptimizerAuction,
  type OptimizerPairRow,
} from '../../../../hooks/lending/useOptimizerPairs'
import type { LendingTx } from '../../../../hooks/useSendLendingTransaction'
import { AmountInput } from '../../../common/AmountInput'
import { BatchExecuteButton } from '../../../common/BatchExecuteButton'
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
import { ComparableRatesPill } from '../../shared/ComparableRatesPill'
import { RiskBadge } from '../../shared/RiskBadge'
import { useCombinedAction, gt0, asCurrency, type CombinedAction } from './useCombinedAction'

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

// ---------------------------------------------------------------------------
// Small presentation helpers.
// ---------------------------------------------------------------------------

const fmtBal = (s?: string): string =>
  Number(s ?? '0').toLocaleString(undefined, { maximumFractionDigits: 6 })

/**
 * Format a chart-picked token size into a clean input string: up to 6 decimals
 * with trailing zeros trimmed (e.g. 78000 → "78000", 0.1234560 → "0.123456").
 */
const pickToAmount = (size: number): string =>
  Number.isFinite(size) && size > 0 ? String(Number(size.toFixed(6))) : ''

/**
 * Inverse FiRM only: DBR runway readout on the one-shot forms. FiRM prepays
 * interest in DBR (1 DBR = 1 DOLA-year; the yearly burn IS the debt), a
 * zero-DBR borrow silently accrues a ~54.75% APR force-replenish penalty
 * from the next block, and a deficit freezes withdrawals — so the runway is
 * the single number a FiRM borrower has to watch.
 */
function DbrRunwayInfo({ dbr }: { dbr?: import('../../../../sdk/lending-helper/fetchCombinedAction').InverseDbrState }) {
  if (!dbr) return null
  const balance = Number(dbr.balance) / 1e18
  const deficit = Number(dbr.deficit) / 1e18
  const yearlyBurn = Number(dbr.yearlyBurn) / 1e18
  const runwayDays = Number(dbr.runwaySeconds) / 86400
  // Nothing to show on a full close (no residual debt burns no DBR).
  if (yearlyBurn <= 0 && deficit <= 0) return null

  const runwayLabel =
    runwayDays >= 365 * 3
      ? `${(runwayDays / 365).toFixed(1)}y`
      : runwayDays >= 90
        ? `${Math.floor(runwayDays / 30)}mo`
        : `${Math.floor(runwayDays)}d`
  const short = deficit > 0 || runwayDays < 30

  return (
    <div className={`rounded-lg border p-2 text-xs space-y-1 ${deficit > 0 ? 'border-error/50 bg-error/5' : short ? 'border-warning/50 bg-warning/5' : 'border-base-300'}`}>
      <div className="flex items-center justify-between">
        <span className="text-base-content/60">DBR (prepaid interest)</span>
        <a
          className="link link-primary"
          href="https://www.inverse.finance/firm/dbr"
          target="_blank"
          rel="noreferrer"
        >
          Get DBR
        </a>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-base-content/60">Balance</span>
        <span>{fmtBal(String(balance))} DBR</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-base-content/60">Burn at this debt</span>
        <span>{fmtBal(String(yearlyBurn))} DBR / year</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-base-content/60">Runway</span>
        <span className={short ? 'text-warning font-medium' : ''}>{runwayLabel}</span>
      </div>
      {deficit > 0 ? (
        <div className="text-error">
          DBR deficit of {fmtBal(String(deficit))} — the position accrues a
          ~54.75% APR penalty and withdrawals are frozen until you top up DBR.
        </div>
      ) : short ? (
        <div className="text-warning">
          Runway under 30 days — top up DBR before it runs out or the debt
          starts accruing a ~54.75% APR penalty.
        </div>
      ) : null}
    </div>
  )
}

const routeLabel: Record<string, string> = {
  native: 'Atomic (native)',
  composer: 'Atomic (composer)',
  sequential: 'Multi-step',
  auction: 'Auction bid',
}

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

const RefreshIcon = () => (
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
)

// ---------------------------------------------------------------------------
// Form legs — each renders one side of the combined action. All state lives in
// `useCombinedAction`; these are purely presentational.
// ---------------------------------------------------------------------------

/**
 * The leg the user drives first (deposit collateral / repay debt). Shows the
 * optional native-vs-wrapped toggle, the wallet balance (tap to fill), and the
 * amount input capped at the wallet balance.
 */
function PrimaryLeg({
  label,
  token,
  canUseNative,
  nativeToken,
  payNative,
  onPayNativeChange,
  wallet,
  maxAmount,
  overMax,
  value,
  onChange,
  priceUsd,
  isBalancesFetching,
  refetchBalances,
}: {
  label: string
  token: OptimizerAssetRef
  canUseNative: boolean
  nativeToken: RawCurrency | null
  payNative: boolean
  onPayNativeChange: (v: boolean) => void
  wallet: TokenBalance | null
  maxAmount: string
  overMax: boolean
  value: string
  onChange: (v: string) => void
  priceUsd: number
  isBalancesFetching?: boolean
  refetchBalances?: () => void
}) {
  const spendSymbol = (payNative && nativeToken ? nativeToken.symbol : token.symbol) ?? '—'
  return (
    <div className="form-control">
      {canUseNative && nativeToken && (
        <div className="mb-1.5">
          <NativeCurrencySelector
            wrappedSymbol={token.symbol ?? 'Wrapped'}
            nativeToken={nativeToken}
            useNative={payNative}
            onChange={onPayNativeChange}
            label="Pay with"
          />
        </div>
      )}
      <span className="label-text text-xs mb-1 block">
        {label} · {spendSymbol}
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
                <RefreshIcon />
              )}
            </button>
          )}
        </span>
        {wallet ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 font-medium hover:text-base-content transition-colors"
            onClick={() => onChange(wallet.balance)}
            title="Use full balance"
          >
            <span>{fmtBal(wallet.balance)}</span>
            {wallet.balanceUSD > 0 && <UsdAmount value={wallet.balanceUSD} />}
          </button>
        ) : isBalancesFetching ? (
          <span className="text-base-content/40">Loading…</span>
        ) : (
          <span className="text-base-content/40">—</span>
        )}
      </div>
      <AmountInput
        value={value}
        onChange={onChange}
        maxAmount={maxAmount}
        onMaxClick={() => onChange(maxAmount)}
        decimals={token.decimals}
        placeholder="0.0"
        error={overMax ? `Exceeds wallet balance (${fmtBal(maxAmount)})` : null}
        usdValue={priceUsd > 0 ? Number(value) * priceUsd : undefined}
      />
    </div>
  )
}

/**
 * The derived leg (borrow / withdraw), whose `max` comes from the range
 * endpoint given the primary amount. May be delivered as native when the token
 * is wrapped-native.
 */
function SecondaryLeg({
  label,
  token,
  canUseNative,
  nativeToken,
  receiveNative,
  onReceiveNativeChange,
  maxAmount,
  value,
  onChange,
  priceUsd,
}: {
  label: string
  token: OptimizerAssetRef
  canUseNative: boolean
  nativeToken: RawCurrency | null
  receiveNative: boolean
  onReceiveNativeChange: (v: boolean) => void
  maxAmount: string
  value: string
  onChange: (v: string) => void
  priceUsd: number
}) {
  const deliverSymbol = (receiveNative && nativeToken ? nativeToken.symbol : token.symbol) ?? '—'
  const overMax = gt0(value) && Number(value) > Number(maxAmount) + 1e-9
  return (
    <div className="form-control">
      {canUseNative && nativeToken && (
        <div className="mb-1.5">
          <NativeCurrencySelector
            wrappedSymbol={token.symbol ?? 'Wrapped'}
            nativeToken={nativeToken}
            useNative={receiveNative}
            onChange={onReceiveNativeChange}
            label="Receive as"
          />
        </div>
      )}
      <span className="label-text text-xs mb-1 flex items-center justify-between">
        <span>
          {label} · {deliverSymbol}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-base-content/50">
          max {fmtBal(maxAmount)}
        </span>
      </span>
      <AmountInput
        value={value}
        onChange={onChange}
        maxAmount={maxAmount}
        onMaxClick={() => onChange(maxAmount)}
        decimals={token.decimals}
        placeholder="0.0"
        error={
          overMax
            ? `Exceeds max (${Number(maxAmount).toLocaleString(undefined, { maximumFractionDigits: 6 })})`
            : null
        }
        usdValue={priceUsd > 0 ? Number(value) * priceUsd : undefined}
      />
    </div>
  )
}

/** "3d 4h" / "5h 20m" / "12m". */
function fmtCountdown(secs: number): string {
  if (secs <= 0) return '0m'
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}

/**
 * Auction-window notice for Term Finance markets.
 *
 * Borrowing here means submitting a sealed bid into a periodic round — it is
 * not continuously available. When no round is open the borrow leg simply
 * cannot be built, so the panel has to say that up front instead of letting
 * someone fill in an amount and press a button that can't do anything. When a
 * round IS open, the deadline is the actionable fact, so it leads.
 */
function AuctionNotice({ auction }: { auction?: OptimizerAuction }) {
  if (!auction) return null
  const now = Math.floor(Date.now() / 1000)

  // The backend ships a ready-to-display consequence list (`implications`, the
  // same convention as Teller's), so the body renders that instead of keeping a
  // second copy of the wording here that would drift from it. The headline
  // stays local because it carries a LIVE countdown the cached strings can't.
  const detail = auction.implications?.length ? (
    <ul className="mt-1 space-y-0.5 list-disc pl-3.5 text-base-content/60">
      {auction.implications.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  ) : null

  const box = (tone: string, head: ReactNode) => (
    <div className={`rounded-lg border p-2 text-[11px] leading-tight ${tone}`}>
      <div className="font-semibold">{head}</div>
      {detail}
    </div>
  )

  if (auction.status === 'open') {
    const left = auction.revealTime != null ? auction.revealTime - now : null
    return box(
      'border-success/30 bg-success/5',
      <span className="text-success">
        Auction open
        {left != null && left > 0 ? ` · closes in ${fmtCountdown(left)}` : ''}
        {auction.revealTime != null
          ? ` (${new Date(auction.revealTime * 1000).toLocaleString()})`
          : ''}
      </span>
    )
  }

  if (auction.status === 'upcoming') {
    const until = auction.startTime != null ? auction.startTime - now : null
    return box(
      'border-info/30 bg-info/5',
      <span className="text-info">
        Auction opens in {until != null ? fmtCountdown(until) : 'soon'}
      </span>
    )
  }

  if (auction.status === 'revealing') {
    return box(
      'border-warning/30 bg-warning/5',
      <span className="text-warning">Auction clearing</span>
    )
  }

  return box('border-base-300 bg-base-200/50', <span>No auction open</span>)
}

/**
 * Holding period the rate comparison is normalized to: the selected fixed
 * term's length, so a locked rate is compared over the period it is actually
 * locked for. Undefined for a variable borrow — the server then defaults to a
 * year, where a floating pool's effective rate is just its sticker rate.
 */
function comparisonHorizonDays(
  terms: CombinedAction['debtTerms'],
  termId: string | null,
): number | undefined {
  if (!termId) return undefined
  const t = terms.find((x) => String(x.termId ?? '') === termId)
  const d = Number(t?.durationDays)
  return Number.isFinite(d) && d > 0 ? d : undefined
}

/**
 * Fixed-term borrow picker (Lista broker) — one button per maturity. Selecting
 * a term routes the open through the atomic composer; leaving it drives the
 * multi-step flex borrow. Borrow leg only.
 */
function FixedTermPicker({
  terms,
  termId,
  onSelect,
  symbol,
}: {
  terms: CombinedAction['debtTerms']
  termId: string | null
  onSelect: (id: string) => void
  symbol?: string
}) {
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center rounded-md bg-warning/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide leading-none text-warning">
          Fixed-term
        </span>
        <span className="text-[10px] text-base-content/60 leading-tight">
          Borrow term · {symbol}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {terms.map((t) => {
          const tid = String(t.termId ?? '')
          const active = tid === termId
          return (
            <button
              key={tid}
              type="button"
              onClick={() => onSelect(tid)}
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
  )
}

/**
 * Primary CTA — sends the permissions then the transactions, showing progress.
 * When the wallet can batch atomically the whole `steps` list collapses into a
 * single confirmation instead (see `BatchExecuteButton`).
 */
function ExecuteButton({
  account,
  isOpen,
  steps,
  stepLabels,
  step,
  running,
  sending,
  building,
  blockedReason,
  batchSupported,
  batchNeedsUpgrade,
  onExecute,
  onExecuteBatch,
}: {
  account?: string
  isOpen: boolean
  steps: LendingTx[]
  stepLabels: string[]
  step: number
  running: boolean
  sending: boolean
  building: boolean
  /** Set when the action cannot be performed at all right now (e.g. the Term
   *  auction round is closed). Becomes the button label so the CTA states the
   *  blocker instead of sitting disabled under an unrelated caption. */
  blockedReason?: string
  batchSupported: boolean
  batchNeedsUpgrade: boolean
  onExecute: () => void
  onExecuteBatch: () => void
}) {
  const idleLabel = !account
    ? 'Connect wallet'
    : (blockedReason ?? (isOpen ? 'Deposit & Borrow' : 'Withdraw & Repay'))

  if (batchSupported && steps.length > 0) {
    return (
      <BatchExecuteButton
        steps={stepLabels}
        label={idleLabel}
        executing={running || sending}
        disabled={!account || !!blockedReason || building}
        needsUpgrade={batchNeedsUpgrade}
        onExecute={onExecuteBatch}
      />
    )
  }

  return (
    <button
      type="button"
      className="btn btn-success btn-sm w-full"
      disabled={!account || !!blockedReason || !steps.length || building || running || sending}
      onClick={onExecute}
    >
      {running || sending ? (
        <>
          <span className="loading loading-spinner loading-xs" />
          {stepLabels[Math.min(step, stepLabels.length - 1)] ?? 'Working…'} (
          {Math.min(step + 1, steps.length)}/{steps.length})
        </>
      ) : !account ? (
        'Connect wallet'
      ) : blockedReason ? (
        blockedReason
      ) : steps.length > 1 ? (
        `Execute (${steps.length} steps)`
      ) : isOpen ? (
        'Deposit & Borrow'
      ) : (
        'Withdraw & Repay'
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Combined form: deposit-and-borrow / withdraw-and-repay
//
// Purely presentational — the whole data + transaction flow lives in
// `useCombinedAction`; this component just wires that state into the legs.
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
  const a = useCombinedAction({ mode, row, account, walletBalances, nativeToken, accountId })

  if (a.done) {
    return (
      <div className="rounded-lg p-3 bg-success/10 ring-1 ring-success/40 text-sm space-y-2">
        <div className="font-semibold text-success">
          {a.isOpen ? 'Position opened' : 'Position updated'} ✓
        </div>
        <button type="button" className="btn btn-ghost btn-xs" onClick={a.startAnother}>
          Start another
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <PrimaryLeg
        label={a.primaryLabel}
        token={a.primaryToken}
        canUseNative={a.primaryCanUseNative}
        nativeToken={nativeToken}
        payNative={a.payNative}
        onPayNativeChange={a.setPayNative}
        wallet={a.primaryBal}
        maxAmount={a.primaryMax}
        overMax={a.primaryOverMax}
        value={a.primary}
        onChange={a.setPrimary}
        priceUsd={a.priceP}
        isBalancesFetching={isBalancesFetching}
        refetchBalances={refetchBalances}
      />

      {/* Auction window (Term Finance). Shown on the borrow leg only — the
          window gates ORIGINATION; repaying/withdrawing an existing position is
          unaffected by it. Placed above the term picker because when the round
          is closed there are no terms to pick and this explains why. */}
      {a.isOpen && <AuctionNotice auction={row.auction} />}

      {a.isDebtBrokered && (
        <FixedTermPicker
          terms={a.debtTerms}
          termId={a.termId}
          onSelect={a.setTermId}
          symbol={a.secondaryToken.symbol}
        />
      )}

      <SecondaryLeg
        label={a.secondaryLabel}
        token={a.secondaryToken}
        canUseNative={a.secondaryCanUseNative}
        nativeToken={nativeToken}
        receiveNative={a.receiveNative}
        onReceiveNativeChange={a.setReceiveNative}
        maxAmount={a.secondaryMax}
        value={a.secondary}
        onChange={a.setSecondary}
        priceUsd={a.priceS}
      />

      {/* "What would this borrow cost elsewhere?" — the best comparable venues
          for this exact pair, priced at the entered size and, when a fixed term
          is selected, over that term's length. Borrow leg only: the comparison
          is about opening a position, not closing one. */}
      {a.isOpen && a.debtUid && (
        <div className="flex items-center justify-between gap-2 px-1 text-xs">
          <span className="text-base-content/60">Elsewhere</span>
          <ComparableRatesPill
            chainId={row.chainId}
            debtAddress={row.debt.address}
            collateralAddress={row.collateral.address}
            amount={Number(a.dSecondary) || undefined}
            horizonDays={comparisonHorizonDays(a.debtTerms, a.termId)}
            referenceMarketUid={a.debtUid}
            referenceTermId={a.termId ?? undefined}
            currentAprPct={row.borrowAprEffective * 100}
          />
        </div>
      )}

      {/* Borrow-rate depth: how the debt market's rate climbs with the borrow
          size, with a live marker at the entered amount. Borrow leg only. */}
      {a.isOpen && a.debtUid && (
        <DepthChart
          marketUid={a.debtUid}
          side="borrow"
          markerAmount={Number(a.dSecondary) || 0}
          symbol={a.secondaryToken.symbol}
          price={a.priceS}
          onPick={(size) => a.setSecondary(pickToAmount(size))}
        />
      )}

      {/* Route + health projection */}
      {a.result?.route && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-base-content/60">Route</span>
          <span className="badge badge-ghost badge-sm">
            {routeLabel[a.result.route] ?? a.result.route}
          </span>
        </div>
      )}
      <DbrRunwayInfo dbr={a.result?.dbr} />
      <HealthFactorProjection simulation={a.result?.simulation} />

      {a.building && (
        <div className="text-xs text-base-content/50 flex items-center gap-2">
          <span className="loading loading-spinner loading-xs" /> Building…
        </div>
      )}
      {a.buildError && <div className="text-xs text-error break-words">{a.buildError}</div>}
      {a.runError && <div className="text-xs text-error break-words">{a.runError}</div>}

      <ExecuteButton
        account={account}
        isOpen={a.isOpen}
        steps={a.steps}
        stepLabels={a.stepLabels}
        step={a.step}
        running={a.running}
        sending={a.sending}
        building={a.building}
        batchSupported={a.batchSupported}
        batchNeedsUpgrade={a.batchNeedsUpgrade}
        onExecuteBatch={a.executeBatch}
        blockedReason={
          // Origination-only: an auction round gates OPENING a borrow, never
          // closing one, so withdraw-and-repay stays available regardless.
          // `canBorrow` rather than `status` — it also accounts for maturity.
          a.isOpen && row.auction && !row.auction.canBorrow
            ? row.auction.status === 'upcoming'
              ? 'Auction not open yet'
              : row.auction.status === 'revealing'
                ? 'Auction is clearing'
                : 'No auction open'
            : undefined
        }
        onExecute={a.execute}
      />
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
            <div className="flex items-center gap-1 mt-0.5 min-w-0">
              {lenderLogo && (
                <Logo
                  src={lenderLogo}
                  alt={displayLender}
                  fallbackText={displayLender}
                  className="w-3.5 h-3.5 rounded-full shrink-0"
                />
              )}
              <span className="text-[11px] text-base-content/60 truncate" title={row.lenderKey}>
                {displayLender}
              </span>
              {/* Lender / chain / config risk alongside the two token risks —
                  this panel is where the position is actually opened, so the
                  protocol-level assessment belongs here and not only in the
                  table row behind it. */}
              {row.riskScore > 0 && row.riskBreakdown.length > 0 && (
                <RiskBadge
                  label={riskLabelFromScore(row.riskScore)}
                  breakdown={row.riskBreakdown}
                  size="sm"
                />
              )}
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
