// src/components/lending/LendingPoolSelectionModal.tsx
import React, { useMemo, useState } from 'react'
import { List } from 'react-window'
import type { RawCurrency } from '../../types/currency'
import { FlattenedPoolWithUserData } from '../../hooks/lending/prepareMixedData'
import { ValuePill } from './Pill'

interface LendingPoolSelectionModalProps {
  open: boolean
  onClose: () => void
  pools: FlattenedPoolWithUserData[]
  onSelect: (pool: FlattenedPoolWithUserData) => void
}

const renderAsset = (asset: RawCurrency) => {
  const symbol = asset?.symbol ?? (asset as any)?.ticker ?? ''
  const name = asset?.name ?? (asset as any)?.label ?? symbol
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="avatar placeholder">
        <div className="bg-base-300 text-base-content rounded-full w-8 h-8 flex items-center justify-center overflow-hidden">
          {asset.logoURI && <img src={asset.logoURI} alt={symbol} width={24} height={24} className="token-logo" />}
        </div>
      </div>
      <div className="flex flex-col min-w-0">
        <span className="font-medium text-sm truncate">{symbol || name}</span>
        {name && symbol && name !== symbol && (
          <span className="text-[10px] text-base-content/60 truncate">{name}</span>
        )}
      </div>
    </div>
  )
}

/* ---------- User position badges ---------- */

const renderUserPositionBadges = (p: FlattenedPoolWithUserData) => {
  const userPositionsMap = (p.userPosition as Record<string, any> | undefined) ?? undefined

  if (!userPositionsMap) return null

  const entries = Object.entries(userPositionsMap).filter(([, pos]) => {
    const dep = pos?.depositsUSD ?? 0
    const debt = pos?.debtUSD ?? 0
    const debtStable = pos?.debtStableUSD ?? 0
    return dep > 0 || debt > 0 || debtStable > 0
  })

  if (entries.length === 0) return null

  const singleZeroOnly = entries.length === 1 && entries[0][0] === '0'

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {entries.map(([subId, pos]) => {
        const dep = pos.depositsUSD ?? 0
        const debtTotal = (pos.debtUSD ?? 0) + (pos.debtStableUSD ?? 0)

        const label = singleZeroOnly && subId === '0' ? undefined : `Sub ${subId}`

        return (
          <div
            key={subId}
            title={`Deposits: $${dep.toLocaleString()} | Debt: $${debtTotal.toLocaleString()}`}
          >
            {label && <span className="font-semibold uppercase truncate w-full">{label}</span>}
            {dep > 0 && (
              <ValuePill
                label="Dep"
                value={dep.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
                prefix="$"
                tone="success"
              />
            )}
            {debtTotal > 0 && (
              <ValuePill
                label="Debt"
                value={debtTotal.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
                prefix="$"
                tone="error"
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ---------- Virtualized list plumbing ---------- */

interface LendingPoolRowData {
  pools: FlattenedPoolWithUserData[]
  onSelect: (pool: FlattenedPoolWithUserData) => void
  onClose: () => void
}

// a bit taller to accommodate user position badges
const ROW_HEIGHT = 96 // px – tweak if needed

interface LendingPoolListProps {
  pools: FlattenedPoolWithUserData[]
  onSelect: (pool: FlattenedPoolWithUserData) => void
  onClose: () => void
}

/**
 * List wrapper that:
 *  - Uses simple map for small lists
 *  - Switches to react-window List for large lists
 */
const VIRTUALIZATION_THRESHOLD = 40

const LendingPoolList: React.FC<LendingPoolListProps> = ({ pools, onSelect, onClose }) => {
  if (pools.length === 0) return null

  // Small lists: regular rendering (no virtualization needed)
  if (pools.length < VIRTUALIZATION_THRESHOLD) {
    return (
      <div className="w-full">
        {pools.map((p) => {
          const asset = p.asset as RawCurrency
          const tvl = p.poolData.totalDepositsUSD
          const apr = p.poolData.depositRate ?? 0

          return (
            <button
              key={`${p.chainId}-${p.lender}-${p.marketUid}`}
              type="button"
              className="w-full px-4 py-3 hover:bg-base-200 hover:cursor-pointer text-left border-b border-base-200 last:border-b-0"
              onClick={() => {
                onSelect(p)
                onClose()
              }}
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 w-full">
                {/* 25% – Asset */}
                <div className="min-w-0 md:basis-1/4 md:max-w-[25%]">{renderAsset(asset)}</div>

                {/* 50% – Name + Lender */}
                <div className="flex flex-col min-w-0 md:basis-1/2 md:max-w-[50%]">
                  <span className="text-xs font-medium text-base-content truncate" title={p.poolData.name}>
                    {p.poolData.name}
                  </span>
                  <span className="text-[10px] text-base-content/50 truncate" title={p.lender}>
                    {p.lender}
                  </span>
                </div>

                {/* 25% – TVL + APR + user data */}
                <div className="flex flex-col text-xs min-w-0 md:basis-1/4 md:max-w-[25%] md:items-end">
                  <span className="font-semibold truncate">
                    TVL $
                    {tvl.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}
                  </span>
                  <span className="text-base-content/70 truncate">APR {apr.toFixed(2)}%</span>

                  {renderUserPositionBadges(p)}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  // Large lists: virtualized
  const itemData: LendingPoolRowData = {
    pools,
    onSelect,
    onClose,
  }

  const LendingPoolRow: React.FC<{ index: number; style: any }> = ({ index, style }) => {
    const p = itemData.pools[index]
    const asset = p.asset as RawCurrency
    const tvl = p.poolData.totalDepositsUSD
    const apr = p.poolData.depositRate ?? 0

    return (
      <button
        type="button"
        style={style}
        className="w-full px-4 py-3 hover:bg-base-200 hover:cursor-pointer text-left border-b border-base-200 last:border-b-0"
        onClick={() => {
          itemData.onSelect(p)
          itemData.onClose()
        }}
      >
        {/* Full-width row with 25% / 50% / 25% on md+ */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 w-full">
          {/* 25% – Asset */}
          <div className="min-w-0 md:basis-1/4 md:max-w-[25%]">{renderAsset(asset)}</div>

          {/* 50% – Name + Lender */}
          <div className="flex flex-col min-w-0 md:basis-1/2 md:max-w-[50%]">
            <span className="text-xs font-medium text-base-content truncate" title={p.poolData.name}>
              {p.poolData.name}
            </span>
            <span className="text-[10px] text-base-content/50 truncate" title={p.lender}>
              {p.lender}
            </span>
          </div>

          {/* 25% – TVL + APR + user data */}
          <div className="flex flex-col text-xs min-w-0 md:basis-1/4 md:max-w-[25%] md:items-end">
            <span className="font-semibold truncate">
              TVL $
              {tvl.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            </span>
            <span className="text-base-content/70 truncate">APR {apr.toFixed(2)}%</span>

            {/* user position badges (if any) */}
            {renderUserPositionBadges(p)}
          </div>
        </div>
      </button>
    )
  }

  return (
    <List
      height={600}
      defaultHeight={600} // fits inside max-h-[80vh] of modal; tweak if needed
      rowHeight={ROW_HEIGHT}
      rowCount={pools.length}
      rowProps={{} as any}
      style={{ width: '100%', height: 600 }} // @ts-ignore
      rowComponent={LendingPoolRow}
    />
  )
}

/* ---------- Modal component ---------- */

export const LendingPoolSelectionModal: React.FC<LendingPoolSelectionModalProps> = ({
  open,
  onClose,
  pools,
  onSelect,
}) => {
  // Separate search fields
  const [assetSearch, setAssetSearch] = useState('')
  const [lenderSearch, setLenderSearch] = useState('')
  const [poolIdSearch, setPoolIdSearch] = useState('')

  // Lender suggestions dropdown state
  const [showLenderSuggestions, setShowLenderSuggestions] = useState(false)

  // Unique lenders derived from all pools (for suggestions)
  const lenders = useMemo(() => {
    const set = new Set<string>()
    for (const p of pools) {
      if (p.lender) set.add(p.lender)
    }
    return Array.from(set).sort()
  }, [pools])

  // Filtered suggestions based on current lenderSearch
  const lenderSuggestions = useMemo(() => {
    const q = lenderSearch.trim().toLowerCase()
    if (!q) {
      // default: top N lenders if nothing typed
      return lenders.slice(0, 10)
    }
    return lenders.filter((l) => l.toLowerCase().includes(q)).slice(0, 10)
  }, [lenders, lenderSearch])

  // Combined filtering logic using the three fields
  const filtered = useMemo(() => {
    const assetQ = assetSearch.trim().toLowerCase()
    const lenderQ = lenderSearch.trim().toLowerCase()
    const poolQ = poolIdSearch.trim().toLowerCase()

    if (!assetQ && !lenderQ && !poolQ) return pools

    return pools.filter((p) => {
      const asset = p.asset as RawCurrency
      const symbol = (asset?.symbol ?? (asset as any)?.ticker ?? '').toLowerCase()
      const name = (asset?.name ?? (asset as any)?.label ?? '').toLowerCase()
      const lender = p.lender.toLowerCase()
      const poolId = p.marketUid.toLowerCase()

      if (assetQ && !(symbol.includes(assetQ) || name.includes(assetQ))) return false
      if (lenderQ && !lender.includes(lenderQ)) return false
      if (poolQ && !poolId.includes(poolQ)) return false

      return true
    })
  }, [pools, assetSearch, lenderSearch, poolIdSearch])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      {/* backdrop */}
      <div className="absolute inset-0 bg-base-300/40 backdrop-blur-sm" onClick={onClose} />

      {/* modal */}
      <div className="relative z-50 bg-base-100 rounded-box shadow-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-base-300">
          <h3 className="font-semibold text-sm">Select Lending Market</h3>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-circle"
            onClick={onClose}
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Search controls */}
        <div className="px-4 py-3 border-b border-base-300 space-y-2">
          <div className="text-[10px] uppercase tracking-wide text-base-content/60">
            Filter by asset, lender, or pool id
          </div>

          <div className="flex flex-col md:flex-row gap-2">
            {/* Asset search */}
            <input
              type="text"
              className="input input-bordered input-sm w-full md:flex-1"
              placeholder="Asset (symbol or name)"
              value={assetSearch}
              onChange={(e) => setAssetSearch(e.target.value)}
            />

            {/* Lender search with suggestions */}
            <div className="relative w-full md:flex-1">
              <input
                type="text"
                className="input input-bordered input-sm w-full"
                placeholder="Lender"
                value={lenderSearch}
                onChange={(e) => setLenderSearch(e.target.value)}
                onFocus={() => setShowLenderSuggestions(true)}
                onBlur={() => {
                  // small delay so clicks on suggestions still register
                  setTimeout(() => setShowLenderSuggestions(false), 120)
                }}
              />
              {showLenderSuggestions && lenderSuggestions.length > 0 && (
                <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-box border border-base-300 bg-base-100 shadow-lg text-sm">
                  {lenderSuggestions.map((l) => (
                    <button
                      key={l}
                      type="button"
                      className="w-full px-3 py-1.5 text-left hover:bg-base-200"
                      onMouseDown={(e) => {
                        // prevent blur before click
                        e.preventDefault()
                        setLenderSearch(l)
                        setShowLenderSuggestions(false)
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Pool id search */}
            <input
              type="text"
              className="input input-bordered input-sm w-full md:flex-1"
              placeholder="Pool ID"
              value={poolIdSearch}
              onChange={(e) => setPoolIdSearch(e.target.value)}
            />
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto py-2">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-sm text-base-content/70">
              No pools match your filters.
            </div>
          )}

          {filtered.length > 0 && (
            <LendingPoolList pools={filtered} onSelect={onSelect} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  )
}
