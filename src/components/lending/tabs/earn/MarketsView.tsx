import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getChainName, isWNative, SupportedChainId } from '../../../../lib/lib-utils'
import { zeroAddress } from 'viem'
import { useFlattenedPoolsMultiChain } from '../../../../hooks/lending/useFlattenedPools'
import type { PoolEntry, PoolsFilters } from '../../../../sdk/lending-helper/poolTypes'
import type { UserDataResult } from '../../../../sdk/lending-helper/userPositionTypes'
import { useTokenBalances } from '../../../../hooks/lending/useTokenBalances'
import { useTokenListsMultiChain } from '../../../../hooks/useTokenLists'
import {
  computePoolMetrics,
  poolEntryToPoolDataItem,
  type PoolWithMetrics,
  type SortKey,
} from './helpers'
import { filterAndSortPools } from './poolFilters'
import { MarketsTable } from './MarketsTable'
import { DepositPanel } from './DepositPanel'
import { useIsMobile } from '../../../../hooks/useIsMobile'
import { useDebounce } from '../../../../hooks/useDebounce'
import { nextSort } from '../../../../hooks/useTableSort'
import { usePersistedFilters } from '../../../../hooks/usePersistedFilters'
import { useRiskMode } from '../../../../contexts/RiskMode'

const HIGH_LIQUIDITY_CHAINS: ReadonlySet<string> = new Set([
  SupportedChainId.PLASMA_MAINNET,
  SupportedChainId.ETHEREUM_MAINNET,
  SupportedChainId.ARBITRUM_ONE,
  SupportedChainId.BASE,
])

/**
 * Deposit floor below which markets are noise. Mirrors the backend's own
 * `minTvlUsd` default (100k on Ethereum, 25k elsewhere). Across a multi-chain
 * selection the *highest* applicable floor wins, so adding Ethereum to the
 * selection doesn't flood the table with 25k-dust markets from everywhere.
 */
function getDefaultMinDepositsUsd(chainIds: string[]): string {
  return chainIds.some((c) => HIGH_LIQUIDITY_CHAINS.has(c)) ? '100000' : '25000'
}

/** Compute TVL for a lender directly from PoolEntry[] */
function computeLenderTvlFromPools(pools: PoolEntry[], lender: string): number {
  return pools
    .filter((p) => p.lenderKey === lender)
    .reduce(
      (sum, p) => sum + (parseFloat(p.totalDepositsUsd) || 0) - (parseFloat(p.totalDebtUsd) || 0),
      0
    )
}

interface LendingPoolsTableProps {
  /** Chains to browse. One entry behaves exactly as the old single-chain view. */
  chainIds: string[]
  account?: string
  externalAssetFilter?: string
  userData?: UserDataResult
}

export const LendingPoolsTable: React.FC<LendingPoolsTableProps> = ({
  chainIds,
  account,
  externalAssetFilter,
  userData,
}) => {
  const isMobile = useIsMobile()
  const isMultiChain = chainIds.length > 1
  const primaryChainId = chainIds[0]

  // Persisted filters (survive tab switches and sessions).
  //
  // Multi-chain selections share ONE bucket rather than keying off the chain
  // set: a per-combination key would silently reset every filter the moment a
  // user added or removed a chain.
  const filterScope = useMemo(
    () => (isMultiChain ? 'multi' : primaryChainId),
    [isMultiChain, primaryChainId]
  )

  const marketsDefaults = useMemo(
    () => ({
      selectedLender: 'all',
      sortKey: 'apr' as string,
      sortDir: 'desc' as string,
      pageSize: 10,
      minUtilPct: '10',
      maxUtilPct: '90',
      minDepositsUsd: getDefaultMinDepositsUsd(chainIds),
      minAprPct: '1',
      assetFilter: '',
      maxAprPct: '',
      maxDepositsUsd: '',
      minDepositsNative: '',
      maxDepositsNative: '',
      minDebtNative: '',
      maxDebtNative: '',
      minLiquidityNative: '',
      maxLiquidityNative: '',
      minDebtUsd: '',
      maxDebtUsd: '',
      minLiquidityUsd: '',
      maxLiquidityUsd: '',
      maxRiskScore: '4',
      // Fixed-rate earn markets (Midnight / Term / Exactly) are hidden by default.
      showFixedTerm: false,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chainIds.join(',')]
  )

  const {
    filters: f,
    setFilter,
    resetToDefaults: resetFilters,
  } = usePersistedFilters('markets-view', marketsDefaults, { chains: filterScope })

  // Destructure for convenience
  const selectedLender = f.selectedLender
  const sortKey = f.sortKey as SortKey
  const sortDir = f.sortDir as 'asc' | 'desc'
  const pageSize = f.pageSize
  const minUtilPct = f.minUtilPct
  const maxUtilPct = f.maxUtilPct
  const minDepositsUsd = f.minDepositsUsd
  const minAprPct = f.minAprPct
  const assetFilter = f.assetFilter
  const maxAprPct = f.maxAprPct
  const maxDepositsUsd = f.maxDepositsUsd
  const minDepositsNative = f.minDepositsNative
  const maxDepositsNative = f.maxDepositsNative
  const minDebtNative = f.minDebtNative
  const maxDebtNative = f.maxDebtNative
  const minLiquidityNative = f.minLiquidityNative
  const maxLiquidityNative = f.maxLiquidityNative
  const minDebtUsd = f.minDebtUsd
  const maxDebtUsd = f.maxDebtUsd
  const minLiquidityUsd = f.minLiquidityUsd
  const maxLiquidityUsd = f.maxLiquidityUsd
  const maxRiskScore = f.maxRiskScore
  const showFixedTerm = !!f.showFixedTerm

  // Setters (wrap setFilter for each)
  const setSelectedLender = (v: string) => setFilter('selectedLender', v)
  const setSortKey = (v: SortKey) => setFilter('sortKey', v)
  const setSortDir = (v: 'asc' | 'desc') => setFilter('sortDir', v)
  const setPageSize = (v: number) => setFilter('pageSize', v)
  const setMinUtilPct = (v: string) => setFilter('minUtilPct', v)
  const setMaxUtilPct = (v: string) => setFilter('maxUtilPct', v)
  const setMinDepositsUsd = (v: string) => setFilter('minDepositsUsd', v)
  const setMinAprPct = (v: string) => setFilter('minAprPct', v)
  const setAssetFilter = (v: string) => setFilter('assetFilter', v)
  const setMaxAprPct = (v: string) => setFilter('maxAprPct', v)
  const setMaxDepositsUsd = (v: string) => setFilter('maxDepositsUsd', v)
  const setMinDepositsNative = (v: string) => setFilter('minDepositsNative', v)
  const setMaxDepositsNative = (v: string) => setFilter('maxDepositsNative', v)
  const setMinDebtNative = (v: string) => setFilter('minDebtNative', v)
  const setMaxDebtNative = (v: string) => setFilter('maxDebtNative', v)
  const setMinLiquidityNative = (v: string) => setFilter('minLiquidityNative', v)
  const setMaxLiquidityNative = (v: string) => setFilter('maxLiquidityNative', v)
  const setMinDebtUsd = (v: string) => setFilter('minDebtUsd', v)
  const setMaxDebtUsd = (v: string) => setFilter('maxDebtUsd', v)
  const setMinLiquidityUsd = (v: string) => setFilter('minLiquidityUsd', v)
  const setMaxLiquidityUsd = (v: string) => setFilter('maxLiquidityUsd', v)
  const setMaxRiskScore = (v: string) => setFilter('maxRiskScore', v)
  const setShowFixedTerm = (v: boolean) => setFilter('showFixedTerm', v)

  // The app-wide risk ceiling (next to the network selector). Earn may override
  // it *downwards* only — the effective max is clamped to the global cap so the
  // tab can never surface more risk than the app config allows.
  const { maxRiskScore: riskCap } = useRiskMode()
  const effectiveMaxRisk = Math.min(parseInt(maxRiskScore, 10) || riskCap, riskCap)

  // Transient UI state (not persisted)
  const [search, setSearch] = useState('')
  // The filter+sort below runs over the WHOLE pool universe (this tab pulls it
  // client-side on purpose — see the note on `serverFilters`), so re-running it
  // on every keystroke is the one input worth debouncing here. The box itself
  // stays uncontrolled-feeling because `search` still drives the value.
  const debouncedSearch = useDebounce(search, 150)
  const [page, setPage] = useState<number>(1)
  const [showExtendedFilters, setShowExtendedFilters] = useState(false)
  const [popoverAbove, setPopoverAbove] = useState(false)
  const extendedRef = useRef<HTMLDivElement>(null)
  const popoverRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const rect = node.getBoundingClientRect()
    const overflowing = rect.bottom > window.innerHeight
    if (overflowing) setPopoverAbove(true)
  }, [])
  const userOverrodeMinDeposits = useRef(false)

  // Pool selection for deposit
  const [selectedEntry, setSelectedEntry] = useState<PoolEntry | null>(null)

  // Mobile deposit modal
  const [showMobileDeposit, setShowMobileDeposit] = useState(false)

  // Deliberately NOT pushing the numeric filters below down to the API, even
  // though `/lending/pools` accepts similar-looking params — the semantics
  // don't line up and mapping them would quietly change what the tab shows:
  //
  //   - `minDepositsUsd` filters on totalDepositsUsd; the API's nearest param,
  //     `minTvlUsd`, filters on *liquidity* (deposits − debt). Mapping one to
  //     the other would hide fully-utilized markets with large deposits.
  //   - The util / APR floors here exempt deposit-only pools (`isFloorExempt`),
  //     which a server-side floor cannot express.
  //   - Every numeric filter is skipped when the user has narrowed via an
  //     external asset filter (row click / "owned only"), so that every market
  //     for those assets stays visible. A server-side filter would still apply.
  //
  // The backend's own `minTvlUsd` default (100k on Ethereum, 25k elsewhere)
  // already prunes the long tail per request, and the per-chain page budget in
  // `useFlattenedPoolsMultiChain` bounds the rest. Pushing these down properly
  // needs matching params on the API side.
  const serverFilters = useMemo<PoolsFilters>(
    () => ({
      // Opt in to fixed-rate earn markets (Midnight / Term / Exactly), hidden by default.
      includeFixedTerm: showFixedTerm,
    }),
    [showFixedTerm]
  )

  const {
    pools,
    isPoolsLoading: loading,
    isPoolsFetching: isFetchingMore,
    count: serverCount,
    failedChains,
    truncatedChains,
  } = useFlattenedPoolsMultiChain({
    chainIds,
    maxRiskScore: effectiveMaxRisk,
    enabled: chainIds.length > 0,
    filters: serverFilters,
  })

  const { data: tokensByChain } = useTokenListsMultiChain(chainIds)
  // Most consumers below only need the primary chain's list (search, the
  // deposit panel's native-token lookup); rows resolve per-chain where it
  // matters via `tokensByChain`.
  const chainTokens = useMemo(
    () => tokensByChain[primaryChainId] ?? {},
    [tokensByChain, primaryChainId]
  )

  // Convert selected PoolEntry to PoolDataItem using inline asset data
  const resolvedPool = useMemo(
    () => (selectedEntry ? poolEntryToPoolDataItem(selectedEntry) : null),
    [selectedEntry]
  )

  // Spot USD price for the selected underlying — prefer the live market price,
  // fall back to the oracle price. Forwarded to DepositPanel so the deposit
  // form can show an estimated monthly earnings figure.
  const selectedPriceUsd = useMemo(() => {
    if (!selectedEntry) return undefined
    return (
      selectedEntry.underlyingInfo?.prices?.priceUsd ||
      selectedEntry.underlyingInfo?.oraclePrice?.oraclePriceUsd ||
      undefined
    )
  }, [selectedEntry])

  // Whether the selected pool's underlying is wrapped native
  const selectedIsWrappedNative = useMemo(
    () => !!resolvedPool && isWNative(resolvedPool.asset),
    [resolvedPool]
  )

  // Mirror the lending tab (tabs/lending/index.tsx) — request balances for
  // every unique pool *asset* address (not `underlyingAddress`, which is a
  // different field on PoolEntry that doesn't always match the asset address
  // the action components later use for the lookup), plus zeroAddress when
  // any pool is wrapped-native.
  //
  // Balances are read for ONE chain — the selected pool's, falling back to the
  // primary. Requesting them for every chain in the selection would multiply
  // the call for data only the deposit panel consumes, and the panel only ever
  // shows the selected pool's asset.
  const balanceChainId = selectedEntry?.chainId ?? primaryChainId
  const poolsOnBalanceChain = useMemo(
    () => pools.filter((p) => p.chainId === balanceChainId),
    [pools, balanceChainId]
  )
  const hasWrappedNative = useMemo(
    () => poolsOnBalanceChain.some((p) => isWNative(p.underlyingInfo?.asset)),
    [poolsOnBalanceChain]
  )
  const poolAssetAddresses = useMemo(() => {
    const addrs = [
      ...new Set(
        poolsOnBalanceChain.map((p) => p.underlyingInfo?.asset?.address).filter(Boolean) as string[]
      ),
    ]
    if (hasWrappedNative) addrs.push(zeroAddress)
    return addrs
  }, [poolsOnBalanceChain, hasWrappedNative])

  const {
    balances: walletBalances,
    isBalancesFetching,
    refetchBalances,
  } = useTokenBalances({
    chainId: balanceChainId,
    account,
    assets: poolAssetAddresses,
  })

  const selectedWalletBal = useMemo(() => {
    const addr = resolvedPool?.underlying
    if (!addr) return null
    return walletBalances.get(addr.toLowerCase()) ?? null
  }, [resolvedPool, walletBalances])

  // Native token info for the selected pool
  const nativeToken = useMemo(() => {
    if (!selectedIsWrappedNative) return null
    return chainTokens[zeroAddress] ?? null
  }, [selectedIsWrappedNative, chainTokens])

  const nativeBalance = useMemo(() => {
    if (!nativeToken) return null
    return walletBalances.get(zeroAddress) ?? null
  }, [nativeToken, walletBalances])

  // Sub-accounts for the selected entry's lender (for deposit sub-account selector)
  const selectedSubAccounts = useMemo(() => {
    if (!selectedEntry || !userData?.raw) return []
    // Match the selected pool's own chain — `userData` can span the whole
    // selection, so the same lender key exists on several chains.
    const entry = userData.raw.find(
      (e) => e.chainId === selectedEntry.chainId && e.lender === selectedEntry.lenderKey
    )
    return entry?.data ?? []
  }, [selectedEntry, userData])

  // True if the user has any outstanding debt on the *selected pool's lender*
  // — debt on a different lender doesn't share collateral with this deposit,
  // so flagging it would be noise. Earn hides the health-factor projection,
  // so this badge points users to the Lending tab when they actually have a
  // position that could be impacted.
  const hasBorrowOnSelectedLender = useMemo(() => {
    if (!selectedEntry || selectedSubAccounts.length === 0) return false
    return selectedSubAccounts.some((sub) => (sub.balanceData?.debt ?? 0) > 0)
  }, [selectedEntry, selectedSubAccounts])

  // User position for the selected pool (first sub-account with a matching position)
  const selectedUserPosition = useMemo(() => {
    if (!selectedEntry || selectedSubAccounts.length === 0) return null
    for (const sub of selectedSubAccounts) {
      for (const pos of sub.positions) {
        if (typeof pos === 'object' && pos !== null && pos.marketUid === selectedEntry.marketUid) {
          return pos
        }
      }
    }
    return null
  }, [selectedEntry, selectedSubAccounts])

  const lenders = useMemo(() => {
    const keys = Array.from(new Set(pools.map((p) => p.lenderKey)))
    return keys.sort(
      (a, b) => computeLenderTvlFromPools(pools, b) - computeLenderTvlFromPools(pools, a)
    )
  }, [pools])

  // Build lender name lookup from pool lenderInfo
  const lenderNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of pools) {
      if (p.lenderInfo?.name && !map[p.lenderKey]) {
        map[p.lenderKey] = p.lenderInfo.name
      }
    }
    return map
  }, [pools])

  // Metrics are derived ONCE here, then carried through filtering, sorting and
  // rendering as {pool, metrics} pairs. Deriving them inside the comparator
  // instead cost `2·n·log n` computations per sort — and the table then
  // recomputed the same values a third time, per visible row.
  const decoratedPools = useMemo<PoolWithMetrics[]>(
    () => pools.map((pool) => ({ pool, metrics: computePoolMetrics(pool) })),
    [pools]
  )

  // Filtering + sorting. The pipeline itself is pure and lives in
  // `poolFilters.ts` — it encodes which markets a user does and does not see,
  // including several non-obvious exemptions, and is unit-tested there.
  const filteredAndSortedPools = useMemo(
    () =>
      filterAndSortPools(decoratedPools, {
        selectedLender,
        search: debouncedSearch,
        assetFilter,
        externalAssetFilter,
        effectiveMaxRisk,
        minUtilPct,
        maxUtilPct,
        minAprPct,
        maxAprPct,
        minDepositsUsd,
        maxDepositsUsd,
        minDepositsNative,
        maxDepositsNative,
        minDebtNative,
        maxDebtNative,
        minLiquidityNative,
        maxLiquidityNative,
        minDebtUsd,
        maxDebtUsd,
        minLiquidityUsd,
        maxLiquidityUsd,
        sortKey,
        sortDir,
      }),
    [
      decoratedPools,
      debouncedSearch,
      selectedLender,
      sortKey,
      sortDir,
      minUtilPct,
      maxUtilPct,
      minAprPct,
      maxAprPct,
      minDepositsUsd,
      maxDepositsUsd,
      minDepositsNative,
      maxDepositsNative,
      minDebtNative,
      maxDebtNative,
      minLiquidityNative,
      maxLiquidityNative,
      minDebtUsd,
      maxDebtUsd,
      minLiquidityUsd,
      maxLiquidityUsd,
      effectiveMaxRisk,
      assetFilter,
      externalAssetFilter,
    ]
  )

  // Close extended filters on outside click
  useEffect(() => {
    if (!showExtendedFilters) return
    const handler = (e: MouseEvent) => {
      if (extendedRef.current && !extendedRef.current.contains(e.target as Node)) {
        setShowExtendedFilters(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showExtendedFilters])

  // Pagination
  const totalItems = filteredAndSortedPools.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, totalItems)
  const paginatedPools = filteredAndSortedPools.slice(startIndex, endIndex)

  // Reset minDepositsUsd to a selection-appropriate default when the chain set
  // changes (unless the user overrode it).
  useEffect(() => {
    if (!userOverrodeMinDeposits.current) {
      setMinDepositsUsd(getDefaultMinDepositsUsd(chainIds))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainIds.join(',')])

  useEffect(() => {
    setPage(1)
  }, [
    // Debounced, so the page reset lands with the new result set rather than
    // one keystroke ahead of it.
    debouncedSearch,
    selectedLender,
    sortKey,
    sortDir,
    pageSize,
    minUtilPct,
    maxUtilPct,
    minAprPct,
    maxAprPct,
    minDepositsUsd,
    maxDepositsUsd,
    minDepositsNative,
    maxDepositsNative,
    minDebtNative,
    maxDebtNative,
    minLiquidityNative,
    maxLiquidityNative,
    minDebtUsd,
    maxDebtUsd,
    minLiquidityUsd,
    maxLiquidityUsd,
    effectiveMaxRisk,
    assetFilter,
    externalAssetFilter,
    chainIds.join(','),
  ])

  const toggleSort = (key: SortKey) => {
    const next = nextSort({ sortKey, sortDir }, key)
    setSortKey(next.sortKey)
    setSortDir(next.sortDir)
  }

  const goToPage = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return
    setPage(newPage)
  }

  const handleRowClick = (entry: PoolEntry) => {
    const isSame = selectedEntry && selectedEntry.marketUid === entry.marketUid

    if (isSame) {
      setSelectedEntry(null)
      setShowMobileDeposit(false)
    } else {
      setSelectedEntry(entry)
      setShowMobileDeposit(true)
    }
  }

  if (chainIds.length === 0) {
    return (
      <div className="w-full p-3 sm:p-4">
        <p className="text-sm text-base-content/70">Select a chain to view lending markets.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-10">
        <span className="loading loading-spinner loading-lg" />
      </div>
    )
  }

  return (
    <div className="w-full p-0 sm:p-4 space-y-3 sm:space-y-4">
      {/* Top row: title + main controls */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 className="text-lg font-semibold">Lending Markets</h2>
          <span
            className="text-xs text-base-content/50"
            title={chainIds.map(getChainName).join(', ')}
          >
            {isMultiChain ? `${chainIds.length} chains` : getChainName(primaryChainId)}
          </span>
          {failedChains.length > 0 && (
            <span
              className="text-xs text-warning"
              title={`Failed: ${failedChains.map(getChainName).join(', ')}`}
            >
              · {failedChains.length} unavailable
            </span>
          )}
          {truncatedChains.length > 0 && (
            <span
              className="text-xs text-base-content/40"
              title={`Showing a capped slice for: ${truncatedChains.map(getChainName).join(', ')}. Narrow the filters to see the rest.`}
            >
              · partial
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 md:justify-end">
          <input
            type="text"
            placeholder="Search asset / lender"
            className="input input-bordered input-sm w-full md:w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="select select-bordered select-sm"
            value={selectedLender}
            onChange={(e) => setSelectedLender(e.target.value)}
          >
            <option value="all">All lenders</option>
            {lenders.map((l) => (
              <option key={l} value={l}>
                {lenderNameMap[l] ?? l}
              </option>
            ))}
          </select>

          <select
            className="select select-bordered select-sm"
            value={pageSize}
            onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
          >
            <option value={10}>10 / page</option>
            <option value={20}>20 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
        </div>
      </div>

      {/* Priority filters row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
        <div className="form-control">
          <label className="label py-0">
            <span className="label-text text-xs">Max Util (%)</span>
          </label>
          <input
            type="number"
            min={0}
            max={100}
            className="input input-bordered input-xs"
            placeholder="90"
            value={maxUtilPct}
            onChange={(e) => setMaxUtilPct(e.target.value)}
          />
        </div>

        <div className="form-control">
          <label className="label py-0">
            <span className="label-text text-xs">Min TVL (USD)</span>
          </label>
          <input
            type="number"
            min={0}
            className="input input-bordered input-xs"
            placeholder="e.g. 100000"
            value={minDepositsUsd}
            onChange={(e) => {
              userOverrodeMinDeposits.current = true
              setMinDepositsUsd(e.target.value)
            }}
          />
        </div>

        <div className="form-control">
          <label className="label py-0">
            <span className="label-text text-xs">Min APR (%)</span>
          </label>
          <input
            type="number"
            min={0}
            className="input input-bordered input-xs"
            placeholder="1"
            value={minAprPct}
            onChange={(e) => setMinAprPct(e.target.value)}
          />
        </div>

        <div className="form-control">
          <label className="label py-0">
            <span className="label-text text-xs">Max Risk (1-{riskCap})</span>
          </label>
          <input
            type="number"
            min={1}
            max={riskCap}
            className="input input-bordered input-xs"
            placeholder={String(riskCap)}
            // Lower-only override: never allow a value above the app-wide cap.
            value={effectiveMaxRisk}
            onChange={(e) => {
              const parsed = parseInt(e.target.value, 10)
              if (Number.isNaN(parsed)) return setMaxRiskScore('')
              setMaxRiskScore(String(Math.min(Math.max(parsed, 1), riskCap)))
            }}
          />
        </div>

        {/* Reset + Extended filters toggle */}
        <div className="relative flex items-end gap-1" ref={extendedRef}>
          <button
            type="button"
            className={`btn btn-xs ${showFixedTerm ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setShowFixedTerm(!showFixedTerm)}
            title="Also list fixed-rate earn markets (Morpho Midnight order book, Term Finance repo listings, Exactly fixed pools) alongside the variable pools. They're hidden by default because their yield is fixed-term, not a variable pool rate."
          >
            {showFixedTerm ? '✓ Fixed-rate included' : 'Include fixed-rate'}
          </button>
          <button
            type="button"
            className="btn btn-xs btn-ghost text-base-content/50"
            onClick={resetFilters}
            title="Reset all filters to defaults"
          >
            Reset
          </button>
          <button
            type="button"
            className={`btn btn-xs ${showExtendedFilters ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => {
              setShowExtendedFilters((v) => {
                if (v) setPopoverAbove(false)
                return !v
              })
            }}
          >
            {showExtendedFilters ? 'Close' : 'Advanced'}
          </button>

          {/* Extended filters popover */}
          {showExtendedFilters && (
            <div
              ref={popoverRef}
              className={`absolute right-0 z-50 bg-base-200 border border-base-300 rounded-lg shadow-xl p-4 w-85 space-y-3 max-h-[80dvh] overflow-y-auto ${popoverAbove ? 'bottom-full mb-1' : 'top-full mt-1'}`}
            >
              {/* Asset filter */}
              <div className="form-control">
                <label className="label py-0">
                  <span className="label-text text-xs">Asset (addr / group)</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered input-xs"
                  placeholder="e.g. USDC, 0x..."
                  value={assetFilter}
                  onChange={(e) => setAssetFilter(e.target.value)}
                />
              </div>

              {/* Max APR */}
              <div className="form-control">
                <label className="label py-0">
                  <span className="label-text text-xs">Max APR (%)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  className="input input-bordered input-xs"
                  placeholder="no limit"
                  value={maxAprPct}
                  onChange={(e) => setMaxAprPct(e.target.value)}
                />
              </div>

              {/* Max TVL USD */}
              <div className="form-control">
                <label className="label py-0">
                  <span className="label-text text-xs">Max TVL (USD)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  className="input input-bordered input-xs"
                  placeholder="no limit"
                  value={maxDepositsUsd}
                  onChange={(e) => setMaxDepositsUsd(e.target.value)}
                />
              </div>

              {/* Min Utilization */}
              <div className="form-control">
                <label className="label py-0">
                  <span className="label-text text-xs">Min Util (%)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="input input-bordered input-xs"
                  placeholder="10"
                  value={minUtilPct}
                  onChange={(e) => setMinUtilPct(e.target.value)}
                />
              </div>

              <div className="divider my-1 text-xs">Native Units</div>

              {/* Native deposits */}
              <div className="grid grid-cols-2 gap-2">
                <div className="form-control">
                  <label className="label py-0">
                    <span className="label-text text-xs">Min Deposits</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="input input-bordered input-xs"
                    placeholder="0"
                    value={minDepositsNative}
                    onChange={(e) => setMinDepositsNative(e.target.value)}
                  />
                </div>
                <div className="form-control">
                  <label className="label py-0">
                    <span className="label-text text-xs">Max Deposits</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="input input-bordered input-xs"
                    placeholder="no limit"
                    value={maxDepositsNative}
                    onChange={(e) => setMaxDepositsNative(e.target.value)}
                  />
                </div>
              </div>

              {/* Native debt */}
              <div className="grid grid-cols-2 gap-2">
                <div className="form-control">
                  <label className="label py-0">
                    <span className="label-text text-xs">Min Debt</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="input input-bordered input-xs"
                    placeholder="0"
                    value={minDebtNative}
                    onChange={(e) => setMinDebtNative(e.target.value)}
                  />
                </div>
                <div className="form-control">
                  <label className="label py-0">
                    <span className="label-text text-xs">Max Debt</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="input input-bordered input-xs"
                    placeholder="no limit"
                    value={maxDebtNative}
                    onChange={(e) => setMaxDebtNative(e.target.value)}
                  />
                </div>
              </div>

              {/* Native liquidity */}
              <div className="grid grid-cols-2 gap-2">
                <div className="form-control">
                  <label className="label py-0">
                    <span className="label-text text-xs">Min Liquidity</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="input input-bordered input-xs"
                    placeholder="0"
                    value={minLiquidityNative}
                    onChange={(e) => setMinLiquidityNative(e.target.value)}
                  />
                </div>
                <div className="form-control">
                  <label className="label py-0">
                    <span className="label-text text-xs">Max Liquidity</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="input input-bordered input-xs"
                    placeholder="no limit"
                    value={maxLiquidityNative}
                    onChange={(e) => setMaxLiquidityNative(e.target.value)}
                  />
                </div>
              </div>

              <div className="divider my-1 text-xs">USD Filters</div>

              {/* USD debt */}
              <div className="grid grid-cols-2 gap-2">
                <div className="form-control">
                  <label className="label py-0">
                    <span className="label-text text-xs">Min Debt (USD)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="input input-bordered input-xs"
                    placeholder="0"
                    value={minDebtUsd}
                    onChange={(e) => setMinDebtUsd(e.target.value)}
                  />
                </div>
                <div className="form-control">
                  <label className="label py-0">
                    <span className="label-text text-xs">Max Debt (USD)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="input input-bordered input-xs"
                    placeholder="no limit"
                    value={maxDebtUsd}
                    onChange={(e) => setMaxDebtUsd(e.target.value)}
                  />
                </div>
              </div>

              {/* USD liquidity */}
              <div className="grid grid-cols-2 gap-2">
                <div className="form-control">
                  <label className="label py-0">
                    <span className="label-text text-xs">Min Liquidity (USD)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="input input-bordered input-xs"
                    placeholder="0"
                    value={minLiquidityUsd}
                    onChange={(e) => setMinLiquidityUsd(e.target.value)}
                  />
                </div>
                <div className="form-control">
                  <label className="label py-0">
                    <span className="label-text text-xs">Max Liquidity (USD)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="input input-bordered input-xs"
                    placeholder="no limit"
                    value={maxLiquidityUsd}
                    onChange={(e) => setMaxLiquidityUsd(e.target.value)}
                  />
                </div>
              </div>

              <div className="divider my-1 text-xs">Sorting</div>

              {/* Sort controls */}
              <div className="grid grid-cols-2 gap-2">
                <div className="form-control">
                  <label className="label py-0">
                    <span className="label-text text-xs">Sort By</span>
                  </label>
                  <select
                    className="select select-bordered select-xs"
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                  >
                    <option value="apr">Deposit APR</option>
                    <option value="borrowRate">Borrow Rate</option>
                    <option value="intrinsicYield">Intrinsic Yield</option>
                    <option value="utilization">Utilization</option>
                    <option value="totalDepositsUSD">Deposits (USD)</option>
                    <option value="totalDebtUSD">Debt (USD)</option>
                    <option value="totalLiquidityUSD">Liquidity (USD)</option>
                    <option value="totalDeposits">Deposits (native)</option>
                    <option value="totalDebt">Debt (native)</option>
                    <option value="totalLiquidity">Liquidity (native)</option>
                    <option value="riskScore">Risk Score</option>
                  </select>
                </div>
                <div className="form-control">
                  <label className="label py-0">
                    <span className="label-text text-xs">Direction</span>
                  </label>
                  <select
                    className="select select-bordered select-xs"
                    value={sortDir}
                    onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}
                  >
                    <option value="desc">Descending</option>
                    <option value="asc">Ascending</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Progressive loading indicator */}
      {isFetchingMore && (
        <div className="flex items-center gap-2 text-xs text-base-content/60">
          <span className="loading loading-spinner loading-xs" />
          Loading more markets ({pools.length} of {serverCount || '...'})
        </div>
      )}

      {/* Desktop: two-column layout; Mobile: full-width card list */}
      <div className="flex gap-4 items-start">
        <MarketsTable
          rows={paginatedPools}
          chainTokens={chainTokens}
          showChain
          sortKey={sortKey}
          sortDir={sortDir}
          onToggleSort={toggleSort}
          selectedEntry={selectedEntry}
          onRowClick={handleRowClick}
          totalItems={totalItems}
          startIndex={startIndex}
          endIndex={endIndex}
          currentPage={currentPage}
          totalPages={totalPages}
          onGoToPage={goToPage}
          isFetchingMore={isFetchingMore}
        />

        {/* Desktop action panel — hidden on mobile */}
        <div className="hidden md:block">
          <DepositPanel
            selectedEntry={selectedEntry}
            resolvedPool={resolvedPool}
            walletBalance={selectedWalletBal}
            account={account}
            chainId={selectedEntry?.chainId ?? primaryChainId}
            nativeToken={nativeToken}
            nativeBalance={nativeBalance}
            subAccounts={selectedSubAccounts}
            lenderKey={selectedEntry?.lenderKey}
            userPosition={selectedUserPosition}
            isBalancesFetching={isBalancesFetching}
            refetchBalances={refetchBalances}
            hasBorrowOnSelectedLender={hasBorrowOnSelectedLender}
            priceUsd={selectedPriceUsd}
          />
        </div>
      </div>

      {/* Mobile deposit modal */}
      {isMobile && showMobileDeposit && selectedEntry && (
        <div className="modal modal-open" onClick={() => setShowMobileDeposit(false)}>
          <div className="modal-box max-w-sm" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
              onClick={() => setShowMobileDeposit(false)}
            >
              ✕
            </button>
            <DepositPanel
              selectedEntry={selectedEntry}
              resolvedPool={resolvedPool}
              walletBalance={selectedWalletBal}
              account={account}
              chainId={selectedEntry?.chainId ?? primaryChainId}
              nativeToken={nativeToken}
              nativeBalance={nativeBalance}
              subAccounts={selectedSubAccounts}
              lenderKey={selectedEntry?.lenderKey}
              userPosition={selectedUserPosition}
              priceUsd={selectedPriceUsd}
            />
          </div>
        </div>
      )}
    </div>
  )
}
