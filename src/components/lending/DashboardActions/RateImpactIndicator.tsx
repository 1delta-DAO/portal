import React from 'react'
import type { RateImpactEntry } from '../../../sdk/lending-helper/fetchLendingAction'

function formatPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toFixed(2) + '%'
}

function formatUtilPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return (n * 100).toFixed(1) + '%'
}

function deltaColor(current: number, projected: number, higherIsBetter: boolean): string {
  if (projected === current) return ''
  const better = higherIsBetter ? projected > current : projected < current
  return better ? 'text-success' : 'text-error'
}

function safeNum(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

/** Extract a short label from marketUid, e.g. "AAVE_V3:1:0xc02a…cc2" → "AAVE_V3 · 0xc02a…cc2" */
function marketLabel(uid: string): string {
  const parts = uid.split(':')
  const lender = parts[0] ?? uid
  const addr = parts[2]
  if (!addr) return lender
  return `${lender} · ${addr.slice(0, 6)}…${addr.slice(-4)}`
}

const EntryRow: React.FC<{
  entry: RateImpactEntry
  showMarketLabel: boolean
  label?: string
}> = ({ entry, showMarketLabel, label }) => {
  const depCur = safeNum(entry.depositRate?.current)
  const depProj = safeNum(entry.depositRate?.projected)
  const borCur = safeNum(entry.borrowRate?.current)
  const borProj = safeNum(entry.borrowRate?.projected)
  const utilCur = safeNum(entry.utilization?.current)
  const utilProj = safeNum(entry.utilization?.projected)

  const hasDepChange = depCur != null && depProj != null && depCur !== depProj
  const hasBorChange = borCur != null && borProj != null && borCur !== borProj
  const hasUtilChange = utilCur != null && utilProj != null && utilCur !== utilProj

  return (
    <>
      {showMarketLabel && (
        <div
          className="text-[10px] text-base-content/50 truncate mt-1 first:mt-0"
          title={entry.marketUid}
        >
          {label || marketLabel(entry.marketUid)}
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-base-content/60">Deposit APR:</span>
        <div className="flex items-center gap-1.5">
          <span className="font-semibold">{formatPct(depCur)}</span>
          {hasDepChange && (
            <>
              <span className="text-base-content/40">{'\u2192'}</span>
              <span
                className={`badge badge-xs font-semibold ${deltaColor(depCur!, depProj!, true)}`}
              >
                {formatPct(depProj)}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-base-content/60">Borrow APR:</span>
        <div className="flex items-center gap-1.5">
          <span className="font-semibold">{formatPct(borCur)}</span>
          {hasBorChange && (
            <>
              <span className="text-base-content/40">{'\u2192'}</span>
              <span
                className={`badge badge-xs font-semibold ${deltaColor(borCur!, borProj!, false)}`}
              >
                {formatPct(borProj)}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-base-content/60">Utilization:</span>
        <div className="flex items-center gap-1.5">
          <span className="font-semibold">{formatUtilPct(utilCur)}</span>
          {hasUtilChange && (
            <>
              <span className="text-base-content/40">{'\u2192'}</span>
              <span
                className={`badge badge-xs font-semibold ${deltaColor(utilCur!, utilProj!, false)}`}
              >
                {formatUtilPct(utilProj)}
              </span>
            </>
          )}
        </div>
      </div>
    </>
  )
}

export const RateImpactIndicator: React.FC<{
  rateImpact: RateImpactEntry[] | undefined | null
  /** Optional map of marketUid → display name for readable labels */
  marketLabels?: Record<string, string>
}> = ({ rateImpact, marketLabels }) => {
  if (!rateImpact || rateImpact.length === 0) return null

  const validEntries = rateImpact.filter((e) => e != null)
  if (validEntries.length === 0) return null

  const showLabels = validEntries.length > 1

  return (
    <div className="flex flex-col gap-1 text-xs px-1 py-1.5 rounded-lg bg-base-200/60">
      <div className="text-[10px] font-semibold text-base-content/45 uppercase tracking-wider mb-0.5">
        Rate Impact
      </div>
      {validEntries.map((entry) => (
        <EntryRow
          key={entry.marketUid}
          entry={entry}
          showMarketLabel={showLabels}
          label={marketLabels?.[entry.marketUid]}
        />
      ))}
    </div>
  )
}
