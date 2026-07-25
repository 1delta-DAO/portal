import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useOptimizerPairs,
  type OptimizerFilters,
  type OptimizerPairRow,
  type OptimizerSortKey,
} from '../../../../hooks/lending/useOptimizerPairs'
import { useLenders } from '../../../../hooks/lending/usePoolData'
import type { LenderInfo } from '../../../../hooks/lending/useFlattenedPools'
import { useDebounce } from '../../../../hooks/useDebounce'
import { useRiskMode } from '../../../../contexts/RiskMode'
import { TokenMultiPicker } from './TokenMultiPicker'
import { OptimizerTable, pairKey } from './OptimizerTable'
import { PairActionPanel } from './PairActionPanel'

const PAGE_SIZE = 25

interface Props {
  chainId: string
  account?: string
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
  maxUtilizationShort: string
  maxConfigRiskScore: string
  excludeLenders: string
  sortBy: OptimizerSortKey
  sortDir: 'ASC' | 'DESC'
}

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
  maxUtilizationShort: '',
  maxConfigRiskScore: '',
  excludeLenders: '',
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
 * Optional per-side amount input. The unit follows the side's selection:
 * exactly one asset → token units, otherwise USD (works with any/empty count).
 */
function AmountInputRow({
  label,
  usd,
  value,
  onChange,
}: {
  label: string
  usd: boolean
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="form-control">
      <span className="text-xs font-medium text-base-content/70 mb-1 flex items-center justify-between">
        <span>{label}</span>
        <span
          className="text-[10px] uppercase tracking-wide text-base-content/40"
          title={
            usd
              ? 'Multi-asset (or empty) selection — amount is in USD'
              : 'Single-asset selection — amount is in token units'
          }
        >
          {usd ? 'USD' : 'token units'}
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

export function OptimizerTab({ chainId, account }: Props) {
  // App-wide risk ceiling (the global "Up to low/medium/high" selector), applied
  // to the optimizer query so it surfaces exactly the risk the user opted into.
  const { maxRiskScore } = useRiskMode()
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
      showAdvanced,
    }
    try {
      localStorage.setItem(STORAGE_KEY(chainId), JSON.stringify(state))
    } catch {
      /* localStorage may be disabled — ignore */
    }
  }, [chainId, filters, collaterals, debts, collateralAmount, debtAmount, showAdvanced])

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

  const debouncedCollateralAmount = useDebounce(collateralAmount, 300)
  const debouncedDebtAmount = useDebounce(debtAmount, 300)
  const parsedCollateralAmount = parseNum(debouncedCollateralAmount)
  const parsedDebtAmount = parseNum(debouncedDebtAmount)

  // Each side picks its amount unit independently. Token-unit amounts require
  // *exactly one* asset on that side (decimals are otherwise ambiguous); USD
  // works with any count. Single-asset → token units ("10 ETH"), multi-asset /
  // empty → USD ("$10,000").
  const collateralUsd = collaterals.length !== 1
  const debtUsd = debts.length !== 1

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
      minApr: parseNum(filters.minApr),
      minLeverage: parseNum(filters.minLeverage),
      minLtv: parseNum(filters.minLtv),
      maxBorrowRate: parseNum(filters.maxBorrowRate),
      minLiquidityUsdLong: parseNum(filters.minLiquidityUsdLong),
      minBorrowLiquidityUsd: parseNum(filters.minBorrowLiquidityUsd),
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
    filters.maxUtilizationShort,
    filters.maxConfigRiskScore,
    filters.excludeLenders,
    filters.sortBy,
    filters.sortDir,
    debouncedCollateralAmount,
    debouncedDebtAmount,
    collaterals,
    debts,
  ])

  const hasAnyAssetFilter = collaterals.length > 0 || debts.length > 0
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
    <div className="space-y-4">
      {/* Collateral + Debt pickers, each with an optional amount. Specify one
          side to get its directional result (collateral → max debt, debt →
          min collateral); specify both to get both, over the dual filter. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <TokenMultiPicker
            chainId={chainId}
            selected={collaterals}
            onChange={setCollaterals}
            label="Collateral (supply)"
            placeholder="Add collateral… (optional)"
          />
          <AmountInputRow
            label="Collateral amount (optional)"
            usd={collateralUsd}
            value={collateralAmount}
            onChange={setCollateralAmount}
          />
        </div>
        <div className="space-y-2">
          <TokenMultiPicker
            chainId={chainId}
            selected={debts}
            onChange={setDebts}
            label="Debt (borrow)"
            placeholder="Add debt… (optional)"
          />
          <AmountInputRow
            label="Debt amount (optional)"
            usd={debtUsd}
            value={debtAmount}
            onChange={setDebtAmount}
          />
        </div>
      </div>

      {/* Sort */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="form-control">
          <span className="text-xs font-medium text-base-content/70 mb-1">Sort by</span>
          <select
            className="select select-bordered select-sm"
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
            <option value="borrowLiquidityShort">Borrow liquidity</option>
            <option value="totalLiquidityUsdShort">Debt pool liquidity</option>
          </select>
        </label>
        <label className="form-control">
          <span className="text-xs font-medium text-base-content/70 mb-1">Order</span>
          <select
            className="select select-bordered select-sm"
            value={filters.sortDir}
            onChange={(e) => set('sortDir', e.target.value as 'ASC' | 'DESC')}
          >
            <option value="DESC">Descending</option>
            <option value="ASC">Ascending</option>
          </select>
        </label>
      </div>

      {/* Advanced filters */}
      <div>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? '− Hide' : '+ Advanced'} filters
        </button>
        {showAdvanced && (
          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
            <label className="form-control">
              <span className="text-[10px] uppercase tracking-wide text-base-content/50">
                Min APR
              </span>
              <input
                type="number"
                className="input input-bordered input-xs"
                placeholder="0.00"
                value={filters.minApr}
                onChange={(e) => set('minApr', e.target.value)}
              />
            </label>
            <label className="form-control">
              <span className="text-[10px] uppercase tracking-wide text-base-content/50">
                Min leverage
              </span>
              <input
                type="number"
                className="input input-bordered input-xs"
                placeholder="1.0"
                value={filters.minLeverage}
                onChange={(e) => set('minLeverage', e.target.value)}
              />
            </label>
            <label className="form-control">
              <span className="text-[10px] uppercase tracking-wide text-base-content/50">
                Min LTV
              </span>
              <input
                type="number"
                step="0.01"
                className="input input-bordered input-xs"
                placeholder="0.00"
                value={filters.minLtv}
                onChange={(e) => set('minLtv', e.target.value)}
              />
            </label>
            <label className="form-control">
              <span className="text-[10px] uppercase tracking-wide text-base-content/50">
                Max borrow rate
              </span>
              <input
                type="number"
                className="input input-bordered input-xs"
                placeholder="0.00"
                value={filters.maxBorrowRate}
                onChange={(e) => set('maxBorrowRate', e.target.value)}
              />
            </label>
            <label className="form-control">
              <span
                className="text-[10px] uppercase tracking-wide text-base-content/50"
                title="Minimum available liquidity on the collateral (long) side, USD"
              >
                Min collateral liq. USD
              </span>
              <input
                type="number"
                className="input input-bordered input-xs"
                placeholder="2000"
                value={filters.minLiquidityUsdLong}
                onChange={(e) => set('minLiquidityUsdLong', e.target.value)}
              />
            </label>
            <label className="form-control">
              <span
                className="text-[10px] uppercase tracking-wide text-base-content/50"
                title="Minimum available liquidity on the debt (short) side, USD"
              >
                Min borrow liq. USD
              </span>
              <input
                type="number"
                className="input input-bordered input-xs"
                placeholder="1800"
                value={filters.minBorrowLiquidityUsd}
                onChange={(e) => set('minBorrowLiquidityUsd', e.target.value)}
              />
            </label>
            <label className="form-control">
              <span
                className="text-[10px] uppercase tracking-wide text-base-content/50"
                title="Max debt-side utilization (0–1)"
              >
                Max util. (short)
              </span>
              <input
                type="number"
                step="0.01"
                className="input input-bordered input-xs"
                placeholder="0.95"
                value={filters.maxUtilizationShort}
                onChange={(e) => set('maxUtilizationShort', e.target.value)}
              />
            </label>
            <label className="form-control">
              <span
                className="text-[10px] uppercase tracking-wide text-base-content/50"
                title="Max risk score allowed for the e-mode/config (lower = safer)"
              >
                Max config risk
              </span>
              <input
                type="number"
                className="input input-bordered input-xs"
                placeholder="4"
                value={filters.maxConfigRiskScore}
                onChange={(e) => set('maxConfigRiskScore', e.target.value)}
              />
            </label>
            <label className="form-control col-span-2 md:col-span-2">
              <span
                className="text-[10px] uppercase tracking-wide text-base-content/50"
                title="Comma-separated lender keys to exclude (prefix-expanded server-side)"
              >
                Exclude lenders
              </span>
              <input
                type="text"
                className="input input-bordered input-xs"
                placeholder="e.g. RADIANT_V2, MORPHO_BLUE"
                value={filters.excludeLenders}
                onChange={(e) => set('excludeLenders', e.target.value)}
              />
            </label>
          </div>
        )}
      </div>

      {/* Status line */}
      <div className="flex items-center justify-between text-xs text-base-content/60">
        <span>
          {!hasAnyAssetFilter
            ? 'Pick at least one collateral or debt asset to see results'
            : isLoading
              ? 'Loading pairs…'
              : `${total} pairs`}
        </span>
        <div className="flex items-center gap-2">
          {isFetching && !isLoading && <span className="loading loading-spinner loading-xs" />}
          <button
            type="button"
            className="btn btn-ghost btn-xs text-base-content/50"
            onClick={() => {
              setFilters(DEFAULT_FILTERS)
              setCollaterals([])
              setDebts([])
              setCollateralAmount('')
              setDebtAmount('')
              setShowAdvanced(false)
            }}
            title="Reset all optimizer filters for this chain"
          >
            Reset
          </button>
        </div>
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
        {selectedRow && (
          <aside className="hidden lg:block w-80 shrink-0 sticky top-4">
            <PairActionPanel
              row={selectedRow}
              account={account}
              onClose={() => setSelectedRow(null)}
            />
          </aside>
        )}
      </div>

      {/* Mobile: the same panel as a modal */}
      {selectedRow && (
        <div className="lg:hidden modal modal-open" onClick={() => setSelectedRow(null)}>
          <div
            className="modal-box max-w-sm bg-transparent p-0 shadow-none"
            onClick={(e) => e.stopPropagation()}
          >
            <PairActionPanel
              row={selectedRow}
              account={account}
              onClose={() => setSelectedRow(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
