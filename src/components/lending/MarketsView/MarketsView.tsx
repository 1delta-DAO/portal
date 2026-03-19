import React, { useEffect, useMemo, useRef, useState } from 'react'
import { getChainName, isWNative, lenderDisplayNameFull, SupportedChainId } from '@1delta/lib-utils'
import { zeroAddress } from 'viem'
import { useFlattenedPools, type PoolEntry } from '../../../hooks/lending/useFlattenedPools'
import type { UserDataResult } from '../../../hooks/lending/useUserData'
import { useTokenBalances } from '../../../hooks/lending/useTokenBalances'
import { useTokenLists } from '../../../hooks/useTokenLists'
import { computePoolMetrics, poolEntryToPoolDataItem, type SortKey } from './helpers'
import { MarketsTable } from './MarketsTable'
import { DepositPanel } from './DepositPanel'
import { useIsMobile } from '../../../hooks/useIsMobile'

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
    .reduce((sum, p) => sum + (parseFloat(p.totalDepositsUsd) || 0) - (parseFloat(p.totalDebtUsd) || 0), 0)
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

  // Filters
  const [search, setSearch] = useState('')
  const [selectedLender, setSelectedLender] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('apr')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Pagination
  const [pageSize, setPageSize] = useState<number>(10)
  const [page, setPage] = useState<number>(1)

  // Priority filters
  const [minUtilPct, setMinUtilPct] = useState<string>('10')
  const [maxUtilPct, setMaxUtilPct] = useState<string>('90')
  const [minDepositsUsd, setMinDepositsUsd] = useState<string>(() => getDefaultMinDepositsUsd(chainId))
  const [minAprPct, setMinAprPct] = useState<string>('1')
  const [assetFilter, setAssetFilter] = useState<string>('')
  const userOverrodeMinDeposits = useRef(false)

  // Extended filters (popover)
  const [maxAprPct, setMaxAprPct] = useState<string>('')
  const [maxDepositsUsd, setMaxDepositsUsd] = useState<string>('')
  const [minDepositsNative, setMinDepositsNative] = useState<string>('')
  const [maxDepositsNative, setMaxDepositsNative] = useState<string>('')
  const [minDebtNative, setMinDebtNative] = useState<string>('')
  const [maxDebtNative, setMaxDebtNative] = useState<string>('')
  const [minLiquidityNative, setMinLiquidityNative] = useState<string>('')
  const [maxLiquidityNative, setMaxLiquidityNative] = useState<string>('')
  const [minDebtUsd, setMinDebtUsd] = useState<string>('')
  const [maxDebtUsd, setMaxDebtUsd] = useState<string>('')
  const [minLiquidityUsd, setMinLiquidityUsd] = useState<string>('')
  const [maxLiquidityUsd, setMaxLiquidityUsd] = useState<string>('')
  const [maxRiskScore, setMaxRiskScore] = useState<string>('4')
  const [showExtendedFilters, setShowExtendedFilters] = useState(false)
  const extendedRef = useRef<HTMLDivElement>(null)

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

  if (!chainId) {
    return (
      <div className="w-full max-w-6xl mx-auto p-4">
        <p className="text-sm text-base-content/70">Select a chain to view lending markets.</p>
      </div>
    )
  }

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

  // Wallet balance for the selected asset (include native when relevant)
  const selectedAssets = useMemo(() => {
    if (!selectedEntry) return []
    const addrs = [selectedEntry.underlyingAddress]
    if (selectedIsWrappedNative) addrs.push(zeroAddress)
    return addrs
  }, [selectedEntry, selectedIsWrappedNative])

  const { balances: walletBalances } = useTokenBalances({
    chainId,
    account,
    assets: selectedAssets,
  })
  const selectedWalletBal = useMemo(() => {
    if (!selectedEntry?.underlyingAddress) return null
    return walletBalances.get(selectedEntry.underlyingAddress.toLowerCase()) ?? null
  }, [selectedEntry, walletBalances])

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

    if (externalAssetFilter?.trim()) {
      const addrs = externalAssetFilter.toLowerCase().split(',').filter(Boolean)
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
    result = applyMinMax(result, minDepositsUsd, maxDepositsUsd, (p) => parseFloat(p.totalDepositsUsd) || 0)

    // Risk score
    const maxRisk = parseInt(maxRiskScore, 10)
    if (!Number.isNaN(maxRisk) && maxRisk > 0) {
      result = result.filter((p) => (p.risk?.score ?? 0) <= maxRisk)
    }

    // Native deposits
    result = applyMinMax(result, minDepositsNative, maxDepositsNative, (p) => parseFloat(p.totalDeposits) || 0)
    // Native debt
    result = applyMinMax(result, minDebtNative, maxDebtNative, (p) => parseFloat(p.totalDebt) || 0)
    // Native liquidity
    result = applyMinMax(result, minLiquidityNative, maxLiquidityNative, (p) => parseFloat(p.totalLiquidity) || 0)
    // USD debt
    result = applyMinMax(result, minDebtUsd, maxDebtUsd, (p) => parseFloat(p.totalDebtUsd) || 0)
    // USD liquidity
    result = applyMinMax(result, minLiquidityUsd, maxLiquidityUsd, (p) => parseFloat(p.totalLiquidityUsd) || 0)

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
    pools, search, selectedLender, sortKey, sortDir,
    minUtilPct, maxUtilPct, minAprPct, maxAprPct,
    minDepositsUsd, maxDepositsUsd,
    minDepositsNative, maxDepositsNative,
    minDebtNative, maxDebtNative,
    minLiquidityNative, maxLiquidityNative,
    minDebtUsd, maxDebtUsd,
    minLiquidityUsd, maxLiquidityUsd,
    maxRiskScore,
    assetFilter, externalAssetFilter,
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
    search, selectedLender, sortKey, sortDir, pageSize,
    minUtilPct, maxUtilPct, minAprPct, maxAprPct,
    minDepositsUsd, maxDepositsUsd,
    minDepositsNative, maxDepositsNative,
    minDebtNative, maxDebtNative,
    minLiquidityNative, maxLiquidityNative,
    minDebtUsd, maxDebtUsd,
    minLiquidityUsd, maxLiquidityUsd,
    maxRiskScore,
    assetFilter, externalAssetFilter, chainId,
  ])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
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

  if (loading) {
    return (
      <div className="flex justify-center items-center py-10">
        <span className="loading loading-spinner loading-lg" />
      </div>
    )
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-4 space-y-4 overflow-hidden">
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
                {lenderDisplayNameFull(l)}
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

        {/* Extended filters toggle */}
        <div className="relative flex items-end" ref={extendedRef}>
          <button
            type="button"
            className={`btn btn-xs ${showExtendedFilters ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setShowExtendedFilters((v) => !v)}
          >
            {showExtendedFilters ? 'Close' : 'Advanced'}
          </button>

          {/* Extended filters popover */}
          {showExtendedFilters && (
            <div className="absolute top-full right-0 mt-1 z-50 bg-base-200 border border-base-300 rounded-lg shadow-xl p-4 w-85 space-y-3">
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
