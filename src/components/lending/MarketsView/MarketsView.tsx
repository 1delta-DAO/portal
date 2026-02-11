import React, { useEffect, useMemo, useState } from 'react'
import { getChainName, isWNative, lenderDisplayNameFull } from '@1delta/lib-utils'
import { zeroAddress } from 'viem'
import { useFlattenedPools, type PoolEntry } from '../../../hooks/lending/useFlattenedPools'
import type { LenderData } from '../../../hooks/lending/usePoolData'
import type { UserDataResult } from '../../../hooks/lending/useUserData'
import { useTokenBalances } from '../../../hooks/lending/useTokenBalances'
import { useTokenLists } from '../../../hooks/useTokenLists'
import { computeLenderTvl } from '../../../utils/format'
import { computePoolMetrics, resolvePoolDataItem, type SortKey } from './helpers'
import { MarketsTable } from './MarketsTable'
import { DepositPanel } from './DepositPanel'
import { useIsMobile } from '../../../hooks/useIsMobile'

interface LendingPoolsTableProps {
  chainId?: string
  lenderData?: LenderData
  account?: string
  externalAssetFilter?: string
  userData?: UserDataResult
}

export const LendingPoolsTable: React.FC<LendingPoolsTableProps> = ({
  chainId,
  lenderData,
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
  const [pageSize, setPageSize] = useState<number>(5)
  const [page, setPage] = useState<number>(1)

  // Extra filters
  const [maxUtilPct, setMaxUtilPct] = useState<string>('90')
  const [minDepositsUsd, setMinDepositsUsd] = useState<string>('10000')
  const [minAprPct, setMinAprPct] = useState<string>('1')
  const [assetFilter, setAssetFilter] = useState<string>('')

  // Pool selection for deposit
  const [selectedEntry, setSelectedEntry] = useState<PoolEntry | null>(null)

  // Mobile deposit modal
  const [showMobileDeposit, setShowMobileDeposit] = useState(false)

  const { pools, isPoolsLoading: loading } = useFlattenedPools({
    chainId,
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

  // Resolve selected PoolEntry -> PoolDataItem via lenderData
  const resolvedPool = useMemo(
    () => (selectedEntry ? resolvePoolDataItem(selectedEntry, lenderData) : null),
    [selectedEntry, lenderData]
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
    if (!selectedEntry) return null
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
    if (!resolvedPool || selectedSubAccounts.length === 0) return null
    for (const sub of selectedSubAccounts) {
      for (const pos of sub.positions) {
        if (typeof pos === 'object' && pos !== null && pos.marketUid === resolvedPool.marketUid) {
          return pos
        }
      }
    }
    return null
  }, [resolvedPool, selectedSubAccounts])

  const lenders = useMemo(() => {
    const keys = Array.from(new Set(pools.map((p) => p.lenderKey)))
    return keys.sort(
      (a, b) => computeLenderTvl(lenderData?.[b] ?? []) - computeLenderTvl(lenderData?.[a] ?? [])
    )
  }, [pools, lenderData])

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
          p.underlyingAddress.toLowerCase().includes(q) ||
          p.lenderKey.toLowerCase().includes(q) ||
          p.assetGroup.toLowerCase().includes(q)
      )
    }

    if (assetFilter.trim()) {
      const q = assetFilter.toLowerCase()
      result = result.filter(
        (p) =>
          p.assetGroup.toLowerCase().includes(q) || p.underlyingAddress.toLowerCase().includes(q)
      )
    }

    if (externalAssetFilter?.trim()) {
      const addrs = externalAssetFilter.toLowerCase().split(',').filter(Boolean)
      if (addrs.length > 0) {
        const addrSet = new Set(addrs)
        result = result.filter((p) => addrSet.has(p.underlyingAddress.toLowerCase()))
      }
    }

    const maxUtil = parseFloat(maxUtilPct)
    if (!Number.isNaN(maxUtil)) {
      result = result.filter((p) => {
        const { utilization } = computePoolMetrics(p)
        return utilization * 100 <= maxUtil
      })
    }

    const minDeps = parseFloat(minDepositsUsd)
    if (!Number.isNaN(minDeps)) {
      result = result.filter((p) => (parseFloat(p.totalDepositsUsd) || 0) >= minDeps)
    }

    const minApr = parseFloat(minAprPct)
    if (!Number.isNaN(minApr)) {
      result = result.filter((p) => {
        const { apr } = computePoolMetrics(p)
        return apr >= minApr
      })
    }

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
        case 'utilization':
          aVal = metricsA.utilization
          bVal = metricsB.utilization
          break
        case 'totalDepositsUSD':
          aVal = parseFloat(a.totalDepositsUsd) || 0
          bVal = parseFloat(b.totalDepositsUsd) || 0
          break
        case 'totalLiquidityUSD':
          aVal = parseFloat(a.totalLiquidityUsd) || 0
          bVal = parseFloat(b.totalLiquidityUsd) || 0
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
    maxUtilPct,
    minDepositsUsd,
    minAprPct,
    assetFilter,
    externalAssetFilter,
  ])

  // Pagination
  const totalItems = filteredAndSortedPools.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, totalItems)
  const paginatedPools = filteredAndSortedPools.slice(startIndex, endIndex)

  useEffect(() => {
    setPage(1)
  }, [
    search,
    selectedLender,
    sortKey,
    sortDir,
    pageSize,
    maxUtilPct,
    minDepositsUsd,
    minAprPct,
    assetFilter,
    externalAssetFilter,
    chainId,
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
    const isSame =
      selectedEntry &&
      selectedEntry.lenderKey === entry.lenderKey &&
      selectedEntry.underlyingAddress === entry.underlyingAddress

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

  const showDepositPanel = !!lenderData

  return (
    <div className="w-full max-w-6xl mx-auto p-4 space-y-4 overflow-hidden">
      {/* Top row: title + main controls */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Lending Markets</h2>
          <p className="text-sm text-base-content/70">
            Flattened view of pools enriched with APR, utilization and exposure.
          </p>
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
            <option value={5}>5 / page</option>
            <option value={20}>20 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
        </div>
      </div>

      {/* Numeric + asset filters row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
        <div className="form-control">
          <label className="label py-0">
            <span className="label-text text-xs">Max Util (%)</span>
          </label>
          <input
            type="number"
            min={0}
            max={100}
            className="input input-bordered input-xs"
            placeholder="e.g. 60"
            value={maxUtilPct}
            onChange={(e) => setMaxUtilPct(e.target.value)}
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
            placeholder="e.g. 5"
            value={minAprPct}
            onChange={(e) => setMinAprPct(e.target.value)}
          />
        </div>

        <div className="form-control">
          <label className="label py-0">
            <span className="label-text text-xs">Min Deposits (USD)</span>
          </label>
          <input
            type="number"
            min={0}
            className="input input-bordered input-xs"
            placeholder="e.g. 100000"
            value={minDepositsUsd}
            onChange={(e) => setMinDepositsUsd(e.target.value)}
          />
        </div>

        <div className="form-control">
          <label className="label py-0">
            <span className="label-text text-xs">Asset (addr / symbol)</span>
          </label>
          <input
            type="text"
            className="input input-bordered input-xs"
            placeholder="e.g. USDC, 0x..."
            value={assetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
          />
        </div>
      </div>

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
        />

        {/* Desktop action panel — hidden on mobile */}
        {showDepositPanel && (
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
        )}
      </div>

      {/* Mobile deposit modal */}
      {isMobile && showMobileDeposit && selectedEntry && showDepositPanel && (
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
