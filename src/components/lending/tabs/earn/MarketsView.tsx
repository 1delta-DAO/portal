import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getChainName, isWNative, SupportedChainId } from '../../../../lib/lib-utils'
import { zeroAddress } from 'viem'
import { useFlattenedPools, type PoolEntry } from '../../../../hooks/lending/useFlattenedPools'
import type { UserDataResult } from '../../../../hooks/lending/useUserData'
import { useTokenBalances } from '../../../../hooks/lending/useTokenBalances'
import { useTokenLists } from '../../../../hooks/useTokenLists'
import { computePoolMetrics, poolEntryToPoolDataItem, type SortKey } from './helpers'
import { MarketsTable } from './MarketsTable'
import { DepositPanel } from './DepositPanel'
import { useIsMobile } from '../../../../hooks/useIsMobile'
import { usePersistedFilters } from '../../../../hooks/usePersistedFilters'

const HIGH_LIQUIDITY_CHAINS: ReadonlySet<string> = new Set([
  SupportedChainId.PLASMA_MAINNET,
  SupportedChainId.ETHEREUM_MAINNET,
  SupportedChainId.ARBITRUM_ONE,
  SupportedChainId.BASE,
])

function getDefaultMinDepositsUsd(chainId?: string): string {
  return chainId && HIGH_LIQUIDITY_CHAINS.has(chainId) ? '100000' : '25000'
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
  chainId?: string
  account?: string
  externalAssetFilter?: string
  userData?: UserDataResult
}

export const LendingPoolsTable: React.FC<LendingPoolsTableProps> = ({
  chainId,
  account,
  externalAssetFilter,
  userData,
}) => {
  const isMobile = useIsMobile()

  // Persisted filters (survive tab switches and sessions)
  const marketsDefaults = useMemo(
    () => ({
      selectedLender: 'all',
      sortKey: 'apr' as string,
      sortDir: 'desc' as string,
      pageSize: 10,
      minUtilPct: '10',
      maxUtilPct: '90',
      minDepositsUsd: getDefaultMinDepositsUsd(chainId),
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
    }),
    [chainId]
  )

  const {
    filters: f,
    setFilter,
    resetToDefaults: resetFilters,
  } = usePersistedFilters('markets-view', marketsDefaults, { chainId })

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

  // Transient UI state (not persisted)
  const [search, setSearch] = useState('')
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

  const {
    pools,
    isPoolsLoading: loading,
    isFetchingMore,
    count: serverCount,
  } = useFlattenedPools({
    chainId,
    maxRiskScore: parseInt(maxRiskScore, 10) || 4,
    enabled: !!chainId,
  })

  const { data: chainTokens } = useTokenLists(chainId)

  // Convert selected PoolEntry to PoolDataItem using inline asset data
  const resolvedPool = useMemo(
    () => (selectedEntry ? poolEntryToPoolDataItem(selectedEntry) : null),
    [selectedEntry]
  )

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
  const hasWrappedNative = useMemo(
    () => pools.some((p) => isWNative(p.underlyingInfo?.asset)),
    [pools]
  )
  const poolAssetAddresses = useMemo(() => {
    const addrs = [
      ...new Set(pools.map((p) => p.underlyingInfo?.asset?.address).filter(Boolean) as string[]),
    ]
    if (hasWrappedNative) addrs.push(zeroAddress)
    return addrs
  }, [pools, hasWrappedNative])

  const {
    balances: walletBalances,
    isBalancesFetching,
    refetchBalances,
  } = useTokenBalances({
    chainId: chainId ?? '',
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
    const entry = userData.raw.find(
      (e) => e.chainId === chainId && e.lender === selectedEntry.lenderKey
    )
    return entry?.data ?? []
  }, [selectedEntry, userData, chainId])

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

  // Filtering + sorting
  const filteredAndSortedPools = useMemo(() => {
    let result = pools

    if (selectedLender !== 'all') {
      result = result.filter((p) => p.lenderKey === selectedLender)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (p) =>
          (p.underlyingAddress ?? '').toLowerCase().includes(q) ||
          (p.lenderKey ?? '').toLowerCase().includes(q) ||
          (p.underlyingInfo?.asset?.assetGroup ?? '').toLowerCase().includes(q) ||
          (p.name ?? '').toLowerCase().includes(q)
      )
    }

    if (assetFilter.trim()) {
      const q = assetFilter.toLowerCase()
      result = result.filter(
        (p) =>
          (p.underlyingInfo?.asset?.assetGroup ?? '').toLowerCase().includes(q) ||
          (p.underlyingAddress ?? '').toLowerCase().includes(q)
      )
    }

    // External (parent-driven) asset whitelist — used by "Your Assets" row
    // clicks and the "Filter markets to owned assets" toggle. When this is
    // active we want the user to see *all* matching markets, so we skip the
    // numeric value-floor filters below (min APR / TVL / utilization / etc.)
    // which would otherwise hide valid pools at default thresholds. Risk
    // score is still enforced.
    const hasExternalAssetFilter = !!externalAssetFilter?.trim()
    if (hasExternalAssetFilter) {
      const addrs = externalAssetFilter!.toLowerCase().split(',').filter(Boolean)
      if (addrs.length > 0) {
        const addrSet = new Set(addrs)
        result = result.filter((p) => addrSet.has((p.underlyingAddress ?? '').toLowerCase()))
      }
    }

    // --- numeric range helpers ---
    const applyMinMax = (
      arr: PoolEntry[],
      minStr: string,
      maxStr: string,
      getValue: (p: PoolEntry) => number
    ) => {
      const min = parseFloat(minStr)
      const max = parseFloat(maxStr)
      const hasMin = !Number.isNaN(min) && min > 0
      const hasMax = !Number.isNaN(max) && max > 0
      if (!hasMin && !hasMax) return arr
      return arr.filter((p) => {
        const v = getValue(p)
        if (hasMin && v < min) return false
        if (hasMax && v > max) return false
        return true
      })
    }

    // Risk score is always enforced (safety floor) regardless of external filter.
    const maxRisk = parseInt(maxRiskScore, 10)
    if (!Number.isNaN(maxRisk)) {
      result = result.filter((p) => (p.risk?.score ?? 0) <= maxRisk)
    }

    // The remaining filters are value-floors meant to trim the universe of
    // pools when browsing freely. When the user has explicitly narrowed to
    // a set of assets via the parent (row click / "owned only" toggle), we
    // skip them so every market for those assets stays visible.
    if (!hasExternalAssetFilter) {
      // Utilization (percentage inputs)
      const minU = parseFloat(minUtilPct)
      const maxU = parseFloat(maxUtilPct)
      if (!Number.isNaN(minU) || !Number.isNaN(maxU)) {
        result = result.filter((p) => {
          const u = computePoolMetrics(p).utilization * 100
          if (!Number.isNaN(minU) && u < minU) return false
          if (!Number.isNaN(maxU) && u > maxU) return false
          return true
        })
      }

      // APR (percentage inputs)
      const minApr = parseFloat(minAprPct)
      const maxApr = parseFloat(maxAprPct)
      if (!Number.isNaN(minApr) || !Number.isNaN(maxApr)) {
        result = result.filter((p) => {
          const apr = computePoolMetrics(p).apr
          if (!Number.isNaN(minApr) && apr < minApr) return false
          if (!Number.isNaN(maxApr) && apr > maxApr) return false
          return true
        })
      }

      // TVL / Deposits USD
      result = applyMinMax(
        result,
        minDepositsUsd,
        maxDepositsUsd,
        (p) => parseFloat(p.totalDepositsUsd) || 0
      )

      // Native deposits
      result = applyMinMax(
        result,
        minDepositsNative,
        maxDepositsNative,
        (p) => parseFloat(p.totalDeposits) || 0
      )
      // Native debt
      result = applyMinMax(result, minDebtNative, maxDebtNative, (p) => parseFloat(p.totalDebt) || 0)
      // Native liquidity
      result = applyMinMax(
        result,
        minLiquidityNative,
        maxLiquidityNative,
        (p) => parseFloat(p.totalLiquidity) || 0
      )
      // USD debt
      result = applyMinMax(result, minDebtUsd, maxDebtUsd, (p) => parseFloat(p.totalDebtUsd) || 0)
      // USD liquidity
      result = applyMinMax(
        result,
        minLiquidityUsd,
        maxLiquidityUsd,
        (p) => parseFloat(p.totalLiquidityUsd) || 0
      )
    }

    // --- sorting ---
    result = [...result].sort((a, b) => {
      const metricsA = computePoolMetrics(a)
      const metricsB = computePoolMetrics(b)

      let aVal: number
      let bVal: number

      switch (sortKey) {
        case 'apr':
          aVal = metricsA.apr
          bVal = metricsB.apr
          break
        case 'borrowRate':
          aVal = metricsA.borrowApr
          bVal = metricsB.borrowApr
          break
        case 'intrinsicYield':
          aVal = metricsA.intrinsicYield
          bVal = metricsB.intrinsicYield
          break
        case 'utilization':
          aVal = metricsA.utilization
          bVal = metricsB.utilization
          break
        case 'totalDepositsUSD':
          aVal = parseFloat(a.totalDepositsUsd) || 0
          bVal = parseFloat(b.totalDepositsUsd) || 0
          break
        case 'totalDebtUSD':
          aVal = parseFloat(a.totalDebtUsd) || 0
          bVal = parseFloat(b.totalDebtUsd) || 0
          break
        case 'totalLiquidityUSD':
          aVal = parseFloat(a.totalLiquidityUsd) || 0
          bVal = parseFloat(b.totalLiquidityUsd) || 0
          break
        case 'totalDeposits':
          aVal = parseFloat(a.totalDeposits) || 0
          bVal = parseFloat(b.totalDeposits) || 0
          break
        case 'totalDebt':
          aVal = parseFloat(a.totalDebt) || 0
          bVal = parseFloat(b.totalDebt) || 0
          break
        case 'totalLiquidity':
          aVal = parseFloat(a.totalLiquidity) || 0
          bVal = parseFloat(b.totalLiquidity) || 0
          break
        case 'riskScore':
          aVal = a.risk?.score ?? 0
          bVal = b.risk?.score ?? 0
          break
        default:
          aVal = 0
          bVal = 0
      }

      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [
    pools,
    search,
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
    maxRiskScore,
    assetFilter,
    externalAssetFilter,
  ])

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

  // Reset minDepositsUsd to chain-appropriate default on chain switch (unless user overrode)
  useEffect(() => {
    if (!userOverrodeMinDeposits.current) {
      setMinDepositsUsd(getDefaultMinDepositsUsd(chainId))
    }
  }, [chainId])

  useEffect(() => {
    setPage(1)
  }, [
    search,
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
    maxRiskScore,
    assetFilter,
    externalAssetFilter,
    chainId,
  ])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
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

  if (!chainId) {
    return (
      <div className="w-full max-w-6xl mx-auto p-3 sm:p-4">
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
    <div className="w-full max-w-6xl mx-auto p-0 sm:p-4 space-y-3 sm:space-y-4">
      {/* Top row: title + main controls */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Lending Markets</h2>
          <p className="text-sm text-base-content/70">Deposit into lending pools to earn yield.</p>
          <p className="text-xs text-base-content/50 mt-1">{getChainName(chainId)}</p>
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
            <span className="label-text text-xs">Max Risk (1-5)</span>
          </label>
          <input
            type="number"
            min={1}
            max={5}
            className="input input-bordered input-xs"
            placeholder="4"
            value={maxRiskScore}
            onChange={(e) => setMaxRiskScore(e.target.value)}
          />
        </div>

        {/* Reset + Extended filters toggle */}
        <div className="relative flex items-end gap-1" ref={extendedRef}>
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
              className={`absolute right-0 z-50 bg-base-200 border border-base-300 rounded-lg shadow-xl p-4 w-85 space-y-3 max-h-[80vh] overflow-y-auto ${popoverAbove ? 'bottom-full mb-1' : 'top-full mt-1'}`}
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
          pools={paginatedPools}
          chainTokens={chainTokens}
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
            chainId={chainId}
            nativeToken={nativeToken}
            nativeBalance={nativeBalance}
            subAccounts={selectedSubAccounts}
            lenderKey={selectedEntry?.lenderKey}
            userPosition={selectedUserPosition}
            isBalancesFetching={isBalancesFetching}
            refetchBalances={refetchBalances}
            hasBorrowOnSelectedLender={hasBorrowOnSelectedLender}
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
              chainId={chainId}
              nativeToken={nativeToken}
              nativeBalance={nativeBalance}
              subAccounts={selectedSubAccounts}
              lenderKey={selectedEntry?.lenderKey}
              userPosition={selectedUserPosition}
            />
          </div>
        </div>
      )}
    </div>
  )
}
