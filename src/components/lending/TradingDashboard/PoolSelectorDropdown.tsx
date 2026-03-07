import React, { useMemo, useRef, useState, useEffect } from 'react'
import type { PoolDataItem } from '../../../hooks/lending/usePoolData'
import type { UserPositionEntry } from '../../../hooks/lending/useUserData'

interface PoolSelectorDropdownProps {
  pools: PoolDataItem[]
  value: PoolDataItem | null
  onChange: (pool: PoolDataItem | null) => void
  userPositions: Map<string, UserPositionEntry>
  label: string
  positionType: 'deposits' | 'debt'
  disabled?: boolean
  /** MarketUids from the active config — these are sorted to the top. */
  preferredUids?: Set<string>
}

function fmtBal(v: number | string): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (!Number.isFinite(n) || n === 0) return '0'
  if (n < 0.0001) return '<0.0001'
  if (n < 1) return n.toFixed(4)
  if (n < 10_000) return n.toFixed(2)
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function fmtUsd(v: number): string {
  if (!Number.isFinite(v) || v === 0) return '$0'
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: v < 1000 ? 2 : 0 })}`
}

export const PoolSelectorDropdown: React.FC<PoolSelectorDropdownProps> = ({
  pools,
  value,
  onChange,
  userPositions,
  label,
  positionType,
  disabled,
  preferredUids,
}) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Sort pools: preferred (config group) first, then positions, then alphabetical
  const sorted = useMemo(() => {
    const q = search.toLowerCase()
    const filtered = pools.filter(
      (p) =>
        !q || p.asset.symbol.toLowerCase().includes(q) || p.asset.name.toLowerCase().includes(q)
    )

    const hasPreferred = preferredUids && preferredUids.size > 0

    return [...filtered].sort((a, b) => {
      // Preferred pools first
      if (hasPreferred) {
        const prefA = preferredUids.has(a.marketUid)
        const prefB = preferredUids.has(b.marketUid)
        if (prefA && !prefB) return -1
        if (prefB && !prefA) return 1
      }

      // Then by position balance
      const posA = userPositions.get(a.marketUid)
      const posB = userPositions.get(b.marketUid)
      const valA = posA
        ? positionType === 'debt'
          ? Number(posA.debt) + Number(posA.debtStable)
          : Number(posA.deposits)
        : 0
      const valB = posB
        ? positionType === 'debt'
          ? Number(posB.debt) + Number(posB.debtStable)
          : Number(posB.deposits)
        : 0
      if (valA > 0 && valB === 0) return -1
      if (valB > 0 && valA === 0) return 1
      return a.asset.symbol.localeCompare(b.asset.symbol)
    })
  }, [pools, search, userPositions, positionType, preferredUids])

  const getPositionText = (pool: PoolDataItem): string | null => {
    const pos = userPositions.get(pool.marketUid)
    if (!pos) return null
    if (positionType === 'debt') {
      const debt = Number(pos.debt) + Number(pos.debtStable)
      if (debt <= 0) return null
      return `Debt: ${fmtBal(debt)} (${fmtUsd(pos.debtUSD + pos.debtStableUSD)})`
    }
    const dep = Number(pos.deposits)
    if (dep <= 0) return null
    return `Deposited: ${fmtBal(pos.deposits)} (${fmtUsd(pos.depositsUSD)})`
  }

  return (
    <div ref={ref} className="relative">
      <label className="label-text text-xs mb-0.5 block">{label}</label>
      <button
        type="button"
        className={`btn btn-sm w-full justify-start gap-2 font-normal ${
          disabled ? 'btn-disabled' : 'btn-outline'
        }`}
        onClick={() => !disabled && setOpen(!open)}
      >
        {value ? (
          <>
            <img
              src={value.asset.logoURI}
              width={20}
              height={20}
              alt={value.asset.symbol}
              className="rounded-full object-contain w-5 h-5"
            />
            <span className="truncate">
              {value.asset.symbol}
              <span className="text-base-content/50 ml-1 text-[11px]">{value.asset.name}</span>
            </span>
          </>
        ) : (
          <span className="text-base-content/50">Select asset...</span>
        )}
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-base-300 bg-base-100 shadow-lg">
          <div className="sticky top-0 bg-base-100 p-1">
            <input
              type="text"
              className="input input-bordered input-xs w-full"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          {sorted.length === 0 && (
            <div className="px-3 py-2 text-xs text-base-content/50">No assets found</div>
          )}
          {sorted.map((pool, idx) => {
            const posText = getPositionText(pool)
            const isSelected = value?.marketUid === pool.marketUid
            const hasPreferred = preferredUids && preferredUids.size > 0
            const isPreferred = hasPreferred && preferredUids.has(pool.marketUid)

            // Show separator between preferred and non-preferred groups
            const prevPool = idx > 0 ? sorted[idx - 1] : null
            const showSeparator =
              hasPreferred &&
              !isPreferred &&
              prevPool &&
              preferredUids.has(prevPool.marketUid)

            return (
              <React.Fragment key={pool.marketUid}>
                {showSeparator && (
                  <div className="border-t border-base-300 mx-2 my-1">
                    <span className="text-[10px] text-base-content/40 px-0.5">Other</span>
                  </div>
                )}
                <button
                  type="button"
                  className={`flex items-center gap-2 w-full px-2 py-1.5 text-left text-xs ${
                    isSelected
                      ? 'bg-base-200 font-medium'
                      : isPreferred
                        ? 'bg-primary/5 hover:bg-primary/10'
                        : 'hover:bg-base-200'
                  } ${!isPreferred && hasPreferred ? 'opacity-50' : ''}`}
                  onClick={() => {
                    onChange(pool)
                    setOpen(false)
                    setSearch('')
                  }}
                >
                  <img
                    src={pool.asset.logoURI}
                    width={20}
                    height={20}
                    alt={pool.asset.symbol}
                    className="rounded-full object-contain w-5 h-5 shrink-0"
                  />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-medium">
                      {pool.asset.symbol}
                      <span className="text-base-content/50 ml-0.5 font-normal">{pool.asset.name}</span>
                      {isPreferred && (
                        <span className="ml-auto text-[9px] font-medium text-primary/70 bg-primary/10 px-1 py-0.5 rounded">
                          config
                        </span>
                      )}
                    </span>
                    {posText && (
                      <span
                        className={`text-[10px] ${positionType === 'debt' ? 'text-error/70' : 'text-success/70'}`}
                      >
                        {posText}
                      </span>
                    )}
                  </div>
                </button>
              </React.Fragment>
            )
          })}
        </div>
      )}
    </div>
  )
}
