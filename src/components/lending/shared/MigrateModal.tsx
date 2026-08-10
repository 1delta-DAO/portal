import React, { useEffect, useMemo, useState } from 'react'
import { parseUnits } from 'viem'
import { useSendLendingTransaction } from '../../../hooks/useSendLendingTransaction'
import { useAtomicBatch } from '../../../hooks/useAtomicBatch'
import { BatchExecuteButton } from '../../common/BatchExecuteButton'
import type { OptimizerAssetRef } from '../../../hooks/lending/useOptimizerPairs'
import { useLenders } from '../../../hooks/lending/usePoolData'
import {
  fetchMigrateTargets,
  type MigrateTargetRow,
} from '../../../sdk/lending-helper/fetchMigrateTargets'
import {
  fetchMigrate,
  type MigrateResult,
  type MigratePositionResult,
} from '../../../sdk/lending-helper/fetchMigrate'
import { LenderBadge } from './LenderBadge'
import { Logo } from '../../common/Logo'

/**
 * Show a leg's USD value when a price is available, else fall back to the token
 * AMOUNT (so a leg never renders as "—" just because its price feed is missing —
 * e.g. WMON on Monad has an amount but no USD price).
 */
function legValue(leg?: {
  amount?: string
  amountUsd?: number
  decimals?: number
  symbol?: string
}): string {
  if (!leg) return '—'
  if (leg.amountUsd != null)
    return `$${leg.amountUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  if (leg.amount != null && leg.decimals != null) {
    const n = Number(leg.amount) / 10 ** leg.decimals
    return `${n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 6 : 4 })} ${leg.symbol ?? ''}`.trim()
  }
  return '—'
}

/** Compact token amount for swap-route rows: keeps precision when small. */
function fmtAmt(v: number): string {
  if (!Number.isFinite(v) || v === 0) return '0'
  const abs = Math.abs(v)
  if (abs < 0.0001) return '<0.0001'
  if (abs < 1) return v.toFixed(4)
  if (abs < 1_000) return v.toFixed(2)
  if (abs < 1_000_000) return `${(v / 1_000).toFixed(2)}K`
  return `${(v / 1_000_000).toFixed(2)}M`
}

/** Risk label/color from the overall score (worst dimension, ~0–5+). */
function riskLabel(s: number): string {
  return s >= 5 ? 'high risk' : s >= 3 ? 'med risk' : 'low risk'
}
function riskBadgeClass(s: number): string {
  if (s >= 5) return 'bg-error/15 text-error'
  if (s >= 3) return 'bg-warning/15 text-warning'
  return 'bg-success/15 text-success'
}
/** Per-dimension breakdown for the badge tooltip. */
function riskTooltip(b: { category: string; score: number; label: string }[]): string {
  if (!b?.length) return 'Risk score'
  return b.map((d) => `${d.category}: ${d.label} (${d.score})`).join(' · ')
}

/** Health-factor display: ∞ for no/near-zero debt, 2 decimals otherwise. */
function fmtHealth(h: number): string {
  return h >= 100 ? '∞' : h.toFixed(2)
}

/** Green (safe) / amber (caution) / red (risky) by health factor. */
function healthColorClass(h: number): string {
  if (h >= 1.5) return 'text-success'
  if (h >= 1.1) return 'text-warning'
  return 'text-error'
}

/** Days until a fixed-term maturity (unix seconds), for the term badge. */
function daysUntil(unixSeconds: number): number {
  return Math.max(0, Math.round((unixSeconds * 1000 - Date.now()) / 86_400_000))
}

// ---------------------------------------------------------------------------
// Source descriptor — one collateral leg + one debt leg of an existing
// position, resolved by the caller from a sub-account.
// ---------------------------------------------------------------------------

export interface MigrateLeg {
  /** `lender:chainId:address` of this leg's market. */
  marketUid: string
  /** Underlying token address (lower-cased). */
  address: string
  symbol: string
  logoURI?: string
  decimals: number
}

export interface MigrateSource {
  account: string
  chainId: string
  /** Sub-account id of the source position (Fluid NFT id / sub-account index). */
  accountId: string
  /** Source lender key (shared by both legs). */
  lenderKey: string
  /** Current health factor of the source position (for the before→after compare). */
  currentHealth?: number | null
  /** Live oracle USD prices read off the position. The endpoints resolve prices
   *  themselves; these are passed as overrides because a read from the position
   *  the user is looking at is fresher than the shared feed — and is the only
   *  source for a token the feed doesn't carry (e.g. WMON on Monad). */
  collateralPriceUsd?: number
  debtPriceUsd?: number
  /** Collateral leg + its live amount in token units (for the result display). */
  collateral: MigrateLeg & { amount?: number }
  /** Debt leg + the live debt amount in token units (what we repay/re-borrow). */
  debt: MigrateLeg & {
    amount: number
    /**
     * Lista fixed-term broker source only: the loan `posId` to repay (or the
     * flex sentinel). Required when the source debt market is brokered.
     */
    loanId?: string
  }
}

interface MigrateModalProps {
  source: MigrateSource
  onClose: () => void
}

/**
 * Migrate a whole (collateral + debt) position to another lender or market.
 *
 * Opens from a position in `YourPositions`. `/v1/actions/loop/migrate/targets`
 * returns the destinations the migrate builder will actually accept — already
 * ranked, already priced for this position's size — and the user picks one.
 * Picking + confirming builds the flash-loan-backed bundle (`fetchMigrate`) and
 * executes its permissions then transactions. Works at any LTV; the source
 * repay is sized with a small buffer so the full collateral withdrawal can't
 * revert.
 *
 * This component deliberately holds NO protocol knowledge. It used to: a
 * per-chain wrapped-native address table, a hand-maintained list of lenders that
 * cannot be a migrate target, a synthetic pair-row builder for order-book
 * markets, and its own health-factor / net-APR maths. Every one of those was a
 * copy of something the API already knew, and two of them were wrong (the
 * native-asset search used a sentinel no data endpoint serves, and the lender
 * denylist was missing three of five exclusions). If a rule about what can be
 * migrated where belongs anywhere, it belongs behind the endpoint.
 */
export const MigrateModal: React.FC<MigrateModalProps> = ({ source, onClose }) => {
  const { account, chainId, accountId, collateral, debt } = source

  // Human-readable lender names + logos, so we show "Aave V3" / "Neverland"
  // instead of raw keys like AAVE_V3. Per-market keys (Midnight, Morpho markets)
  // that this enumeration misses fall back to the key itself.
  const { lenders: lenderSummaries } = useLenders(chainId, true, 100)
  const lenderInfo = useMemo(() => {
    const map: Record<string, { name?: string; logoURI?: string }> = {}
    for (const s of lenderSummaries ?? []) {
      if (s.lenderInfo?.key) map[s.lenderInfo.key] = s.lenderInfo
    }
    return map
  }, [lenderSummaries])
  const lenderName = (key?: string) => (key ? (lenderInfo[key]?.name ?? key) : '')

  // ── Optional asset CONVERSION (swap leg) ──────────────────────────────────
  // The migrate can convert ONE leg via an aggregator swap. The user toggles it
  // on, picks WHICH leg to convert, then a target asset. The pickable assets come
  // back from the same endpoint (`convertibleAssets`) — they are the assets that
  // actually have qualifying markets against the fixed leg, so every choice
  // yields results.
  const [swapEnabled, setSwapEnabled] = useState(false)
  const [swapLeg, setSwapLeg] = useState<'collateral' | 'debt'>('collateral')
  const [swapTarget, setSwapTarget] = useState<string | null>(null)
  const [showLowLiquidity, setShowLowLiquidity] = useState(false)

  // Debt to migrate, in wei. The backend buffers above this, so rounding the
  // float token amount up to full precision is safe.
  const debtAmountWei = useMemo(() => {
    try {
      return parseUnits(debt.amount.toFixed(debt.decimals) as `${number}`, debt.decimals).toString()
    } catch {
      return null
    }
  }, [debt.amount, debt.decimals])

  const collateralAmountWei = useMemo(() => {
    if (collateral.amount == null) return undefined
    try {
      return parseUnits(
        collateral.amount.toFixed(collateral.decimals) as `${number}`,
        collateral.decimals
      ).toString()
    } catch {
      return undefined
    }
  }, [collateral.amount, collateral.decimals])

  // ── Target discovery ──────────────────────────────────────────────────────
  // One call. `/v1/actions/loop/migrate/targets` returns exactly the
  // destinations `/migrate` will accept for this position, already ranked by the
  // resulting net APR and already filtered for: the migrate support matrix,
  // native ⇄ wrapped-native equivalence, native-debt targets, un-openable order
  // books, and borrow liquidity at this position's size. All of that used to be
  // re-implemented here — including a hard-coded per-chain wrapped-native table
  // and a lender denylist that silently went stale — so the shape of this
  // component is now "render what the API decided", deliberately.
  const [targetsState, setTargetsState] = useState<{
    rows: MigrateTargetRow[]
    convertibleAssets?: OptimizerAssetRef[]
    excluded: { lender: string; reason: string }[]
    isLoading: boolean
    error: string | null
  }>({ rows: [], excluded: [], isLoading: true, error: null })

  useEffect(() => {
    const ctrl = new AbortController()
    setTargetsState((s) => ({ ...s, isLoading: true, error: null }))
    fetchMigrateTargets(
      {
        marketUidSourceCollateral: collateral.marketUid,
        marketUidSourceDebt: debt.marketUid,
        debtAmount: debtAmountWei ?? undefined,
        collateralAmount: collateralAmountWei,
        convertLeg: swapEnabled ? swapLeg : undefined,
        convertTo: swapEnabled ? (swapTarget ?? undefined) : undefined,
        // Live oracle prices off the position we are looking at — fresher than
        // any feed, and the only source for a token the feed doesn't carry.
        collateralPriceUsd: source.collateralPriceUsd,
        debtPriceUsd: source.debtPriceUsd,
        count: 100,
        // Ask for the illiquid ones too and split them below. The alternative —
        // refetching when the user reveals them — makes the reveal toggle
        // disappear, because the endpoint then reports nothing as hidden.
        includeIlliquid: true,
      },
      ctrl.signal
    )
      .then((res) =>
        setTargetsState({
          rows: res.targets,
          convertibleAssets: res.convertibleAssets,
          excluded: res.excluded,
          isLoading: false,
          error: res.success ? null : (res.error ?? 'Failed to load markets'),
        })
      )
      .catch((e) => {
        if (e?.name === 'AbortError') return
        setTargetsState((s) => ({ ...s, isLoading: false, error: e?.message }))
      })
    return () => ctrl.abort()
  }, [
    collateral.marketUid,
    debt.marketUid,
    debtAmountWei,
    collateralAmountWei,
    swapEnabled,
    swapLeg,
    swapTarget,
    source.collateralPriceUsd,
    source.debtPriceUsd,
  ])

  const { isLoading, error: pairsError } = targetsState
  // A target that cannot fund the whole migrated debt would revert the borrow,
  // so it is hidden behind an explicit reveal rather than ranked alongside the
  // rest. `sufficientLiquidity` is the server's verdict at this position's size.
  const [liquidTargets, illiquidTargets] = useMemo(() => {
    const ok: MigrateTargetRow[] = []
    const low: MigrateTargetRow[] = []
    for (const r of targetsState.rows) (r.migrate.sufficientLiquidity ? ok : low).push(r)
    return [ok, low]
  }, [targetsState.rows])
  const hiddenForLiquidity = illiquidTargets.length
  const shownTargets = showLowLiquidity ? [...liquidTargets, ...illiquidTargets] : liquidTargets
  const swapAssetOptions = targetsState.convertibleAssets ?? []
  const swapTargetAsset = swapAssetOptions.find(
    (a) => a.address.toLowerCase() === swapTarget?.toLowerCase()
  )
  const rowKey = (r: MigrateTargetRow) => `${r.marketLongUid}|${r.marketShortUid}`

  // Per-market lenders (Euler vaults, Morpho markets, Aave e-modes) offer several
  // configs for the same asset pair, so one lender name appears on multiple rows.
  // Tag those rows with which config they are.
  const lenderCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of shownTargets) c[r.lenderKey] = (c[r.lenderKey] ?? 0) + 1
    return c
  }, [shownTargets])
  const configTag = (row: MigrateTargetRow): string | undefined => {
    if ((lenderCounts[row.lenderKey] ?? 0) <= 1) return undefined
    // Configs of the same lender differ by their RISK params, so label them by
    // what actually differs (LTV / max leverage / e-mode) — readable, unlike the
    // raw vault addresses. The vault uid stays in the row's tooltip.
    const parts: string[] = []
    if (row.ltv > 0) parts.push(`${(row.ltv * 100).toFixed(0)}% LTV`)
    if (row.maxLeverage > 0) parts.push(`${row.maxLeverage.toFixed(1)}×`)
    if (row.eModeConfigId) parts.push(`e-mode ${row.eModeConfigId}`)
    if (parts.length) return parts.join(' · ')
    const id = row.marketShortUid?.split(':')[2] ?? row.marketLongUid?.split(':')[2]
    return id ? `${id.slice(0, 6)}…${id.slice(-4)}` : undefined
  }

  const [selected, setSelected] = useState<MigrateTargetRow | null>(null)

  const [result, setResult] = useState<MigrateResult['data'] | null>(null)
  const [position, setPosition] = useState<MigratePositionResult | null>(null)
  const [building, setBuilding] = useState(false)
  const [buildError, setBuildError] = useState<string | null>(null)
  const [permissionsCompleted, setPermissionsCompleted] = useState(0)
  const [executingPermission, setExecutingPermission] = useState(false)
  const [executingMain, setExecutingMain] = useState(false)
  const [done, setDone] = useState<{ hash?: string } | null>(null)

  const { send } = useSendLendingTransaction({ chainId, account })
  const {
    supported: batchSupported,
    needsUpgrade: batchNeedsUpgrade,
    sendBatch,
  } = useAtomicBatch({ chainId, account })

  const permissions = result?.permissions ?? []
  const hasPermissions = permissions.length > 0
  const allPermissionsDone = !hasPermissions || permissionsCompleted >= permissions.length

  const pickTarget = async (row: MigrateTargetRow) => {
    setSelected(row)
    setResult(null)
    setPosition(null)
    setBuildError(null)
    setPermissionsCompleted(0)
    if (!debtAmountWei) {
      setBuildError('Could not determine the debt amount to migrate')
      return
    }
    setBuilding(true)
    // Deliberately minimal. The endpoint resolves the target's rates,
    // liquidation threshold, decimals and prices itself — those parameters exist
    // only as overrides, and passing them from here just re-asserted numbers the
    // server already had (and had to be kept in step with).
    const res = await fetchMigrate({
      marketUidSourceCollateral: collateral.marketUid,
      marketUidSourceDebt: debt.marketUid,
      marketUidTargetCollateral: row.marketLongUid!,
      marketUidTargetDebt: row.marketShortUid!,
      operator: account,
      debtAmount: debtAmountWei,
      isMaxIn: true,
      accountId,
      loanId: debt.loanId,
      // Swap-leg slippage (only used server-side when a leg is converted).
      slippage: swapEnabled && swapTarget ? 0.005 : undefined,
      // Display hint: for non-Aave sources the composer resolves the withdraw
      // on-chain, so the worker cannot know the deposited amount. This is the
      // one number only the client holds.
      collateralAmountHint: collateralAmountWei,
      // Same-asset moves only: a converted leg lands on a different token, whose
      // price the server resolves from the TARGET market. Sending the source
      // price there would value the new position at the old asset's price.
      collateralPriceUsd:
        swapEnabled && swapLeg === 'collateral' ? undefined : source.collateralPriceUsd,
      debtPriceUsd: swapEnabled && swapLeg === 'debt' ? undefined : source.debtPriceUsd,
    })
    setBuilding(false)
    if (!res.success) {
      setBuildError(res.error ?? 'Failed to build migrate transaction')
      return
    }
    setResult(res.data ?? null)
    setPosition(res.result ?? null)
  }

  const executeNextPermission = async () => {
    if (allPermissionsDone) return
    setExecutingPermission(true)
    setBuildError(null)
    const { ok, error: txError } = await send(permissions[permissionsCompleted])
    if (ok) setPermissionsCompleted((p) => p + 1)
    else setBuildError(txError ?? 'Permission transaction failed')
    setExecutingPermission(false)
  }

  const executeMain = async () => {
    if (!result) return
    setExecutingMain(true)
    setBuildError(null)
    let lastHash: string | undefined
    for (const tx of result.transactions) {
      const { ok, error: txError, hash } = await send(tx)
      if (!ok) {
        setBuildError(txError ?? 'Transaction failed')
        setExecutingMain(false)
        return
      }
      lastHash = hash
    }
    setExecutingMain(false)
    setDone({ hash: lastHash })
  }

  // Only offer the bundle while nothing has been confirmed on its own —
  // re-bundling would ask the wallet to repeat a grant that already landed.
  const useAtomicPath = batchSupported && permissionsCompleted === 0

  /** Atomic path: approvals + the migration itself in one confirmation. */
  const executeAll = async () => {
    if (!result) return
    setExecutingMain(true)
    setBuildError(null)
    const { ok, error: txError, hash } = await sendBatch([...permissions, ...result.transactions])
    setExecutingMain(false)
    if (!ok) {
      setBuildError(txError ?? 'Transaction failed')
      return
    }
    setPermissionsCompleted(permissions.length)
    setDone({ hash })
  }

  const executeLabel = `Migrate to ${lenderName(selected?.lenderKey) || 'target'}`

  return (
    <div className="modal modal-open" onClick={onClose}>
      <div
        className="modal-box max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
          onClick={onClose}
        >
          ✕
        </button>

        <h3 className="text-sm font-semibold mb-3">Migrate position</h3>

        {done ? (
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-2 py-4">
              <div className="text-success text-3xl">✓</div>
              <div className="text-sm font-medium">Migration submitted</div>
              {done.hash && (
                <div className="text-[11px] font-mono text-base-content/50 break-all px-2 text-center">
                  {done.hash}
                </div>
              )}
            </div>
            <button type="button" className="btn btn-sm w-full" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Source summary */}
            <div className="rounded-lg border border-base-300 bg-base-200/50 px-2.5 py-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wide text-base-content/50">
                  From
                </span>
                <LenderBadge
                  lenderKey={source.lenderKey}
                  name={lenderInfo[source.lenderKey]?.name}
                  logoURI={lenderInfo[source.lenderKey]?.logoURI}
                />
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 min-w-0">
                  <Logo
                    src={collateral.logoURI}
                    alt={collateral.symbol}
                    fallbackText={collateral.symbol}
                    className="rounded-full w-4 h-4 token-logo"
                  />
                  <span className="font-medium">{collateral.symbol}</span>
                  <span className="text-base-content/40">collateral</span>
                </span>
                <span className="flex items-center gap-1.5 min-w-0">
                  <Logo
                    src={debt.logoURI}
                    alt={debt.symbol}
                    fallbackText={debt.symbol}
                    className="rounded-full w-4 h-4 token-logo"
                  />
                  <span className="font-medium text-error">{debt.symbol}</span>
                  <span className="text-base-content/40">debt</span>
                </span>
              </div>
            </div>

            {/* Optional asset conversion (swap leg) */}
            <div className="rounded-lg border border-base-300 px-2.5 py-2 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-base-content/70">
                  Convert an asset (swap one leg)
                </span>
                <input
                  type="checkbox"
                  className="toggle toggle-sm"
                  checked={swapEnabled}
                  onChange={(e) => {
                    setSwapEnabled(e.target.checked)
                    setSwapTarget(null)
                    setSelected(null)
                  }}
                />
              </label>
              {swapEnabled && (
                <div className="space-y-2">
                  <div className="join w-full">
                    {(['collateral', 'debt'] as const).map((leg) => (
                      <button
                        key={leg}
                        type="button"
                        className={`btn btn-xs join-item flex-1 ${swapLeg === leg ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => {
                          setSwapLeg(leg)
                          setSwapTarget(null)
                          setSelected(null)
                        }}
                      >
                        {leg === 'collateral'
                          ? `Collateral (${collateral.symbol})`
                          : `Debt (${debt.symbol})`}
                      </button>
                    ))}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-base-content/50 px-0.5">
                    Convert {swapLeg} to
                  </div>
                  {swapAssetOptions.length === 0 ? (
                    <span className="text-[10px] text-base-content/40 px-0.5">
                      No convertible {swapLeg} assets pair with your{' '}
                      {swapLeg === 'collateral' ? debt.symbol : collateral.symbol}.
                    </span>
                  ) : (
                    <div className="max-h-44 overflow-y-auto rounded-lg border border-base-300 divide-y divide-base-300/60">
                      {swapAssetOptions.map((a) => {
                        const isSel = swapTarget?.toLowerCase() === a.address.toLowerCase()
                        return (
                          <button
                            key={a.address}
                            type="button"
                            className={`flex items-center gap-2 w-full px-2 py-1.5 text-left text-xs transition-colors ${
                              isSel
                                ? 'bg-primary/15 ring-1 ring-primary ring-inset'
                                : 'hover:bg-base-200'
                            }`}
                            onClick={() => {
                              setSwapTarget(isSel ? null : a.address)
                              setSelected(null)
                            }}
                          >
                            <Logo
                              src={a.logoURI}
                              alt={a.symbol ?? a.address}
                              fallbackText={a.symbol ?? '?'}
                              className="rounded-full object-contain w-5 h-5 shrink-0 token-logo"
                            />
                            <div className="flex flex-col min-w-0 flex-1 leading-tight">
                              <span className="font-medium truncate">
                                {a.symbol ?? `${a.address.slice(0, 6)}…${a.address.slice(-4)}`}
                              </span>
                              {a.name && (
                                <span
                                  className="text-[10px] text-base-content/50 truncate"
                                  title={a.name}
                                >
                                  {a.name}
                                </span>
                              )}
                            </div>
                            {a.priceUsd != null && a.priceUsd > 0 && (
                              <span className="shrink-0 text-[10px] text-base-content/50 font-mono tabular-nums">
                                $
                                {a.priceUsd.toLocaleString(undefined, {
                                  maximumFractionDigits: a.priceUsd < 1 ? 4 : 2,
                                })}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {swapTarget == null && swapAssetOptions.length > 0 && (
                    <span className="text-[10px] text-base-content/40 px-0.5">
                      Pick a target {swapLeg} asset to see qualifying markets.
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Target picker */}
            <div className="space-y-1.5">
              <span className="text-xs text-base-content/60 px-1">
                Migrate to{' '}
                {swapEnabled && swapLeg === 'collateral' && swapTargetAsset
                  ? swapTargetAsset.symbol
                  : collateral.symbol}{' '}
                /{' '}
                {swapEnabled && swapLeg === 'debt' && swapTargetAsset
                  ? swapTargetAsset.symbol
                  : debt.symbol}{' '}
                on
              </span>

              {isLoading && (
                <div className="flex items-center justify-center gap-2 py-3 text-xs text-base-content/60">
                  <span className="loading loading-spinner loading-xs" />
                  <span>Finding markets…</span>
                </div>
              )}

              {pairsError && <div className="text-[11px] text-error px-1">{pairsError}</div>}

              {!isLoading && shownTargets.length === 0 && (
                <div className="text-[11px] text-base-content/50 px-1 space-y-1">
                  <div>
                    {hiddenForLiquidity > 0
                      ? `No target market has enough borrow liquidity for this ${debt.symbol} debt (${hiddenForLiquidity} hidden with insufficient liquidity).`
                      : `No other market can receive this ${collateral.symbol}/${debt.symbol} position.`}
                  </div>
                  {/* An empty list is far more useful with the reasons attached —
                      the endpoint reports one per distinct cause. */}
                  {targetsState.excluded.length > 0 && (
                    <ul className="text-base-content/40 list-disc pl-4 space-y-0.5">
                      {targetsState.excluded.slice(0, 4).map((e) => (
                        <li key={e.lender}>{e.reason}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {!isLoading && hiddenForLiquidity > 0 && (
                <div className="flex items-center justify-between gap-2 px-1 text-[10px] text-base-content/40">
                  <span>
                    {hiddenForLiquidity} market{hiddenForLiquidity === 1 ? '' : 's'} hidden —
                    insufficient borrow liquidity for this {debt.symbol} debt.
                  </span>
                  <button
                    type="button"
                    className="shrink-0 font-medium text-primary/80 hover:text-primary"
                    onClick={() => setShowLowLiquidity((v) => !v)}
                  >
                    {showLowLiquidity ? 'Hide' : 'Show'}
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                {shownTargets.map((row) => {
                  const active =
                    selected?.marketLongUid === row.marketLongUid &&
                    selected?.marketShortUid === row.marketShortUid
                  const isLowLiq = !row.migrate.sufficientLiquidity
                  return (
                    <button
                      key={rowKey(row)}
                      type="button"
                      onClick={() => pickTarget(row)}
                      disabled={building || executingPermission || executingMain}
                      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-primary bg-primary/10 ring-1 ring-primary'
                          : 'border-base-300 bg-base-200/50 hover:bg-base-200'
                      }`}
                    >
                      <span className="flex flex-col items-start gap-0.5 min-w-0">
                        <LenderBadge
                          lenderKey={row.lenderKey}
                          name={lenderInfo[row.lenderKey]?.name}
                          logoURI={lenderInfo[row.lenderKey]?.logoURI}
                        />
                        {configTag(row) && (
                          <span
                            className="text-[9px] font-mono text-base-content/40 truncate max-w-[170px] pl-1"
                            title={`Config: ${row.marketShortUid}`}
                          >
                            {configTag(row)}
                          </span>
                        )}
                        {/* A quoted maturity is what makes a destination a
                            fixed-term loan — no lender-key sniffing needed. */}
                        {row.migrate.maturity != null && (
                          <span
                            className="badge badge-xs border-0 bg-primary/15 text-primary ml-1"
                            title={
                              row.migrate.termHeadline ??
                              `Fixed-term · matures in ~${daysUntil(row.migrate.maturity)} days`
                            }
                          >
                            Fixed · {daysUntil(row.migrate.maturity)}d
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2 shrink-0 text-xs">
                        {isLowLiq && (
                          <span
                            className="badge badge-xs border-0 bg-warning/20 text-warning"
                            title={`Borrow liquidity ($${row.migrate.borrowLiquidityUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}) is below the migrated debt — the borrow may revert.`}
                          >
                            low liq
                          </span>
                        )}
                        <span
                          className={`badge badge-xs border-0 ${riskBadgeClass(row.riskScore)}`}
                          title={riskTooltip(row.riskBreakdown)}
                        >
                          {riskLabel(row.riskScore)}
                        </span>
                        {/* Health factor, net APR and the effective rates are
                            all computed server-side for THIS position size —
                            including the real term rate on a fixed-term market,
                            where the pair feed's own borrow rate reads 0%. */}
                        {row.migrate.healthFactor != null && (
                          <span
                            className={`font-mono tabular-nums ${healthColorClass(row.migrate.healthFactor)}`}
                            title={`Resulting health factor (liq. threshold ${(row.liquidationThreshold * 100).toFixed(0)}%)`}
                          >
                            HF {fmtHealth(row.migrate.healthFactor)}
                          </span>
                        )}
                        <span
                          className="flex flex-col items-end leading-tight font-mono tabular-nums"
                          title={
                            `Deposit APR ${((row.migrate.depositApr ?? 0) * 100).toFixed(2)}% ` +
                            `(lending ${(row.depositAprLong * 100).toFixed(2)}% + intrinsic ${(row.intrinsicYieldLong * 100).toFixed(2)}%)\n` +
                            `Borrow APR ${((row.migrate.borrowApr ?? 0) * 100).toFixed(2)}% ` +
                            `(lending ${(row.borrowAprShort * 100).toFixed(2)}% + intrinsic ${(row.intrinsicYieldShort * 100).toFixed(2)}%)\n` +
                            `Net = equity-weighted earn − pay on this position`
                          }
                        >
                          <span className="text-success">
                            <span className="text-base-content/40">D</span>{' '}
                            {((row.migrate.depositApr ?? 0) * 100).toFixed(2)}%
                          </span>
                          <span className="text-base-content/60">
                            <span className="text-base-content/40">B</span>{' '}
                            {((row.migrate.borrowApr ?? 0) * 100).toFixed(2)}%
                          </span>
                          {row.migrate.netApr != null && (
                            <span
                              className={
                                row.migrate.netApr >= 0
                                  ? 'text-success font-semibold'
                                  : 'text-error font-semibold'
                              }
                            >
                              <span className="text-base-content/40">Net</span>{' '}
                              {(row.migrate.netApr * 100).toFixed(2)}%
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {building && (
              <div className="flex items-center justify-center gap-2 py-1 text-xs text-base-content/60">
                <span className="loading loading-spinner loading-xs" />
                <span>Building transaction…</span>
              </div>
            )}

            {buildError && <div className="text-error text-xs wrap-break-word">{buildError}</div>}

            {/* Resulting position summary (from the endpoint) */}
            {position && (
              <div className="rounded-lg border border-base-300 bg-base-200/50 px-2.5 py-2 space-y-1 text-xs">
                <div className="text-[10px] uppercase tracking-wide text-base-content/50">
                  New position on {lenderName(position.to?.lender)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-base-content/60">
                    {position.to?.collateral?.symbol} collateral
                  </span>
                  <span className="font-mono tabular-nums">
                    {legValue(position.to?.collateral)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-base-content/60">{position.to?.debt?.symbol} debt</span>
                  <span className="font-mono tabular-nums text-error">
                    {legValue(position.to?.debt)}
                  </span>
                </div>
                {position.netUsd != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-base-content/60">Net value</span>
                    <span className="font-mono tabular-nums font-semibold">
                      ${position.netUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      {position.leverage != null && (
                        <span className="text-base-content/40 ml-1">
                          · {position.leverage.toFixed(2)}×
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {position.apr?.deposit != null && (
                  <div className="flex items-center justify-between">
                    <span
                      className="text-base-content/60"
                      title="Collateral yield incl. intrinsic (staking) yield"
                    >
                      Deposit APR
                    </span>
                    <span className="font-mono tabular-nums text-success">
                      {(position.apr.deposit * 100).toFixed(2)}%
                    </span>
                  </div>
                )}
                {position.apr?.borrow != null && (
                  <div className="flex items-center justify-between">
                    <span
                      className="text-base-content/60"
                      title="Debt cost incl. intrinsic yield of the borrowed asset"
                    >
                      Borrow APR
                    </span>
                    <span className="font-mono tabular-nums text-base-content/80">
                      {(position.apr.borrow * 100).toFixed(2)}%
                    </span>
                  </div>
                )}
                {position.apr?.net != null && (
                  <div className="flex items-center justify-between">
                    <span
                      className="text-base-content/60"
                      title="Equity-weighted net APR (deposit earn − borrow pay)"
                    >
                      Net APR
                    </span>
                    <span
                      className={`font-mono tabular-nums font-semibold ${position.apr.net >= 0 ? 'text-success' : 'text-error'}`}
                    >
                      {(position.apr.net * 100).toFixed(2)}%
                    </span>
                  </div>
                )}
                {position.healthFactor != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-base-content/60">Health factor</span>
                    <span className="flex items-center gap-1.5 font-mono tabular-nums">
                      {source.currentHealth != null && (
                        <>
                          <span className={healthColorClass(source.currentHealth)}>
                            {fmtHealth(source.currentHealth)}
                          </span>
                          <span className="text-base-content/30">→</span>
                        </>
                      )}
                      <span className={`font-semibold ${healthColorClass(position.healthFactor)}`}>
                        {fmtHealth(position.healthFactor)}
                      </span>
                    </span>
                  </div>
                )}
                {position.collateralDust?.amountUsd != null &&
                  position.collateralDust.amountUsd > 0.01 && (
                    <div className="flex items-center justify-between text-[10px] text-base-content/40">
                      <span>Dust left on source</span>
                      <span className="font-mono tabular-nums">
                        ${position.collateralDust.amountUsd.toFixed(4)}
                      </span>
                    </div>
                  )}
              </div>
            )}

            {/* Swap quote sources (converted leg) — overview like the loop UI */}
            {position?.swap && position.swap.quotes.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-xs text-base-content/60">
                    Swap routes · converting {position.swap.leg}
                  </span>
                  <span className="text-[10px] text-base-content/40">
                    {position.swap.quotes.length} source
                    {position.swap.quotes.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                  {position.swap.quotes.map((q, i) => {
                    const isBest = q.aggregator === position.swap!.best
                    const impact = q.priceImpactUsd
                    const impactPos = impact != null && impact >= 0
                    return (
                      <div
                        key={`${q.aggregator}-${i}`}
                        className={`rounded-lg border p-1.5 text-xs ${
                          isBest
                            ? 'border-primary bg-primary/10 ring-1 ring-primary'
                            : 'border-base-300 bg-base-200/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-sm truncate">{q.aggregator}</span>
                          {isBest && (
                            <span className="text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/15 px-1 py-0.5 rounded">
                              Used
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-error font-semibold tabular-nums truncate">
                            {fmtAmt(q.amountIn)} {q.inSymbol}
                          </span>
                          <span className="text-base-content/30">→</span>
                          <span className="text-success font-semibold tabular-nums truncate">
                            {fmtAmt(q.amountOut)} {q.outSymbol}
                          </span>
                        </div>
                        {impact != null && (
                          <div className="mt-1 pt-1 border-t border-base-300/60 text-[10px] flex items-baseline gap-1">
                            <span className="text-base-content/50">Impact</span>
                            <span
                              className={`font-semibold tabular-nums ${impactPos ? 'text-success' : 'text-error'}`}
                            >
                              {impactPos ? '+' : ''}$
                              {Math.abs(impact).toLocaleString(undefined, {
                                maximumFractionDigits: 2,
                              })}
                              {q.priceImpactPct != null && (
                                <>
                                  {' '}
                                  ({impactPos ? '+' : ''}
                                  {(q.priceImpactPct * 100).toFixed(2)}%)
                                </>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Atomic path — approvals + migration in one confirmation. */}
            {result && useAtomicPath && (
              <BatchExecuteButton
                steps={[
                  ...permissions.map((p, i) => p.description || `Approval ${i + 1}`),
                  executeLabel,
                ]}
                label={executeLabel}
                executing={executingMain}
                needsUpgrade={batchNeedsUpgrade}
                onExecute={executeAll}
              />
            )}

            {/* Permissions */}
            {result && !useAtomicPath && hasPermissions && !allPermissionsDone && (
              <div className="space-y-1">
                <span className="text-xs text-base-content/60">
                  Approvals ({permissionsCompleted}/{permissions.length})
                </span>
                {permissions.map((perm, i) => {
                  const isDonePerm = i < permissionsCompleted
                  const isCurrent = i === permissionsCompleted
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`btn btn-sm w-full ${
                        isDonePerm
                          ? 'btn-disabled btn-outline btn-success'
                          : isCurrent
                            ? 'btn-warning'
                            : 'btn-outline btn-ghost'
                      }`}
                      disabled={!isCurrent || executingPermission}
                      onClick={isCurrent ? executeNextPermission : undefined}
                      title={perm.description || `Approval ${i + 1}`}
                    >
                      <span className="truncate max-w-full">
                        {isDonePerm ? (
                          `✓ ${perm.description || `Approval ${i + 1}`}`
                        ) : isCurrent && executingPermission ? (
                          <span className="loading loading-spinner loading-xs" />
                        ) : (
                          perm.description || `Approval ${i + 1}`
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {result && !useAtomicPath && allPermissionsDone && (
              <button
                type="button"
                className="btn btn-success btn-sm w-full"
                disabled={executingMain}
                onClick={executeMain}
              >
                {executingMain ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  executeLabel
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
