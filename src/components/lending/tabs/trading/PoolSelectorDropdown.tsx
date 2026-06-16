import React, { useMemo, useRef, useState, useEffect } from 'react'
import type { PoolDataItem } from '../../../../hooks/lending/usePoolData'
import type { UserPositionEntry } from '../../../../hooks/lending/useUserData'
import { Logo } from '../../../common/Logo'

interface PoolSelectorDropdownProps {
  pools: PoolDataItem[]
  value: PoolDataItem | null
  onChange: (pool: PoolDataItem | null) => void
  userPositions: Map<string, UserPositionEntry>
  label: string
  positionType: 'deposits' | 'debt'
  disabled?: boolean
  /**
   * MarketUids selectable for this side in the active config (collaterals or
   * borrowables). When non-empty, the list is filtered to just these by default
   * — a "Show all" toggle reveals the rest; without it, all pools show.
   */
  preferredUids?: Set<string>
}

interface PositionInfo {
  /** Short native balance, e.g. "3,141.79" */
  native: string
  /** Abbreviated USD value, e.g. "$254.32M" */
  usd: string
  /** Full-precision tooltip, e.g. "Deposited: 3141.792345 ($254,322,510)" */
  full: string
}

function fmtBal(v: number | string): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (!Number.isFinite(n) || n === 0) return '0'
  if (n < 0.0001) return '<0.0001'
  if (n < 1) return n.toFixed(4)
  if (n < 10_000) return n.toFixed(2)
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function fmtUsdAbbrev(v: number): string {
  if (!Number.isFinite(v) || v === 0) return '$0'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000_000_000) return `${sign}$${(abs / 1_000_000_000_000).toFixed(2)}T`
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(2)}`
}

function fmtUsdFull(v: number): string {
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
  // When a config is active we filter the list down to the assets actually
  // selectable for this side in that config (i.e. `preferredUids` — the config
  // group's collaterals / borrowables, which already honor the per-config
  // `collateralDisabled` / `debtDisabled` flags). `showAll` lets the user opt
  // back into the full market list.
  const [showAll, setShowAll] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Reset to the config-filtered view whenever the active config (and thus the
  // selectable set) changes, so switching configs doesn't silently keep the
  // full list open.
  useEffect(() => {
    setShowAll(false)
  }, [preferredUids])

  const hasPreferred = !!(preferredUids && preferredUids.size > 0)

  // Filter + sort. With a config active, default to only the selectable assets;
  // `showAll` reveals the rest. The selected asset is always kept visible so a
  // prior out-of-config selection doesn't vanish from the list.
  const { visible, configCount, otherCount } = useMemo(() => {
    const q = search.toLowerCase()
    const textFiltered = pools.filter(
      (p) =>
        !q || p.asset.symbol.toLowerCase().includes(q) || p.asset.name.toLowerCase().includes(q)
    )

    let configCount = 0
    if (hasPreferred) {
      for (const p of textFiltered) if (preferredUids!.has(p.marketUid)) configCount++
    }
    const otherCount = textFiltered.length - configCount

    const base =
      hasPreferred && !showAll
        ? textFiltered.filter(
            (p) => preferredUids!.has(p.marketUid) || p.marketUid === value?.marketUid
          )
        : textFiltered

    const visible = [...base].sort((a, b) => {
      // Preferred pools first
      if (hasPreferred) {
        const prefA = preferredUids!.has(a.marketUid)
        const prefB = preferredUids!.has(b.marketUid)
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

    return { visible, configCount, otherCount }
  }, [pools, search, userPositions, positionType, preferredUids, hasPreferred, showAll, value])

  const getPosition = (pool: PoolDataItem): PositionInfo | null => {
    const pos = userPositions.get(pool.marketUid)
    if (!pos) return null
    if (positionType === 'debt') {
      const debt = Number(pos.debt) + Number(pos.debtStable)
      if (debt <= 0) return null
      const totalUsd = pos.debtUSD + pos.debtStableUSD
      return {
        native: fmtBal(debt),
        usd: fmtUsdAbbrev(totalUsd),
        full: `Debt: ${fmtBal(debt)} (${fmtUsdFull(totalUsd)})`,
      }
    }
    const dep = Number(pos.deposits)
    if (dep <= 0) return null
    return {
      native: fmtBal(pos.deposits),
      usd: fmtUsdAbbrev(pos.depositsUSD),
      full: `Deposited: ${fmtBal(pos.deposits)} (${fmtUsdFull(pos.depositsUSD)})`,
    }
  }

  return (
    <div ref={ref} className="relative">
      <label className="label-text text-xs mb-0.5 block">{label}</label>
      <button
        type="button"
        className={`btn btn-sm w-full justify-start gap-2 font-normal h-auto min-h-0 py-1.5 ${
          disabled ? 'btn-disabled' : 'btn-outline'
        }`}
        onClick={() => !disabled && setOpen(!open)}
      >
        {value ? (
          <>
            <Logo
              src={value.asset.logoURI}
              alt={value.asset.symbol}
              fallbackText={value.asset.symbol}
              className="rounded-full object-contain w-5 h-5 shrink-0 token-logo"
            />
            <div className="flex flex-col min-w-0 flex-1 leading-tight items-start">
              <span className="text-sm font-medium truncate w-full text-left">
                {value.asset.symbol}
              </span>
              <span className="text-[10px] text-base-content/50 truncate w-full text-left">
                {value.asset.name}
              </span>
            </div>
            <ChevronDown />
          </>
        ) : (
          <>
            <span className="text-base-content/50 flex-1 text-left">Select asset…</span>
            <ChevronDown />
          </>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-80 flex flex-col rounded-box border border-base-300 bg-base-100 shadow-lg overflow-hidden">
          <div className="bg-base-100 p-2 border-b border-base-300 shrink-0">
            <input
              type="text"
              className="input input-bordered input-xs w-full"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          {hasPreferred && (otherCount > 0 || showAll) && (
            <button
              type="button"
              className="shrink-0 flex items-center justify-between gap-2 w-full px-2 py-1.5 text-[11px] border-b border-base-300 bg-base-100 text-base-content/60 hover:text-base-content hover:bg-base-200 transition-colors"
              onClick={() => setShowAll((v) => !v)}
            >
              <span>
                {showAll
                  ? `Showing all markets (${configCount} selectable in config)`
                  : `Showing config only (${configCount} selectable)`}
              </span>
              <span className="font-medium text-primary/80">
                {showAll ? 'Show config only' : `Show all (+${otherCount})`}
              </span>
            </button>
          )}
          <div className="overflow-y-auto flex-1 min-h-0">
            {visible.length === 0 && (
              <div className="px-3 py-3 text-xs text-base-content/50 text-center">
                {hasPreferred && !showAll ? 'Nothing selectable in this config' : 'No assets found'}
              </div>
            )}
            {visible.map((pool, idx) => {
              const position = getPosition(pool)
              const isSelected = value?.marketUid === pool.marketUid
              const isPreferred = hasPreferred && preferredUids!.has(pool.marketUid)

              // Show separator between preferred and non-preferred groups
              const prevPool = idx > 0 ? visible[idx - 1] : null
              const showSeparator =
                hasPreferred &&
                !isPreferred &&
                prevPool &&
                preferredUids!.has(prevPool.marketUid)

              return (
                <React.Fragment key={pool.marketUid}>
                  {showSeparator && (
                    <div className="px-2 pt-2 pb-1 border-t border-base-300 mt-1">
                      <span className="text-[10px] uppercase tracking-wider text-base-content/40">
                        Other markets
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    className={`flex items-center gap-2 w-full px-2 py-1.5 text-left text-xs transition-colors ${
                      isSelected
                        ? 'bg-primary/15 ring-1 ring-primary ring-inset'
                        : isPreferred
                          ? 'hover:bg-primary/10'
                          : 'hover:bg-base-200'
                    } ${!isPreferred && hasPreferred ? 'opacity-60 hover:opacity-100' : ''}`}
                    onClick={() => {
                      onChange(pool)
                      setOpen(false)
                      setSearch('')
                    }}
                  >
                    <Logo
                      src={pool.asset.logoURI}
                      alt={pool.asset.symbol}
                      fallbackText={pool.asset.symbol}
                      className="rounded-full object-contain w-5 h-5 shrink-0 token-logo"
                    />
                    <div className="flex flex-col min-w-0 flex-1 leading-tight">
                      <div className="flex items-center justify-between gap-1.5 min-w-0">
                        <span className="font-medium truncate">{pool.asset.symbol}</span>
                        {isPreferred && (
                          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-primary/80 bg-primary/10 px-1 py-0.5 rounded">
                            config
                          </span>
                        )}
                      </div>
                      <span
                        className="text-[10px] text-base-content/50 truncate"
                        title={pool.asset.name}
                      >
                        {pool.asset.name}
                      </span>
                    </div>

                    {position && (
                      <div
                        className="flex flex-col items-end leading-tight shrink-0"
                        title={position.full}
                      >
                        <span
                          className={`text-xs font-semibold tabular-nums ${
                            positionType === 'debt' ? 'text-error' : 'text-success'
                          }`}
                        >
                          {position.usd}
                        </span>
                        <span className="text-[10px] text-base-content/50 font-mono tabular-nums">
                          {position.native} {pool.asset.symbol}
                        </span>
                      </div>
                    )}
                  </button>
                </React.Fragment>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

const ChevronDown: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className="w-3.5 h-3.5 ml-auto shrink-0 opacity-50"
    aria-hidden
  >
    <path
      fillRule="evenodd"
      d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
      clipRule="evenodd"
    />
  </svg>
)
