import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useOptimizerPairs,
  type OptimizerDirection,
  type OptimizerFilters,
  type OptimizerSortKey,
} from '../../../hooks/lending/useOptimizerPairs'
import { useLenders } from '../../../hooks/lending/usePoolData'
import type { LenderInfo } from '../../../hooks/lending/useFlattenedPools'
import { useDebounce } from '../../../hooks/useDebounce'
import { TokenMultiPicker } from './TokenMultiPicker'
import { OptimizerTable } from './OptimizerTable'

const PAGE_SIZE = 25

interface Props {
  chainId: string
}

interface UiFilters {
  direction: OptimizerDirection
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
  direction: 'by-collateral',
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
  amount: string
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

export function OptimizerTab({ chainId }: Props) {
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
  const [amount, setAmount] = useState(() => initial?.amount ?? '')
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
    setAmount(next?.amount ?? '')
    setShowAdvanced(next?.showAdvanced ?? false)
  }, [chainId])

  // Persist on every change for the *current* chain. Debouncing isn't
  // worth it here — the writes are tiny and infrequent (driven by user
  // input, not render loops).
  useEffect(() => {
    const state: PersistedOptimizerState = { filters, collaterals, debts, amount, showAdvanced }
    try {
      localStorage.setItem(STORAGE_KEY(chainId), JSON.stringify(state))
    } catch {
      /* localStorage may be disabled — ignore */
    }
  }, [chainId, filters, collaterals, debts, amount, showAdvanced])

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

  const debouncedAmount = useDebounce(amount, 300)
  const parsedAmount = parseNum(debouncedAmount)

  // The new endpoint exposes both token-unit and USD amount params. Token
  // units require *exactly one* asset on that side, USD works with any
  // count. We pick automatically — single-asset selections get token-unit
  // semantics ("10 ETH"), multi-asset / empty get USD ("$10,000").
  const isByCollateral = filters.direction === 'by-collateral'
  const primarySelections = isByCollateral ? collaterals : debts
  const useUsdAmount = primarySelections.length !== 1
  const amountUnitLabel = useUsdAmount ? 'USD' : 'token units'

  const apiFilters = useMemo<OptimizerFilters>(() => {
    const collateralAmt = isByCollateral && parsedAmount != null
      ? (useUsdAmount ? { collateralAmountUsd: parsedAmount } : { collateralAmount: parsedAmount })
      : {}
    const debtAmt = !isByCollateral && parsedAmount != null
      ? (useUsdAmount ? { debtAmountUsd: parsedAmount } : { debtAmount: parsedAmount })
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
      maxConfigRiskScore: parseNum(filters.maxConfigRiskScore),
      sortBy: filters.sortBy,
      sortDir: filters.sortDir,
      start: page * PAGE_SIZE,
      count: PAGE_SIZE,
    }
  }, [filters, collaterals, debts, chainId, parsedAmount, useUsdAmount, isByCollateral, page])

  // Reset to the first page whenever anything that changes the result set
  // changes. We deliberately leave `page` itself out of the dep array.
  useEffect(() => {
    setPage(0)
  }, [
    chainId,
    filters.direction,
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
    debouncedAmount,
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

  const primaryPicker = (
    <TokenMultiPicker
      chainId={chainId}
      selected={isByCollateral ? collaterals : debts}
      onChange={isByCollateral ? setCollaterals : setDebts}
      label={isByCollateral ? 'Collateral (supply)' : 'Debt (borrow)'}
      placeholder={isByCollateral ? 'Add collateral…' : 'Add debt…'}
    />
  )
  const counterpartyPicker = (
    <TokenMultiPicker
      chainId={chainId}
      selected={isByCollateral ? debts : collaterals}
      onChange={isByCollateral ? setDebts : setCollaterals}
      label={isByCollateral ? 'Filter debts (optional)' : 'Filter collaterals (optional)'}
      placeholder="Leave empty to match any"
    />
  )

  return (
    <div className="space-y-4">
      {/* Direction toggle */}
      <div className="flex items-center gap-1 bg-base-200 rounded-lg p-1 w-fit">
        <button
          type="button"
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            isByCollateral
              ? 'bg-base-100 shadow-sm text-base-content'
              : 'text-base-content/60 hover:text-base-content'
          }`}
          onClick={() => set('direction', 'by-collateral')}
        >
          I have collateral
        </button>
        <button
          type="button"
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            !isByCollateral
              ? 'bg-base-100 shadow-sm text-base-content'
              : 'text-base-content/60 hover:text-base-content'
          }`}
          onClick={() => set('direction', 'by-debt')}
        >
          I want to borrow
        </button>
      </div>

      {/* Token pickers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {primaryPicker}
        {counterpartyPicker}
      </div>

      {/* Amount + sort */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="form-control">
          <span className="text-xs font-medium text-base-content/70 mb-1 flex items-center justify-between">
            <span>
              {isByCollateral ? 'Collateral amount' : 'Debt amount'} (optional)
            </span>
            <span
              className="text-[10px] uppercase tracking-wide text-base-content/40"
              title={
                useUsdAmount
                  ? 'Multi-asset selection — amount is in USD'
                  : 'Single-asset selection — amount is in token units'
              }
            >
              {amountUnitLabel}
            </span>
          </span>
          <label className="input input-bordered input-sm flex items-center gap-1">
            {useUsdAmount && <span className="text-base-content/50">$</span>}
            <input
              type="number"
              className="grow"
              placeholder={useUsdAmount ? '10000' : 'e.g. 10'}
              value={amount}
              min={0}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
        </label>
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
          <span className="text-xs font-medium text-base-content/70 mb-1">Direction</span>
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
              <span className="text-[10px] uppercase tracking-wide text-base-content/50">Min APR</span>
              <input
                type="number"
                className="input input-bordered input-xs"
                placeholder="0.00"
                value={filters.minApr}
                onChange={(e) => set('minApr', e.target.value)}
              />
            </label>
            <label className="form-control">
              <span className="text-[10px] uppercase tracking-wide text-base-content/50">Min leverage</span>
              <input
                type="number"
                className="input input-bordered input-xs"
                placeholder="1.0"
                value={filters.minLeverage}
                onChange={(e) => set('minLeverage', e.target.value)}
              />
            </label>
            <label className="form-control">
              <span className="text-[10px] uppercase tracking-wide text-base-content/50">Min LTV</span>
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
              <span className="text-[10px] uppercase tracking-wide text-base-content/50">Max borrow rate</span>
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
            ? `Pick at least one ${isByCollateral ? 'collateral' : 'debt'} asset to see results`
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
              setAmount('')
              setShowAdvanced(false)
            }}
            title="Reset all optimizer filters for this chain"
          >
            Reset
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error text-sm py-2">{(error as Error).message}</div>
      )}

      <OptimizerTable
        rows={rows}
        direction={filters.direction}
        hasAmount={parsedAmount != null}
        amount={parsedAmount}
        amountIsUsd={useUsdAmount}
        lenderInfoMap={lenderInfoMap}
        pagination={paginationState}
        totalItems={total}
      />
    </div>
  )
}
