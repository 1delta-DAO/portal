import React, { useEffect, useMemo, useState } from 'react'
import { zeroAddress } from 'viem'
import { getChainName, isWNative } from '../../../../../lib/lib-utils'
import { useTokenBalances } from '../../../../../hooks/lending/useTokenBalances'
import { useTokenLists } from '../../../../../hooks/useTokenLists'
import { useIsMobile } from '../../../../../hooks/useIsMobile'
import { usePersistedFilters } from '../../../../../hooks/usePersistedFilters'
import {
  useUserVaults,
  useVaultsCatalog,
} from '../../../../../hooks/vaults'
import {
  VAULT_PROVIDERS,
  type VaultEntry,
  type VaultProvider,
} from '../../../../../sdk/vaults-helper'
import { VaultsTable } from './VaultsTable'
import { VaultActionPanel } from './VaultActionPanel'
import { UserVaultsTable } from './UserVaultsTable'
import { PendingWithdrawals } from './PendingWithdrawals'
import {
  PROVIDER_LABELS,
  baseApr,
  compareVaults,
  hasTvl,
  isSupplyRateMeaningful,
  tvlUsd,
  type VaultSortKey,
} from './helpers'

interface VaultsViewProps {
  chainId?: string
  account?: string
}

export const VaultsView: React.FC<VaultsViewProps> = ({ chainId, account }) => {
  const isMobile = useIsMobile()

  // ---- Filter state (persisted) ----
  const defaults = useMemo(
    () => ({
      providers: VAULT_PROVIDERS.join(','),
      minTvlUsd: '10000',
      minSupplyRatePct: '0',
      requiresTvl: true,
      sortKey: 'totalAssetsUsd' as string,
      sortDir: 'desc' as string,
      pageSize: 10,
      assetFilter: '',
    }),
    []
  )
  const { filters: f, setFilter, resetToDefaults } = usePersistedFilters(
    'vaults-view',
    defaults,
    { chainId }
  )

  const selectedProviders = useMemo<VaultProvider[]>(
    () =>
      (f.providers || '')
        .split(',')
        .map((p) => p.trim())
        .filter((p): p is VaultProvider => (VAULT_PROVIDERS as string[]).includes(p)),
    [f.providers]
  )

  const sortKey = f.sortKey as VaultSortKey
  const sortDir = f.sortDir as 'asc' | 'desc'
  const minTvlUsd = parseFloat(f.minTvlUsd)
  const minSupplyRatePct = parseFloat(f.minSupplyRatePct)
  const requiresTvl = !!f.requiresTvl
  const pageSize = f.pageSize as number
  const assetFilter = f.assetFilter

  // ---- Transient UI state ----
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<VaultEntry | null>(null)
  const [showMobileAction, setShowMobileAction] = useState(false)

  // ---- Catalog ----
  // Fetch every provider once per chain; provider selection is applied as a
  // client-side filter below so toggling it never refetches.
  const { vaults, isVaultsLoading, vaultsError } = useVaultsCatalog({ chainId })

  // Catalog map for cheap "is this vault in scope" lookups by the user-positions
  // table (which uses it to surface the Manage button).
  const catalogByVault = useMemo(() => {
    const map = new Map<string, VaultEntry>()
    for (const v of vaults) map.set(v.address.toLowerCase(), v)
    return map
  }, [vaults])

  // Only the providers actually present on this chain get a filter pill — no
  // point offering Lagoon/GMX/etc. where the catalog has none. Counts come for
  // free and make the breakdown legible. Kept in canonical VAULT_PROVIDERS order.
  const availableProviders = useMemo(() => {
    const counts = new Map<VaultProvider, number>()
    for (const v of vaults) counts.set(v.provider, (counts.get(v.provider) ?? 0) + 1)
    return VAULT_PROVIDERS.filter((p) => counts.has(p)).map((p) => ({
      provider: p,
      count: counts.get(p) ?? 0,
    }))
  }, [vaults])

  // ---- User positions ----
  const allVaultAddrs = useMemo(() => vaults.map((v) => v.address), [vaults])
  const {
    items: userVaultItems,
    byVault: userByVault,
    isLoading: isUserVaultsLoading,
    isFetching: isUserVaultsFetching,
    error: userVaultsError,
    refetch: refetchUserVaults,
  } = useUserVaults({
    chainId,
    account,
    vaults: allVaultAddrs,
  })

  const userPosition = useMemo(
    () => (selected ? userByVault.get(selected.address.toLowerCase()) ?? null : null),
    [selected, userByVault]
  )

  // ---- Chain token metadata ----
  const { data: chainTokens } = useTokenLists(chainId)
  const underlyingToken = useMemo(
    () => (selected ? chainTokens[selected.underlying.toLowerCase()] : undefined),
    [selected, chainTokens]
  )
  const selectedIsWrappedNative = useMemo(
    () => isWNative(underlyingToken),
    [underlyingToken]
  )
  const nativeToken = useMemo(
    () => (selectedIsWrappedNative ? chainTokens[zeroAddress] ?? null : null),
    [selectedIsWrappedNative, chainTokens]
  )

  // ---- Wallet balances for the underlyings the user can interact with ----
  // Fetch balances for every unique vault underlying (so selecting a row never
  // shows a loading dash longer than necessary) + zeroAddress when any vault's
  // underlying is wrapped-native.
  const hasAnyWrappedNative = useMemo(
    () => vaults.some((v) => isWNative(chainTokens[v.underlying.toLowerCase()])),
    [vaults, chainTokens]
  )
  const balanceAssets = useMemo(() => {
    const addrs = [...new Set(vaults.map((v) => v.underlying.toLowerCase()))]
    if (hasAnyWrappedNative) addrs.push(zeroAddress)
    return addrs
  }, [vaults, hasAnyWrappedNative])

  const {
    balances: walletBalances,
    isBalancesFetching,
    refetchBalances,
  } = useTokenBalances({
    chainId: chainId ?? '',
    account,
    assets: balanceAssets,
  })

  const selectedWalletBal = useMemo(() => {
    const addr = selected?.underlying.toLowerCase()
    return addr ? walletBalances.get(addr) ?? null : null
  }, [selected, walletBalances])

  const nativeBalance = useMemo(
    () => (selectedIsWrappedNative ? walletBalances.get(zeroAddress) ?? null : null),
    [selectedIsWrappedNative, walletBalances]
  )

  // ---- Provider toggle helpers ----
  const toggleProvider = (p: VaultProvider) => {
    const next = selectedProviders.includes(p)
      ? selectedProviders.filter((x) => x !== p)
      : [...selectedProviders, p]
    setFilter('providers', next.join(','))
  }

  // ---- Filtering + sorting + pagination ----
  const filtered = useMemo(() => {
    let arr = vaults

    if (selectedProviders.length > 0 && selectedProviders.length < VAULT_PROVIDERS.length) {
      const set = new Set(selectedProviders)
      arr = arr.filter((v) => set.has(v.provider))
    }

    if (requiresTvl) arr = arr.filter(hasTvl)

    if (Number.isFinite(minTvlUsd) && minTvlUsd > 0) {
      // Use the derived USD fallback so Euler Earn vaults (no totalAssetsUsd
      // from the backend) aren't always filtered out the moment a min-TVL is
      // set. Underlying decimals come from the chain token list when known.
      arr = arr.filter((v) => {
        const decimals = chainTokens[v.underlying.toLowerCase()]?.decimals ?? v.decimals
        return tvlUsd(v, decimals) >= minTvlUsd
      })
    }

    if (Number.isFinite(minSupplyRatePct) && minSupplyRatePct > 0) {
      // Skip euler-earn's always-0 rate so the filter doesn't accidentally hide
      // every Euler vault. Same accommodation the table uses to label the rate.
      arr = arr.filter(
        (v) => v.provider === 'euler-earn' || baseApr(v) >= minSupplyRatePct
      )
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      arr = arr.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.symbol.toLowerCase().includes(q) ||
          v.address.toLowerCase().includes(q) ||
          v.underlying.toLowerCase().includes(q)
      )
    }

    if (assetFilter.trim()) {
      const q = assetFilter.toLowerCase()
      arr = arr.filter(
        (v) =>
          v.underlying.toLowerCase().includes(q) ||
          (chainTokens[v.underlying.toLowerCase()]?.symbol ?? '').toLowerCase().includes(q)
      )
    }

    const sorted = [...arr].sort((a, b) => {
      // When ranking by APR, "—" rows (Euler Earn or any vault the backend
      // didn't expose a rate for) sink to the bottom regardless of direction.
      // They aren't a rank you can sort against, and otherwise their `0`
      // value lands them at one extreme or scattered through the table.
      if (sortKey === 'supplyRate') {
        const am = isSupplyRateMeaningful(a)
        const bm = isSupplyRateMeaningful(b)
        if (am !== bm) return am ? -1 : 1
      }
      const cmp = compareVaults(a, b, sortKey)
      return sortDir === 'asc' ? cmp : -cmp
    })

    return sorted
  }, [
    vaults,
    selectedProviders,
    requiresTvl,
    minTvlUsd,
    minSupplyRatePct,
    search,
    assetFilter,
    chainTokens,
    sortKey,
    sortDir,
  ])

  const totalItems = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, totalItems)
  const paged = filtered.slice(startIndex, endIndex)

  useEffect(() => {
    setPage(1)
  }, [
    chainId,
    selectedProviders.join(','),
    requiresTvl,
    minTvlUsd,
    minSupplyRatePct,
    search,
    assetFilter,
    sortKey,
    sortDir,
    pageSize,
  ])

  const toggleSort = (key: VaultSortKey) => {
    if (sortKey === key) {
      setFilter('sortDir', sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setFilter('sortKey', key)
      setFilter('sortDir', 'desc')
    }
  }

  const handleRowClick = (entry: VaultEntry) => {
    const same =
      selected && selected.address.toLowerCase() === entry.address.toLowerCase()
    if (same) {
      setSelected(null)
      setShowMobileAction(false)
    } else {
      setSelected(entry)
      setShowMobileAction(true)
    }
  }

  if (!chainId) {
    return (
      <div className="w-full p-3 sm:p-4">
        <p className="text-sm text-base-content/70">Select a chain to browse vaults.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Your Vault Positions (wallet-required) */}
      {account && (
        <UserVaultsTable
          account={account}
          items={userVaultItems}
          catalogByVault={catalogByVault}
          chainTokens={chainTokens}
          isLoading={isUserVaultsLoading}
          isFetching={isUserVaultsFetching}
          error={userVaultsError}
          refetch={refetchUserVaults}
          onRowClick={(entry) => {
            setSelected(entry)
            if (isMobile) setShowMobileAction(true)
          }}
        />
      )}

      {/* Pending async withdrawals (lst / gmx / lagoon) — request → claim. */}
      {account && (
        <PendingWithdrawals
          chainId={chainId}
          account={account}
          catalogByVault={catalogByVault}
        />
      )}

      {/* Catalog header */}
      <div className="w-full p-0 sm:p-4 space-y-3 sm:space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="text-lg font-semibold">Vaults</h2>
            <span className="text-xs text-base-content/50">{getChainName(chainId)}</span>
          </div>

          <div className="flex flex-wrap gap-2 md:justify-end">
            <input
              type="text"
              placeholder="Search vault / symbol / address"
              className="input input-bordered input-sm w-full md:w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="select select-bordered select-sm"
              value={pageSize}
              onChange={(e) => setFilter('pageSize', parseInt(e.target.value, 10))}
            >
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
            </select>
          </div>
        </div>

        {/* Provider chips + numeric filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-1.5">
            {availableProviders.map(({ provider: p, count }) => {
              const active = selectedProviders.includes(p)
              return (
                <button
                  key={p}
                  type="button"
                  className={`btn btn-xs ${active ? 'btn-primary' : 'btn-outline btn-ghost'}`}
                  onClick={() => toggleProvider(p)}
                >
                  {PROVIDER_LABELS[p]}
                  <span className="ml-1 opacity-60">{count}</span>
                </button>
              )
            })}
          </div>

          <div className="form-control">
            <label className="label py-0">
              <span className="label-text text-xs">Min TVL (USD)</span>
            </label>
            <input
              type="number"
              min={0}
              className="input input-bordered input-xs w-32"
              placeholder="e.g. 10000"
              value={f.minTvlUsd}
              onChange={(e) => setFilter('minTvlUsd', e.target.value)}
            />
          </div>

          <div className="form-control">
            <label className="label py-0">
              <span className="label-text text-xs">Min APR (%)</span>
            </label>
            <input
              type="number"
              min={0}
              className="input input-bordered input-xs w-24"
              placeholder="0"
              value={f.minSupplyRatePct}
              onChange={(e) => setFilter('minSupplyRatePct', e.target.value)}
            />
          </div>

          <div className="form-control">
            <label className="label py-0">
              <span className="label-text text-xs">Asset (addr / symbol)</span>
            </label>
            <input
              type="text"
              className="input input-bordered input-xs w-36"
              placeholder="USDC, 0x…"
              value={f.assetFilter}
              onChange={(e) => setFilter('assetFilter', e.target.value)}
            />
          </div>

          <label className="cursor-pointer flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              className="checkbox checkbox-xs"
              checked={requiresTvl}
              onChange={(e) => setFilter('requiresTvl', e.target.checked)}
            />
            Hide empty
          </label>

          <button type="button" className="btn btn-xs btn-ghost" onClick={resetToDefaults}>
            Reset
          </button>
        </div>

        {/* Status row */}
        {vaultsError && (
          <div className="alert alert-error text-xs">
            <span>Failed to load vaults: {vaultsError.message}</span>
          </div>
        )}
        {isVaultsLoading && (
          <div className="flex items-center gap-2 text-xs text-base-content/60">
            <span className="loading loading-spinner loading-xs" />
            Loading vaults…
          </div>
        )}

        {/* Table + side panel */}
        <div className="flex gap-4 items-start">
          <VaultsTable
            vaults={paged}
            chainId={chainId}
            chainTokens={chainTokens}
            sortKey={sortKey}
            sortDir={sortDir}
            onToggleSort={toggleSort}
            selected={selected}
            onRowClick={handleRowClick}
            totalItems={totalItems}
            startIndex={startIndex}
            endIndex={endIndex}
            currentPage={currentPage}
            totalPages={totalPages}
            onGoToPage={(p) => p >= 1 && p <= totalPages && setPage(p)}
          />

          {/* Desktop action panel */}
          <div className="hidden md:block">
            <VaultActionPanel
              selected={selected}
              chainId={chainId}
              account={account}
              walletBalance={selectedWalletBal}
              nativeToken={nativeToken}
              nativeBalance={nativeBalance}
              userPosition={userPosition}
              underlyingToken={underlyingToken}
              isBalancesFetching={isBalancesFetching}
              refetchBalances={refetchBalances}
            />
          </div>
        </div>

        {/* Mobile modal */}
        {isMobile && showMobileAction && selected && (
          <div className="modal modal-open" onClick={() => setShowMobileAction(false)}>
            <div className="modal-box max-w-sm" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
                onClick={() => setShowMobileAction(false)}
              >
                ✕
              </button>
              <VaultActionPanel
                selected={selected}
                chainId={chainId}
                account={account}
                walletBalance={selectedWalletBal}
                nativeToken={nativeToken}
                nativeBalance={nativeBalance}
                userPosition={userPosition}
                underlyingToken={underlyingToken}
                isBalancesFetching={isBalancesFetching}
                refetchBalances={refetchBalances}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
