import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import {
  useOptimizerPairs,
  type OptimizerFilters,
  type OptimizerPairRow,
  type OptimizerSortKey,
} from '../../../../hooks/lending/useOptimizerPairs'
import { useLenders } from '../../../../hooks/lending/usePoolData'
import type { LenderInfo } from '../../../../hooks/lending/useFlattenedPools'
import type { UserDataResult } from '../../../../hooks/lending/useUserData'
import { useDebounce } from '../../../../hooks/useDebounce'
import { useRiskMode } from '../../../../contexts/RiskMode'
import { TokenMultiPicker } from './TokenMultiPicker'
import { OptimizerTable, pairKey } from './OptimizerTable'
import { PairActionPanel } from './PairActionPanel'
import { UserLenderPositionsTable } from '../earn/UserPositionsTable'

const PAGE_SIZE = 25

/**
 * True below Tailwind's `lg` (1024px) — where the action panel is a modal rather
 * than a side column. We branch in JS (not just CSS `lg:hidden`) because daisyUI
 * locks page scroll whenever a `.modal.modal-open` is present in the DOM via
 * `:root:has(.modal-open)`, and `:has()` matches even a display:none element —
 * so a CSS-hidden open modal on desktop would freeze the whole page.
 */
function useIsBelowLg() {
  const query = '(max-width: 1023.98px)'
  const [below, setBelow] = useState(
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  )
  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setBelow(e.matches)
    mql.addEventListener('change', handler)
    setBelow(mql.matches)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return below
}

interface Props {
  chainId: string
  account?: string
  /**
   * User lending positions, threaded down from LenderTab (which already
   * fetches all-lender positions on the optimize tab). Feeds the ported
   * "Your lending positions" panel below.
   */
  userData?: UserDataResult
  isUserDataLoading?: boolean
  userDataError?: unknown
  refetchUserData?: () => void
}

interface UiFilters {
  minApr: string
  minLeverage: string
  minLtv: string
  maxBorrowRate: string
  /** Minimum *available* liquidity on the collateral (long) side, USD. */
  minLiquidityUsdLong: string
  /** Minimum *available* liquidity on the debt (short) side, USD. */
  minBorrowLiquidityUsd: string
  /** Max utilization on the collateral (long / supply) side. */
  maxUtilizationLong: string
  /** Max utilization on the debt (short / borrow) side. */
  maxUtilizationShort: string
  maxConfigRiskScore: string
  excludeLenders: string
  /** Property flags the collateral (long) asset must carry, e.g. ['pendle']. */
  collateralTags: string[]
  /** Property flags the debt (short) asset must carry. */
  debtTags: string[]
  /** Include pairs with an expired Pendle PT on either leg (default: excluded). */
  includeExpired: boolean
  sortBy: OptimizerSortKey
  sortDir: 'ASC' | 'DESC'
}

/** Selectable asset property flags (slugs match `assets.tags` on the backend). */
const PROPERTY_TAGS: { slug: string; label: string }[] = [
  { slug: 'eth', label: 'ETH' },
  { slug: 'btc', label: 'BTC' },
  { slug: 'native', label: 'Native' },
  { slug: 'wnative', label: 'wNative' },
  { slug: 'stablecoin', label: 'Stable' },
  { slug: 'savings', label: 'Savings' },
  { slug: 'lst', label: 'LST' },
  { slug: 'lrt', label: 'LRT' },
  { slug: 'pendle', label: 'Pendle' },
  { slug: 'rwa', label: 'RWA' },
]

// Sensible defaults: the optimizer endpoint returns a long tail of tiny
// markets where the short side has single-digit USD of borrow liquidity.
// Defaulting the size floors cuts that tail without the user having to
// discover the advanced filters. Both are user-overridable and get reset
// by the "Reset" button.
const DEFAULT_FILTERS: UiFilters = {
  minApr: '',
  minLeverage: '',
  minLtv: '',
  maxBorrowRate: '',
  minLiquidityUsdLong: '2000',
  minBorrowLiquidityUsd: '1800',
  maxUtilizationLong: '',
  maxUtilizationShort: '',
  maxConfigRiskScore: '',
  excludeLenders: '',
  // Sensible starting strategy: yield-bearing / stable collateral borrowing a
  // stablecoin. Gives useful results on first load (and after Reset) without the
  // user having to pick assets. Overridable — deselect the chips to widen.
  collateralTags: ['stablecoin', 'savings', 'pendle'],
  debtTags: ['stablecoin'],
  includeExpired: false,
  sortBy: 'aprTotal',
  sortDir: 'DESC',
}

const parseNum = (v: string): number | undefined => {
  if (!v) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

const parseCsv = (v: string): string[] | undefined => {
  if (!v) return undefined
  const parts = v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length ? parts : undefined
}

/**
 * Optional per-side amount input. Defaults to USD (works with any/empty asset
 * selection); a USD / Tokens switcher lets the user enter token units, but only
 * when exactly one asset is selected on that side (decimals are otherwise
 * ambiguous), so `canToken` gates the Tokens option.
 */
function AmountInputRow({
  label,
  usd,
  canToken,
  onUnitChange,
  value,
  onChange,
}: {
  label: string
  usd: boolean
  canToken: boolean
  onUnitChange: (unit: 'usd' | 'token') => void
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="form-control">
      <span className="text-xs font-medium text-base-content/70 mb-1 flex items-center justify-between gap-2">
        <span>{label}</span>
        {/* Unit switcher — USD is always available; Tokens needs a single asset. */}
        <span className="inline-flex shrink-0 overflow-hidden rounded-md border border-base-300 text-[10px] font-semibold uppercase tracking-wide">
          <button
            type="button"
            className={`px-2 py-0.5 transition-colors ${
              usd ? 'bg-primary/15 text-primary' : 'text-base-content/50 hover:text-base-content'
            }`}
            onClick={() => onUnitChange('usd')}
          >
            USD
          </button>
          <button
            type="button"
            disabled={!canToken}
            title={
              canToken
                ? 'Enter the amount in token units'
                : 'Select exactly one asset to use token units'
            }
            className={`px-2 py-0.5 transition-colors ${
              !usd ? 'bg-primary/15 text-primary' : 'text-base-content/50 hover:text-base-content'
            } ${!canToken ? 'cursor-not-allowed opacity-40' : ''}`}
            onClick={() => canToken && onUnitChange('token')}
          >
            Tokens
          </button>
        </span>
      </span>
      <label className="input input-bordered input-sm flex items-center gap-1">
        {usd && <span className="text-base-content/50">$</span>}
        <input
          type="number"
          className="grow"
          placeholder={usd ? '10000' : 'e.g. 10'}
          value={value}
          min={0}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </label>
  )
}

/**
 * Compact labelled numeric filter with an operator (≥ / ≤) and an optional
 * currency prefix / unit suffix. Used across the advanced-filter groups so every
 * threshold reads consistently (e.g. "≥ 2000 $", "≤ 0.95").
 */
function RangeField({
  label,
  title,
  op,
  prefix,
  suffix,
  value,
  placeholder,
  step,
  onChange,
}: {
  label: string
  title?: string
  op?: '≥' | '≤'
  prefix?: string
  suffix?: string
  value: string
  placeholder?: string
  step?: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex w-28 flex-col gap-1">
      <span
        className="truncate text-[10px] font-medium uppercase tracking-wide text-base-content/50"
        title={title ?? label}
      >
        {label}
      </span>
      <label className="input input-bordered input-sm flex items-center gap-1 pl-2 pr-2">
        {op && <span className="shrink-0 text-xs text-base-content/40">{op}</span>}
        {prefix && <span className="shrink-0 text-xs text-base-content/40">{prefix}</span>}
        <input
          type="number"
          className="grow min-w-0"
          placeholder={placeholder}
          step={step}
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && <span className="shrink-0 text-xs text-base-content/40">{suffix}</span>}
      </label>
    </div>
  )
}

/** Titled, padded section for a group of advanced filters (separated by
 *  dividers from its siblings inside the filter card). */
function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="p-3 sm:p-4">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-base-content/40">
        {title}
      </div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Persistence
//
// Filter state is scoped per chain because the collateral / debt arrays are
// chain-specific addresses — re-applying mainnet USDC to Arbitrum would
// silently produce zero results. Stored as a single JSON blob so we can add
// fields without bumping a schema.
// ---------------------------------------------------------------------------

interface PersistedOptimizerState {
  filters: UiFilters
  collaterals: string[]
  debts: string[]
  collateralAmount: string
  debtAmount: string
  /** Amount unit per side ('usd' default; 'token' only with a single asset). */
  collateralUnit: 'usd' | 'token'
  debtUnit: 'usd' | 'token'
  showAdvanced: boolean
}

const STORAGE_KEY = (chainId: string) => `optimizer:state:${chainId}`

function loadPersisted(chainId: string): Partial<PersistedOptimizerState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(chainId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed as Partial<PersistedOptimizerState>
  } catch {
    return null
  }
}

export function OptimizerTab({
  chainId,
  account,
  userData,
  isUserDataLoading,
  userDataError,
  refetchUserData,
}: Props) {
  // App-wide risk ceiling (the global "Up to low/medium/high" selector), applied
  // to the optimizer query so it surfaces exactly the risk the user opted into.
  const { maxRiskScore } = useRiskMode()
  // Below lg the action panel renders as a modal; at/above lg as a side column.
  // Branching in JS keeps a scroll-locking `.modal-open` out of the desktop DOM.
  const isBelowLg = useIsBelowLg()
  // The pair whose inline action panel (deposit-and-borrow / withdraw-and-repay
  // / loop) is open. Cleared when the user switches chains.
  const [selectedRow, setSelectedRow] = useState<OptimizerPairRow | null>(null)
  // Lazy initialisers read the persisted state for the *initial* chainId.
  // The chain-change effect below resets state to whatever's stored for the
  // new chain when the user switches chains mid-session.
  const initial = loadPersisted(chainId)
  const [filters, setFilters] = useState<UiFilters>(() => ({
    ...DEFAULT_FILTERS,
    ...(initial?.filters ?? {}),
  }))
  const [collaterals, setCollaterals] = useState<string[]>(() => initial?.collaterals ?? [])
  const [debts, setDebts] = useState<string[]>(() => initial?.debts ?? [])
  const [collateralAmount, setCollateralAmount] = useState(() => initial?.collateralAmount ?? '')
  const [debtAmount, setDebtAmount] = useState(() => initial?.debtAmount ?? '')
  const [collateralUnit, setCollateralUnit] = useState<'usd' | 'token'>(
    () => initial?.collateralUnit ?? 'usd'
  )
  const [debtUnit, setDebtUnit] = useState<'usd' | 'token'>(() => initial?.debtUnit ?? 'usd')
  const [showAdvanced, setShowAdvanced] = useState(() => initial?.showAdvanced ?? false)

  // Reload state when the user switches chains. Skip the very first render
  // (the lazy initialisers above already handled it) by tracking the last
  // chain we synced to in a ref.
  const lastChainRef = useRef(chainId)
  useEffect(() => {
    if (lastChainRef.current === chainId) return
    lastChainRef.current = chainId
    const next = loadPersisted(chainId)
    setFilters({ ...DEFAULT_FILTERS, ...(next?.filters ?? {}) })
    setCollaterals(next?.collaterals ?? [])
    setDebts(next?.debts ?? [])
    setCollateralAmount(next?.collateralAmount ?? '')
    setDebtAmount(next?.debtAmount ?? '')
    setCollateralUnit(next?.collateralUnit ?? 'usd')
    setDebtUnit(next?.debtUnit ?? 'usd')
    setShowAdvanced(next?.showAdvanced ?? false)
    setSelectedRow(null)
  }, [chainId])

  // Persist on every change for the *current* chain. Debouncing isn't
  // worth it here — the writes are tiny and infrequent (driven by user
  // input, not render loops).
  useEffect(() => {
    const state: PersistedOptimizerState = {
      filters,
      collaterals,
      debts,
      collateralAmount,
      debtAmount,
      collateralUnit,
      debtUnit,
      showAdvanced,
    }
    try {
      localStorage.setItem(STORAGE_KEY(chainId), JSON.stringify(state))
    } catch {
      /* localStorage may be disabled — ignore */
    }
  }, [
    chainId,
    filters,
    collaterals,
    debts,
    collateralAmount,
    debtAmount,
    collateralUnit,
    debtUnit,
    showAdvanced,
  ])

  // Server-side pagination. The optimizer endpoint supports `start`/`count`,
  // so we drive page navigation through query params rather than fetching
  // a huge result set and slicing client-side.
  const [page, setPage] = useState(0)

  // Lender enumeration drives the row badges (logo + display name).
  const { lenders: lenderSummaries } = useLenders(chainId)
  const lenderInfoMap = useMemo<Record<string, LenderInfo>>(() => {
    const map: Record<string, LenderInfo> = {}
    for (const s of lenderSummaries ?? []) {
      if (s.lenderInfo?.key) map[s.lenderInfo.key] = s.lenderInfo
    }
    return map
  }, [lenderSummaries])

  const set = <K extends keyof UiFilters>(k: K, v: UiFilters[K]) =>
    setFilters((prev) => ({ ...prev, [k]: v }))

  const toggleTag = (side: 'collateralTags' | 'debtTags', slug: string) =>
    setFilters((prev) => {
      const cur = prev[side]
      const next = cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]
      return { ...prev, [side]: next }
    })

  const resetAll = () => {
    setFilters(DEFAULT_FILTERS)
    setCollaterals([])
    setDebts([])
    setCollateralAmount('')
    setDebtAmount('')
    setCollateralUnit('usd')
    setDebtUnit('usd')
    setShowAdvanced(false)
  }

  // Count of advanced filters that differ from their defaults — drives the badge
  // on the "Filters" button. The size floors have non-empty defaults, so we
  // compare against DEFAULT_FILTERS rather than emptiness.
  const activeAdvancedCount = useMemo(() => {
    const keys: (keyof UiFilters)[] = [
      'minApr',
      'minLeverage',
      'minLtv',
      'maxBorrowRate',
      'maxConfigRiskScore',
      'excludeLenders',
      'includeExpired',
    ]
    return keys.reduce(
      (acc, k) => acc + (String(filters[k]) !== String(DEFAULT_FILTERS[k]) ? 1 : 0),
      0
    )
  }, [filters])

  // Property chips for a side — rendered in each picker card (default view).
  const propertyChips = (side: 'collateralTags' | 'debtTags') => (
    <div className="flex flex-wrap items-center gap-1">
      {PROPERTY_TAGS.map((t) => {
        const active = filters[side].includes(t.slug)
        return (
          <button
            key={t.slug}
            type="button"
            aria-pressed={active}
            className={`btn btn-xs ${active ? 'btn-primary' : 'btn-outline btn-ghost'}`}
            onClick={() => toggleTag(side, t.slug)}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )

  const debouncedCollateralAmount = useDebounce(collateralAmount, 300)
  const debouncedDebtAmount = useDebounce(debtAmount, 300)
  const parsedCollateralAmount = parseNum(debouncedCollateralAmount)
  const parsedDebtAmount = parseNum(debouncedDebtAmount)

  // Each side defaults to USD and can switch to token units, but only when it
  // holds *exactly one* asset (decimals are otherwise ambiguous). So the
  // effective USD flag is: USD unless the user picked Tokens AND a single asset
  // is selected. `canToken` drives whether the Tokens switch is enabled.
  const collateralCanToken = collaterals.length === 1
  const debtCanToken = debts.length === 1
  const collateralUsd = !(collateralCanToken && collateralUnit === 'token')
  const debtUsd = !(debtCanToken && debtUnit === 'token')

  // A computed column is shown once an amount is actually submitted on that
  // side: collateral amount → "Max debt", debt amount → "Min collateral".
  const showMaxDebt = parsedCollateralAmount != null
  const showMinCollateral = parsedDebtAmount != null

  // Single token-unit amount to hand off to the Lending/Loop deep link — the
  // collateral amount when it's in token units, else the debt amount.
  const handoffAmount =
    parsedCollateralAmount != null && !collateralUsd
      ? parsedCollateralAmount
      : parsedDebtAmount != null && !debtUsd
        ? parsedDebtAmount
        : undefined

  const apiFilters = useMemo<OptimizerFilters>(() => {
    const collateralAmt =
      parsedCollateralAmount != null
        ? collateralUsd
          ? { collateralAmountUsd: parsedCollateralAmount }
          : { collateralAmount: parsedCollateralAmount }
        : {}
    const debtAmt =
      parsedDebtAmount != null
        ? debtUsd
          ? { debtAmountUsd: parsedDebtAmount }
          : { debtAmount: parsedDebtAmount }
        : {}

    return {
      collaterals: collaterals.length ? collaterals : undefined,
      debts: debts.length ? debts : undefined,
      ...collateralAmt,
      ...debtAmt,
      chainId,
      excludeLenders: parseCsv(filters.excludeLenders),
      collateralTags: filters.collateralTags.length ? filters.collateralTags : undefined,
      debtTags: filters.debtTags.length ? filters.debtTags : undefined,
      includeExpired: filters.includeExpired || undefined,
      minApr: parseNum(filters.minApr),
      minLeverage: parseNum(filters.minLeverage),
      minLtv: parseNum(filters.minLtv),
      maxBorrowRate: parseNum(filters.maxBorrowRate),
      minLiquidityUsdLong: parseNum(filters.minLiquidityUsdLong),
      minBorrowLiquidityUsd: parseNum(filters.minBorrowLiquidityUsd),
      maxUtilizationLong: parseNum(filters.maxUtilizationLong),
      maxUtilizationShort: parseNum(filters.maxUtilizationShort),
      // App-wide risk ceiling (the global "Up to low/medium/high" selector).
      // The backend treats maxRiskScore as the config-risk cap; the manual
      // "Max config risk" advanced filter below overrides it when set (the
      // backend prefers maxConfigRiskScore when both are present). Without this,
      // the optimizer fell back to the backend default of 4 and hid every
      // risk-5 market (e.g. Morpho Midnight, flagged high until official launch).
      maxRiskScore,
      maxConfigRiskScore: parseNum(filters.maxConfigRiskScore),
      sortBy: filters.sortBy,
      sortDir: filters.sortDir,
      start: page * PAGE_SIZE,
      count: PAGE_SIZE,
    }
  }, [
    filters,
    collaterals,
    debts,
    chainId,
    parsedCollateralAmount,
    parsedDebtAmount,
    collateralUsd,
    debtUsd,
    maxRiskScore,
    page,
  ])

  // Reset to the first page whenever anything that changes the result set
  // changes. We deliberately leave `page` itself out of the dep array.
  useEffect(() => {
    setPage(0)
  }, [
    chainId,
    filters.minApr,
    filters.minLeverage,
    filters.minLtv,
    filters.maxBorrowRate,
    filters.minLiquidityUsdLong,
    filters.minBorrowLiquidityUsd,
    filters.maxUtilizationLong,
    filters.maxUtilizationShort,
    filters.maxConfigRiskScore,
    filters.excludeLenders,
    filters.collateralTags,
    filters.debtTags,
    filters.includeExpired,
    filters.sortBy,
    filters.sortDir,
    debouncedCollateralAmount,
    debouncedDebtAmount,
    collaterals,
    debts,
  ])

  const hasAnyAssetFilter =
    collaterals.length > 0 ||
    debts.length > 0 ||
    filters.collateralTags.length > 0 ||
    filters.debtTags.length > 0
  const { rows, total, isLoading, isFetching, error } = useOptimizerPairs(
    apiFilters,
    hasAnyAssetFilter
  )

  // Build a `TablePagination`-shaped state object so the shared
  // `<TablePagination>` chrome can render the prev/next buttons. `total`
  // is the post-WHERE total row count returned by the optimizer endpoint;
  // `rows` is just the current page slice.
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const paginationState = useMemo(
    () => ({
      page: safePage,
      totalPages,
      start: total === 0 ? 0 : safePage * PAGE_SIZE + 1,
      end: Math.min((safePage + 1) * PAGE_SIZE, total),
      hasPrev: safePage > 0,
      hasNext: safePage < totalPages - 1,
      next: () => setPage((p) => Math.min(totalPages - 1, p + 1)),
      prev: () => setPage((p) => Math.max(0, p - 1)),
    }),
    [safePage, totalPages, total]
  )

  return (
    <div className="space-y-3">
      {/* Your existing lending positions, ported from the Earn tab. Shown above
          the optimizer so current exposure is visible before opening a new
          leveraged pair. Collapsible (open by default) so it never buries the
          optimizer controls. Reuses the optimizer's own lender enumeration for
          logos/names. */}
      {account && (
        <details open className="group rounded-box border border-base-300 bg-base-100">
          <summary className="flex items-center justify-between cursor-pointer select-none list-none px-3 py-2 text-sm font-semibold">
            <span>Your lending positions</span>
            <svg
              className="w-4 h-4 shrink-0 text-base-content/40 transition-transform group-open:rotate-90"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </summary>
          <div className="border-t border-base-300">
            <UserLenderPositionsTable
              account={account}
              chainId={chainId}
              userData={userData}
              lenderInfoMap={lenderInfoMap}
              isLoading={!!isUserDataLoading}
              error={userDataError}
              refetch={refetchUserData ?? (() => {})}
              hideHeader
            />
          </div>
        </details>
      )}

      {/* Collateral → Debt pickers, each in an accented side-card with an
          optional amount. Specify one side for a directional result (collateral
          → max debt, debt → min collateral); both for the dual filter. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr]">
        <div className="space-y-2 rounded-lg border border-base-300 border-l-2 border-l-success/60 bg-base-200/20 p-3">
          <TokenMultiPicker
            chainId={chainId}
            selected={collaterals}
            onChange={setCollaterals}
            label="Collateral (supply)"
            placeholder="Add collateral… (optional)"
          />
          <div>
            <span className="text-[10px] font-medium uppercase tracking-wide text-base-content/40">
              Properties
            </span>
            <div className="mt-1">{propertyChips('collateralTags')}</div>
          </div>
          <AmountInputRow
            label="Amount (optional)"
            usd={collateralUsd}
            canToken={collateralCanToken}
            onUnitChange={setCollateralUnit}
            value={collateralAmount}
            onChange={setCollateralAmount}
          />
          <div className="flex flex-wrap gap-x-3 gap-y-2 pt-2">
            <RangeField
              label="Min liquidity"
              title="Minimum available liquidity on the collateral (supply) side, USD"
              op="≥"
              prefix="$"
              placeholder="2000"
              value={filters.minLiquidityUsdLong}
              onChange={(v) => set('minLiquidityUsdLong', v)}
            />
            <RangeField
              label="Max utilization"
              title="Max collateral-side (supply) utilization (0–1)"
              op="≤"
              step="0.01"
              placeholder="0.95"
              value={filters.maxUtilizationLong}
              onChange={(v) => set('maxUtilizationLong', v)}
            />
          </div>
        </div>
        {/* Directional arrow (desktop only) */}
        <div className="hidden items-center justify-center md:flex">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-base-300 bg-base-100 text-base-content/40">
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
        </div>
        <div className="space-y-2 rounded-lg border border-base-300 border-l-2 border-l-error/60 bg-base-200/20 p-3">
          <TokenMultiPicker
            chainId={chainId}
            selected={debts}
            onChange={setDebts}
            label="Debt (borrow)"
            placeholder="Add debt… (optional)"
          />
          <div>
            <span className="text-[10px] font-medium uppercase tracking-wide text-base-content/40">
              Properties
            </span>
            <div className="mt-1">{propertyChips('debtTags')}</div>
          </div>
          <AmountInputRow
            label="Amount (optional)"
            usd={debtUsd}
            canToken={debtCanToken}
            onUnitChange={setDebtUnit}
            value={debtAmount}
            onChange={setDebtAmount}
          />
          <div className="flex flex-wrap gap-x-3 gap-y-2 pt-2">
            <RangeField
              label="Min liquidity"
              title="Minimum available borrow liquidity on the debt (borrow) side, USD"
              op="≥"
              prefix="$"
              placeholder="1800"
              value={filters.minBorrowLiquidityUsd}
              onChange={(v) => set('minBorrowLiquidityUsd', v)}
            />
            <RangeField
              label="Max utilization"
              title="Max debt-side (borrow) utilization (0–1)"
              op="≤"
              step="0.01"
              placeholder="0.95"
              value={filters.maxUtilizationShort}
              onChange={(v) => set('maxUtilizationShort', v)}
            />
          </div>
        </div>
      </div>

      {/* Filter card: a toolbar (sort + direction, advanced toggle, reset) above
          a collapsible, divider-separated advanced panel. */}
      <div className="rounded-box border border-base-300 bg-base-100">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="hidden text-[10px] font-medium uppercase tracking-wide text-base-content/40 sm:inline">
              Sort
            </span>
            <select
              className="select select-bordered select-sm min-w-[9.5rem]"
              value={filters.sortBy}
              onChange={(e) => set('sortBy', e.target.value as OptimizerSortKey)}
            >
              <option value="aprTotal">Total APR</option>
              <option value="aprBase">Base APR (no rewards)</option>
              <option value="maxLeverage">Max leverage</option>
              <option value="ltv">LTV</option>
              <option value="depositAprLong">Deposit APR</option>
              <option value="borrowAprShort">Borrow APR</option>
              <option value="utilizationShort">Borrow utilization</option>
              <option value="borrowLiquidityUsdShort">Borrow liquidity</option>
              <option value="totalLiquidityUsdShort">Debt pool liquidity</option>
            </select>
            <button
              type="button"
              className="btn btn-sm btn-square btn-outline border-base-300"
              title={
                filters.sortDir === 'DESC'
                  ? 'Descending — click for ascending'
                  : 'Ascending — click for descending'
              }
              aria-label="Toggle sort direction"
              onClick={() => set('sortDir', filters.sortDir === 'DESC' ? 'ASC' : 'DESC')}
            >
              <svg
                className={`h-4 w-4 transition-transform ${
                  filters.sortDir === 'ASC' ? 'rotate-180' : ''
                }`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <polyline points="19 12 12 19 5 12" />
              </svg>
            </button>
          </div>

          <div className="grow" />

          <button
            type="button"
            className={`btn btn-sm gap-1.5 ${showAdvanced ? 'btn-neutral' : 'btn-ghost'}`}
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
            Filters
            {activeAdvancedCount > 0 && (
              <span className="badge badge-primary badge-xs">{activeAdvancedCount}</span>
            )}
          </button>

          <button
            type="button"
            className="btn btn-sm btn-ghost text-base-content/50"
            onClick={resetAll}
            title="Reset all optimizer filters for this chain"
          >
            Reset
          </button>
        </div>

        {/* Advanced filters — grouped & divider-separated; compact fixed-width
            fields with operator/unit affixes for clarity. */}
        {showAdvanced && (
          <div className="divide-y divide-base-300 border-t border-base-300">
            <FilterGroup title="Returns">
              <div className="flex flex-wrap gap-x-3 gap-y-2">
                <RangeField
                  label="Min APR"
                  op="≥"
                  suffix="%"
                  placeholder="0.00"
                  value={filters.minApr}
                  onChange={(v) => set('minApr', v)}
                />
                <RangeField
                  label="Min leverage"
                  op="≥"
                  suffix="×"
                  placeholder="1.0"
                  value={filters.minLeverage}
                  onChange={(v) => set('minLeverage', v)}
                />
                <RangeField
                  label="Min LTV"
                  op="≥"
                  step="0.01"
                  placeholder="0.80"
                  value={filters.minLtv}
                  onChange={(v) => set('minLtv', v)}
                />
                <RangeField
                  label="Max borrow rate"
                  op="≤"
                  suffix="%"
                  placeholder="0.00"
                  value={filters.maxBorrowRate}
                  onChange={(v) => set('maxBorrowRate', v)}
                />
              </div>
            </FilterGroup>

            <FilterGroup title="Risk & lenders">
              <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                <RangeField
                  label="Max config risk"
                  title="Max risk score allowed for the e-mode/config (lower = safer)"
                  op="≤"
                  placeholder="4"
                  value={filters.maxConfigRiskScore}
                  onChange={(v) => set('maxConfigRiskScore', v)}
                />
                <div className="flex min-w-[14rem] grow flex-col gap-1">
                  <span
                    className="text-[10px] font-medium uppercase tracking-wide text-base-content/50"
                    title="Comma-separated lender keys to exclude (prefix-expanded server-side)"
                  >
                    Exclude lenders
                  </span>
                  <input
                    type="text"
                    className="input input-bordered input-sm w-full"
                    placeholder="e.g. RADIANT_V2, MORPHO_BLUE"
                    value={filters.excludeLenders}
                    onChange={(e) => set('excludeLenders', e.target.value)}
                  />
                </div>
              </div>
              {/* Expired Pendle PTs are hidden by default; opt back in here. */}
              <label className="mt-2 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs"
                  checked={filters.includeExpired}
                  onChange={(e) => set('includeExpired', e.target.checked)}
                />
                <span
                  className="text-[10px] font-medium uppercase tracking-wide text-base-content/50"
                  title="Expired Pendle PT markets are excluded by default"
                >
                  Include expired PTs
                </span>
              </label>
            </FilterGroup>
          </div>
        )}
      </div>

      {/* Results status line */}
      <div className="flex items-center justify-between px-0.5 text-xs">
        <span className="text-base-content/60">
          {!hasAnyAssetFilter ? (
            'Pick a collateral/debt asset or property to see results'
          ) : isLoading ? (
            'Loading pairs…'
          ) : (
            <>
              <span className="font-semibold tabular-nums text-base-content">{total}</span> pairs
            </>
          )}
        </span>
        {isFetching && !isLoading && (
          <span className="loading loading-spinner loading-xs text-base-content/40" />
        )}
      </div>

      {error && <div className="alert alert-error text-sm py-2">{(error as Error).message}</div>}

      {/* Results table + a sticky action side-panel (like the lender pages) */}
      <div className="flex gap-4 items-start">
        <div className="min-w-0 flex-1">
          <OptimizerTable
            rows={rows}
            showMaxDebt={showMaxDebt}
            showMinCollateral={showMinCollateral}
            amount={handoffAmount}
            lenderInfoMap={lenderInfoMap}
            pagination={paginationState}
            totalItems={total}
            onSelectPair={setSelectedRow}
            selectedKey={selectedRow ? pairKey(selectedRow) : undefined}
          />
        </div>
        {/* Desktop (≥lg): plain normal-flow side column. Gated in JS (not CSS)
            so the modal below is NOT in the DOM here — see the modal note. */}
        {selectedRow && !isBelowLg && (
          <aside className="w-80 shrink-0 self-start">
            <PairActionPanel
              row={selectedRow}
              account={account}
              onClose={() => setSelectedRow(null)}
              lenderName={lenderInfoMap[selectedRow.lenderKey]?.name}
              lenderLogo={lenderInfoMap[selectedRow.lenderKey]?.logoURI}
            />
          </aside>
        )}
      </div>

      {/* Mobile (<lg): the same panel as a modal.
          MUST be JS-gated, not `lg:hidden`: daisyUI locks *page* scroll whenever
          a `.modal.modal-open` exists in the DOM (`:root:has(.modal-open)`), and
          `:has()` matches even a display:none element. A CSS-hidden open modal on
          desktop therefore freezes the page — so we only render it below lg. */}
      {selectedRow && isBelowLg && (
        <div className="modal modal-open" onClick={() => setSelectedRow(null)}>
          <div
            className="modal-box max-w-sm bg-transparent p-0 shadow-none max-h-[calc(100dvh_-_2rem)] overflow-y-auto overscroll-contain"
            onClick={(e) => e.stopPropagation()}
          >
            <PairActionPanel
              row={selectedRow}
              account={account}
              onClose={() => setSelectedRow(null)}
              lenderName={lenderInfoMap[selectedRow.lenderKey]?.name}
              lenderLogo={lenderInfoMap[selectedRow.lenderKey]?.logoURI}
            />
          </div>
        </div>
      )}
    </div>
  )
}
