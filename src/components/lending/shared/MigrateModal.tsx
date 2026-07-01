import React, { useMemo, useState } from 'react'
import { parseUnits } from 'viem'
import { useSendLendingTransaction } from '../../../hooks/useSendLendingTransaction'
import {
  useOptimizerPairs,
  type OptimizerPairRow,
  type OptimizerAssetRef,
} from '../../../hooks/lending/useOptimizerPairs'
import { useLenders } from '../../../hooks/lending/usePoolData'
import {
  fetchMigrate,
  type MigrateResult,
  type MigratePositionResult,
} from '../../../sdk/lending-helper/fetchMigrate'
import { LenderBadge } from './LenderBadge'
import { Logo } from '../../common/Logo'

// Canonical wrapped-native ERC20 per chain. Used only to find WBNB-style targets
// when migrating a NATIVE debt (the on-behalf borrow can't be delegated for the
// native asset, so the target must be the wrapped form). Keyed by chainId string.
const NATIVE_SENTINEL = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

const WRAPPED_NATIVE_BY_CHAIN: Record<string, string> = {
  '1': '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
  '10': '0x4200000000000000000000000000000000000006', // WETH (Optimism)
  '56': '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', // WBNB
  '137': '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', // WPOL/WMATIC
  '8453': '0x4200000000000000000000000000000000000006', // WETH (Base)
  '42161': '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH (Arbitrum)
  '43114': '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7', // WAVAX
}

/**
 * Show a leg's USD value when a price is available, else fall back to the token
 * AMOUNT (so a leg never renders as "—" just because its price feed is missing —
 * e.g. WMON on Monad has an amount but no USD price).
 */
function legValue(leg?: { amount?: string; amountUsd?: number; decimals?: number; symbol?: string }): string {
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

/** True for the native-asset sentinel addresses (0x0…0 / 0xEee…EEeE). */
function isNativeSentinel(addr: string): boolean {
  const a = addr.toLowerCase()
  return (
    a === '0x0000000000000000000000000000000000000000' ||
    a === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
  )
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
  /** Oracle USD prices from the source position — fallback when the server feed
   *  lacks a token (e.g. WMON on Monad), so the result still shows USD/net/HF. */
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
 * Opens from a position in `YourPositions`. We fetch the *qualifying target
 * pairs* — optimizer pairs on the same chain with the same collateral and debt
 * underlyings — and let the user pick one. Picking + confirming builds the
 * flash-loan-backed migrate bundle server-side (`fetchMigrate`) and executes
 * its permissions then transactions. Works at any LTV; the source repay is
 * sized with a small buffer so the full collateral withdrawal can't revert.
 */
export const MigrateModal: React.FC<MigrateModalProps> = ({ source, onClose }) => {
  const { account, chainId, accountId, collateral, debt } = source

  // Human-readable lender names + logos (same source the optimizer table uses),
  // so we show "Aave V3" / "Neverland" instead of raw keys like AAVE_V3.
  const { lenders: lenderSummaries } = useLenders(chainId, true, 100)
  const lenderInfo = useMemo(() => {
    const map: Record<string, { name?: string; logoURI?: string }> = {}
    for (const s of lenderSummaries ?? []) {
      if (s.lenderInfo?.key) map[s.lenderInfo.key] = s.lenderInfo
    }
    return map
  }, [lenderSummaries])
  const lenderName = (key?: string) => (key ? (lenderInfo[key]?.name ?? key) : '')

  // Native ↔ wrapped-native are interchangeable across lenders: some markets use
  // the native sentinel (e.g. Fluid ETH vaults), others the wrapped ERC20 (Aave
  // WETH). So when the position's asset is EITHER form, search for BOTH so markets
  // on either side surface — the builder bridges them by wrapping/unwrapping.
  const wrappedNative = WRAPPED_NATIVE_BY_CHAIN[chainId]?.toLowerCase()
  const withNativeCounterpart = (addr: string): string[] => {
    const a = addr.toLowerCase()
    if (isNativeSentinel(a) && wrappedNative) return [addr, wrappedNative]
    if (wrappedNative && a === wrappedNative) return [addr, NATIVE_SENTINEL]
    return [addr]
  }
  const collateralSearch = withNativeCounterpart(collateral.address)
  const debtSearch = withNativeCounterpart(debt.address)

  // Exact-address match against a search list — the optimizer's asset filter can
  // group/partial-match, so we re-filter client-side to the intended addresses.
  const matchesAsset = (addr: string | undefined, list: string[]) =>
    !!addr && list.some((s) => s.toLowerCase() === addr.toLowerCase())

  // ── Optional asset CONVERSION (swap leg) ──────────────────────────────────
  // The migrate can convert ONE leg via an aggregator swap. The user toggles it
  // on, picks WHICH leg (collateral or debt) to convert, then a target asset. The
  // target-asset options are OPTIMIZER-DERIVED: assets that actually have
  // qualifying markets for the fixed (non-converted) leg — so every choice yields
  // results. The chosen target asset then drives the main search for that leg.
  const [swapEnabled, setSwapEnabled] = useState(false)
  const [swapLeg, setSwapLeg] = useState<'collateral' | 'debt'>('collateral')
  const [swapTarget, setSwapTarget] = useState<string | null>(null)

  // Derive the pickable target assets: query the optimizer with only the FIXED
  // (non-converted) leg constrained, then collect the distinct assets on the
  // converted side (excluding the source asset — that's the no-swap case).
  const { rows: swapOptionRows } = useOptimizerPairs(
    {
      chainId,
      collaterals: swapLeg === 'debt' ? collateralSearch : undefined,
      debts: swapLeg === 'collateral' ? debtSearch : undefined,
      sortBy: 'aprTotal',
      sortDir: 'DESC',
      count: 100,
      maxRiskScore: 100,
    },
    swapEnabled,
  )
  const swapAssetOptions = useMemo(() => {
    const sourceAddr = (swapLeg === 'collateral' ? collateral.address : debt.address).toLowerCase()
    // The FIXED (non-converted) leg must match the source asset exactly, so we
    // only collect target assets from markets that actually pair with the source.
    const fixedList = swapLeg === 'collateral' ? debtSearch : collateralSearch
    const seen = new Map<string, OptimizerAssetRef>()
    for (const r of swapOptionRows) {
      const fixedAddr = swapLeg === 'collateral' ? r.debt.address : r.collateral.address
      if (!matchesAsset(fixedAddr, fixedList)) continue
      const a = swapLeg === 'collateral' ? r.collateral : r.debt
      const addr = a.address?.toLowerCase()
      if (addr && addr !== sourceAddr && !seen.has(addr)) seen.set(addr, a)
    }
    return [...seen.values()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapOptionRows, swapLeg, collateral.address, debt.address, chainId])

  const swapTargetAsset = swapAssetOptions.find(
    (a) => a.address.toLowerCase() === swapTarget?.toLowerCase(),
  )

  // The converted leg searches by the picked target asset; the fixed leg keeps
  // its native-aware search. No swap (or no target picked yet) → same-asset.
  const activeCollateralSearch =
    swapEnabled && swapLeg === 'collateral' && swapTarget ? [swapTarget] : collateralSearch
  const activeDebtSearch =
    swapEnabled && swapLeg === 'debt' && swapTarget ? [swapTarget] : debtSearch

  // Qualifying targets: same collateral + same debt underlying, best APR first.
  // Migration moves an EXISTING position, so we don't apply the optimizer's
  // default risk cap (which hides whole chains, e.g. Polygon, whose chain/config
  // dimensions score "high") — we surface every target and show its risk score
  // instead so the user can judge it.
  const { rows, isLoading, error: pairsError } = useOptimizerPairs({
    chainId,
    collaterals: activeCollateralSearch,
    debts: activeDebtSearch,
    sortBy: 'aprTotal',
    sortDir: 'DESC',
    count: 25,
    maxRiskScore: 100,
  })

  // Drop the source pair itself (no-op) and lenders that can't be a migration
  // TARGET. Euler V2 / Dolomite are detectable by key; non-Venus Compound V2
  // can't be classified client-side, so the build returns a clear UNSUPPORTED
  // error for those. (All of these are still valid as a SOURCE.)
  const isUnsupportedTarget = (key: string) => {
    const k = key.toUpperCase()
    return k.startsWith('EULER') || k.startsWith('DOLOMITE')
  }
  // Re-filter client-side to EXACTLY the intended assets: the source (native ⇄
  // wrapped forms) on the fixed leg, and the picked target on the converted leg.
  // Then drop targets whose debt market can't supply the borrow: a migrate must
  // borrow the whole debt on the target, so a market with less available borrow
  // liquidity than the migrated debt would revert. `borrowLiquidityShort` is the
  // available borrow liquidity in USD (falls back to the debt pool liquidity).
  // Rows with UNKNOWN (0) liquidity are kept — we don't over-hide on data gaps.
  const { targets, lowLiquidity } = useMemo(() => {
    const requiredBorrowUsd = (debt.amount ?? 0) * (source.debtPriceUsd ?? 0)
    const base = rows.filter(
      (r) =>
        !(
          r.marketLongUid === collateral.marketUid &&
          r.marketShortUid === debt.marketUid
        ) &&
        !!r.marketLongUid &&
        !!r.marketShortUid &&
        !isUnsupportedTarget(r.lenderKey) &&
        matchesAsset(r.collateral.address, activeCollateralSearch) &&
        matchesAsset(r.debt.address, activeDebtSearch),
    )
    if (requiredBorrowUsd <= 0) return { targets: base, lowLiquidity: [] as OptimizerPairRow[] }
    const targets: OptimizerPairRow[] = []
    const lowLiquidity: OptimizerPairRow[] = []
    for (const r of base) {
      const liq = r.borrowLiquidityShort || r.totalLiquidityUsdShort
      if (liq > 0 && liq < requiredBorrowUsd) lowLiquidity.push(r)
      else targets.push(r)
    }
    return { targets, lowLiquidity }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, collateral.marketUid, debt.marketUid, swapEnabled, swapLeg, swapTarget, collateral.address, debt.address, chainId, debt.amount, source.debtPriceUsd])
  const hiddenForLiquidity = lowLiquidity.length
  const [showLowLiquidity, setShowLowLiquidity] = useState(false)
  const lowLiquiditySet = useMemo(
    () => new Set(lowLiquidity.map((r) => `${r.marketLongUid}|${r.marketShortUid}`)),
    [lowLiquidity],
  )
  const rowKey = (r: OptimizerPairRow) => `${r.marketLongUid}|${r.marketShortUid}`
  // The low-liquidity markets are appended only when the user opts to reveal them.
  const shownTargets = showLowLiquidity ? [...targets, ...lowLiquidity] : targets

  // Per-market lenders (Euler vaults, Morpho markets, Aave e-modes) offer several
  // configs for the same asset pair, so one lender name appears on multiple rows.
  // Tag those rows with which config they are — for Euler the controller (debt)
  // vault, which lives in the debt market's uid.
  const lenderCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of targets) c[r.lenderKey] = (c[r.lenderKey] ?? 0) + 1
    return c
  }, [targets])
  const configTag = (row: OptimizerPairRow): string | undefined => {
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

  // Resulting position value (same for every target — a migrate preserves the
  // collateral & debt value; only the target's liquidation threshold differs),
  // used to preview each target's health factor before the user picks one.
  const collateralUsd = (source.collateral.amount ?? 0) * (source.collateralPriceUsd ?? 0)
  const debtUsd = (debt.amount ?? 0) * (source.debtPriceUsd ?? 0)
  const targetHealth = (row: OptimizerPairRow): number | null => {
    if (debtUsd <= 0 || collateralUsd <= 0 || row.liquidationThreshold <= 0) return null
    return (collateralUsd * row.liquidationThreshold) / debtUsd
  }
  // Net position APR for THIS migrated position (not the optimizer's max-leverage
  // `aprTotal`): the equity-weighted earn-minus-pay using EFFECTIVE rates (lending
  // rate + intrinsic/staking yield). net = (depEff·col − borEff·debt) / equity.
  const targetNetApr = (row: OptimizerPairRow): number | null => {
    const equityUsd = collateralUsd - debtUsd
    if (equityUsd <= 0) return row.depositAprEffective - row.borrowAprEffective
    return (
      (row.depositAprEffective * collateralUsd - row.borrowAprEffective * debtUsd) / equityUsd
    )
  }

  const [selected, setSelected] = useState<OptimizerPairRow | null>(null)

  const [result, setResult] = useState<MigrateResult['data'] | null>(null)
  const [position, setPosition] = useState<MigratePositionResult | null>(null)
  const [building, setBuilding] = useState(false)
  const [buildError, setBuildError] = useState<string | null>(null)
  const [permissionsCompleted, setPermissionsCompleted] = useState(0)
  const [executingPermission, setExecutingPermission] = useState(false)
  const [executingMain, setExecutingMain] = useState(false)
  const [done, setDone] = useState<{ hash?: string } | null>(null)

  const { send } = useSendLendingTransaction({ chainId, account })

  const permissions = result?.permissions ?? []
  const hasPermissions = permissions.length > 0
  const allPermissionsDone = !hasPermissions || permissionsCompleted >= permissions.length

  // Debt to migrate, in wei. The backend buffers above this, so rounding the
  // float token amount up to full precision is safe.
  const debtAmountWei = useMemo(() => {
    try {
      return parseUnits(
        debt.amount.toFixed(debt.decimals) as `${number}`,
        debt.decimals,
      ).toString()
    } catch {
      return null
    }
  }, [debt.amount, debt.decimals])

  const pickTarget = async (row: OptimizerPairRow) => {
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
      // Pass the EFFECTIVE rates (lending + intrinsic/staking yield) + liquidation
      // threshold so the endpoint's resulting net APR respects intrinsic yields.
      depositApr: row.depositAprEffective,
      borrowApr: row.borrowAprEffective,
      liqThreshold: row.liquidationThreshold,
      // TARGET-leg price/decimals — the swap target's for a converted leg, else
      // the source's. Pins the result USD conversion (the worker token list can
      // carry a wrong decimals for a target token, e.g. a Spark/Morpho market, and
      // mis-scale the display USD). For a swapped leg the worker uses the trade's
      // actual output/input amount valued at THIS target price.
      collateralPriceUsd:
        swapEnabled && swapLeg === 'collateral' && swapTargetAsset
          ? swapTargetAsset.priceUsd
          : source.collateralPriceUsd,
      debtPriceUsd:
        swapEnabled && swapLeg === 'debt' && swapTargetAsset
          ? swapTargetAsset.priceUsd
          : source.debtPriceUsd,
      collateralDecimals:
        swapEnabled && swapLeg === 'collateral' && swapTargetAsset
          ? swapTargetAsset.decimals
          : collateral.decimals,
      debtDecimals:
        swapEnabled && swapLeg === 'debt' && swapTargetAsset
          ? swapTargetAsset.decimals
          : debt.decimals,
      sourceDebtDecimals: debt.decimals,
      // Swap-leg slippage (only used server-side when a leg is converted).
      slippage: swapEnabled && swapTarget ? 0.005 : undefined,
      // Display hint so the result shows the collateral for non-Aave sources
      // (where the worker can't read the deposited amount).
      collateralAmountHint:
        source.collateral.amount != null && collateral.decimals != null
          ? (() => {
              try {
                return parseUnits(
                  source.collateral.amount.toFixed(collateral.decimals) as `${number}`,
                  collateral.decimals,
                ).toString()
              } catch {
                return undefined
              }
            })()
          : undefined,
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
                <span className="text-xs text-base-content/70">Convert an asset (swap one leg)</span>
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
                        {leg === 'collateral' ? `Collateral (${collateral.symbol})` : `Debt (${debt.symbol})`}
                      </button>
                    ))}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-base-content/50 px-0.5">
                    Convert {swapLeg} to
                  </div>
                  {swapAssetOptions.length === 0 ? (
                    <span className="text-[10px] text-base-content/40 px-0.5">
                      No convertible {swapLeg} assets pair with your {swapLeg === 'collateral' ? debt.symbol : collateral.symbol}.
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
                              isSel ? 'bg-primary/15 ring-1 ring-primary ring-inset' : 'hover:bg-base-200'
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
                                <span className="text-[10px] text-base-content/50 truncate" title={a.name}>
                                  {a.name}
                                </span>
                              )}
                            </div>
                            {a.priceUsd != null && a.priceUsd > 0 && (
                              <span className="shrink-0 text-[10px] text-base-content/50 font-mono tabular-nums">
                                ${a.priceUsd.toLocaleString(undefined, { maximumFractionDigits: a.priceUsd < 1 ? 4 : 2 })}
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
                Migrate to {swapEnabled && swapLeg === 'collateral' && swapTargetAsset ? swapTargetAsset.symbol : collateral.symbol} /{' '}
                {swapEnabled && swapLeg === 'debt' && swapTargetAsset ? swapTargetAsset.symbol : debt.symbol} on
              </span>

              {isLoading && (
                <div className="flex items-center justify-center gap-2 py-3 text-xs text-base-content/60">
                  <span className="loading loading-spinner loading-xs" />
                  <span>Finding markets…</span>
                </div>
              )}

              {pairsError && (
                <div className="text-[11px] text-error px-1">
                  {(pairsError as Error)?.message ?? 'Failed to load markets'}
                </div>
              )}

              {!isLoading && shownTargets.length === 0 && (
                <div className="text-[11px] text-base-content/50 px-1">
                  {rows.length === 0
                    ? // The optimizer returned nothing for the whole chain — almost
                      // always a coverage gap (e.g. Polygon isn't indexed yet) rather
                      // than a missing pair.
                      'No migration targets are indexed for this chain yet.'
                    : hiddenForLiquidity > 0
                      ? `No target market has enough borrow liquidity for this ${debt.symbol} debt (${hiddenForLiquidity} hidden with insufficient liquidity).`
                      : `No other market offers this ${collateral.symbol}/${debt.symbol} pair.`}
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
                  const isLowLiq = lowLiquiditySet.has(rowKey(row))
                  return (
                    <button
                      key={`${row.lenderKey}-${row.marketLongUid}-${row.marketShortUid}`}
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
                      </span>
                      <span className="flex items-center gap-2 shrink-0 text-xs">
                        {isLowLiq && (
                          <span
                            className="badge badge-xs border-0 bg-warning/20 text-warning"
                            title={`Borrow liquidity ($${(row.borrowLiquidityShort || row.totalLiquidityUsdShort).toLocaleString(undefined, { maximumFractionDigits: 0 })}) is below the migrated debt — the borrow may revert.`}
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
                        {targetHealth(row) != null && (
                          <span
                            className={`font-mono tabular-nums ${healthColorClass(targetHealth(row)!)}`}
                            title={`Resulting health factor (liq. threshold ${(row.liquidationThreshold * 100).toFixed(0)}%)`}
                          >
                            HF {fmtHealth(targetHealth(row)!)}
                          </span>
                        )}
                        <span
                          className="flex flex-col items-end leading-tight font-mono tabular-nums"
                          title={
                            `Deposit APR ${(row.depositAprEffective * 100).toFixed(2)}% ` +
                            `(lending ${(row.depositAprLong * 100).toFixed(2)}% + intrinsic ${(row.intrinsicYieldLong * 100).toFixed(2)}%)\n` +
                            `Borrow APR ${(row.borrowAprEffective * 100).toFixed(2)}% ` +
                            `(lending ${(row.borrowAprShort * 100).toFixed(2)}% + intrinsic ${(row.intrinsicYieldShort * 100).toFixed(2)}%)\n` +
                            `Net = equity-weighted earn − pay on this position`
                          }
                        >
                          <span className="text-success">
                            <span className="text-base-content/40">D</span>{' '}
                            {(row.depositAprEffective * 100).toFixed(2)}%
                          </span>
                          <span className="text-base-content/60">
                            <span className="text-base-content/40">B</span>{' '}
                            {(row.borrowAprEffective * 100).toFixed(2)}%
                          </span>
                          {targetNetApr(row) != null && (
                            <span
                              className={
                                targetNetApr(row)! >= 0 ? 'text-success font-semibold' : 'text-error font-semibold'
                              }
                            >
                              <span className="text-base-content/40">Net</span>{' '}
                              {(targetNetApr(row)! * 100).toFixed(2)}%
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
                    <span className="text-base-content/60" title="Collateral yield incl. intrinsic (staking) yield">
                      Deposit APR
                    </span>
                    <span className="font-mono tabular-nums text-success">
                      {(position.apr.deposit * 100).toFixed(2)}%
                    </span>
                  </div>
                )}
                {position.apr?.borrow != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-base-content/60" title="Debt cost incl. intrinsic yield of the borrowed asset">
                      Borrow APR
                    </span>
                    <span className="font-mono tabular-nums text-base-content/80">
                      {(position.apr.borrow * 100).toFixed(2)}%
                    </span>
                  </div>
                )}
                {position.apr?.net != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-base-content/60" title="Equity-weighted net APR (deposit earn − borrow pay)">
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
                              {impactPos ? '+' : ''}${Math.abs(impact).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              {q.priceImpactPct != null && (
                                <> ({impactPos ? '+' : ''}{(q.priceImpactPct * 100).toFixed(2)}%)</>
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

            {/* Permissions */}
            {result && hasPermissions && !allPermissionsDone && (
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

            {result && allPermissionsDone && (
              <button
                type="button"
                className="btn btn-success btn-sm w-full"
                disabled={executingMain}
                onClick={executeMain}
              >
                {executingMain ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  `Migrate to ${lenderName(selected?.lenderKey) || 'target'}`
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
