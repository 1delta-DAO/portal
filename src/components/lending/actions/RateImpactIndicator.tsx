import React from 'react'
import type { RateImpactEntry } from '../../../sdk/lending-helper/fetchLendingAction'

/** Per-market yield extras — folded into the displayed totals so the panel
 *  matches the market tables' headline convention (base + intrinsic, with
 *  rewards as a separate transient badge). All values in percent units. */
export interface MarketYieldExtras {
  /** Intrinsic (native/staking) yield of the market's asset. Earned by
   *  depositors, paid by borrowers — added to BOTH headline totals. */
  intrinsicYield?: number
  /** Deposit-side reward incentive APR (transient — never in the headline). */
  depositRewardApr?: number
  /** Borrow-side reward rebate APR (lowers borrow cost, transient). */
  borrowRewardApr?: number
}

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

/** One rate row: `<label>: total% → total%` with base+intrinsic folded into the
 *  totals (breakdown in the tooltip) and the reward APR as a separate badge —
 *  the same composition the market tables use. */
const RateRow: React.FC<{
  label: string
  current: number | null
  projected: number | null
  /** Intrinsic yield (%) folded into both displayed values. */
  intrinsicYield: number
  /** Reward APR (%) shown as a transient badge, never in the headline. */
  rewardApr: number
  /** Deposit side: higher rate + rewards earn more. Borrow side: rewards rebate cost. */
  side: 'deposit' | 'borrow'
}> = ({ label, current, projected, intrinsicYield, rewardApr, side }) => {
  if (current == null) return null
  const isBorrow = side === 'borrow'
  const iy = Number.isFinite(intrinsicYield) ? intrinsicYield : 0
  const curTotal = current + iy
  const projTotal = projected != null ? projected + iy : null
  // Only draw the arrow when the DISPLAYED values differ — a sub-0.01%
  // shift would otherwise render as "13.80% → 13.80%".
  const hasChange = projTotal != null && formatPct(projTotal) !== formatPct(curTotal)

  const breakdown =
    iy > 0
      ? `Base rate: ${formatPct(projected ?? current)} + Intrinsic yield: ${formatPct(iy)}${
          isBorrow ? ' (paid by borrower)' : ''
        }`
      : undefined

  return (
    <div className="flex items-center justify-between">
      <span className="text-base-content/60">{label}:</span>
      <div className="flex items-center gap-1.5">
        <span className="font-semibold" title={breakdown}>
          {formatPct(curTotal)}
        </span>
        {hasChange && (
          <>
            <span className="text-base-content/40">{'→'}</span>
            <span
              className={`badge badge-xs font-semibold ${deltaColor(curTotal, projTotal!, !isBorrow)}`}
              title={breakdown}
            >
              {formatPct(projTotal)}
            </span>
          </>
        )}
        {iy > 0 && (
          <span
            className={`badge badge-xs border-0 cursor-help whitespace-nowrap ${
              isBorrow ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success'
            }`}
            title={breakdown}
          >
            +{iy.toFixed(1)}%
          </span>
        )}
        {rewardApr > 0.005 && (
          <span
            className={`badge badge-xs border-0 cursor-help whitespace-nowrap ${
              isBorrow ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
            }`}
            title={
              isBorrow
                ? `Borrow reward rebate: −${rewardApr.toFixed(2)}% APR (lowers borrow cost, transient)`
                : `Reward incentive: +${rewardApr.toFixed(2)}% APR (transient)`
            }
          >
            {isBorrow ? '−' : '+'}
            {rewardApr.toFixed(1)}% rwd
          </span>
        )}
      </div>
    </div>
  )
}

const EntryRow: React.FC<{
  entry: RateImpactEntry
  showMarketLabel: boolean
  label?: string
  yields?: MarketYieldExtras
}> = ({ entry, showMarketLabel, label, yields }) => {
  const depCur = safeNum(entry.depositRate?.current)
  const depProj = safeNum(entry.depositRate?.projected)
  const borCur = safeNum(entry.borrowRate?.current)
  const borProj = safeNum(entry.borrowRate?.projected)
  const utilCur = safeNum(entry.utilization?.current)
  const utilProj = safeNum(entry.utilization?.projected)

  const hasUtilChange =
    utilCur != null && utilProj != null && formatUtilPct(utilProj) !== formatUtilPct(utilCur)
  const iy = safeNum(yields?.intrinsicYield) ?? 0

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
      <RateRow
        label="Deposit APR"
        current={depCur}
        projected={depProj}
        intrinsicYield={iy}
        rewardApr={safeNum(yields?.depositRewardApr) ?? 0}
        side="deposit"
      />
      <RateRow
        label="Borrow APR"
        current={borCur}
        projected={borProj}
        intrinsicYield={iy}
        rewardApr={safeNum(yields?.borrowRewardApr) ?? 0}
        side="borrow"
      />
      <div className="flex items-center justify-between">
        <span className="text-base-content/60">Utilization:</span>
        <div className="flex items-center gap-1.5">
          <span className="font-semibold">{formatUtilPct(utilCur)}</span>
          {hasUtilChange && (
            <>
              <span className="text-base-content/40">{'→'}</span>
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
  /** Optional map of marketUid → intrinsic/reward APRs. When provided, the
   *  headline rates show base + intrinsic (like the market tables) and the
   *  reward APR appears as a separate transient badge. */
  marketYields?: Record<string, MarketYieldExtras>
}> = ({ rateImpact, marketLabels, marketYields }) => {
  if (!rateImpact || rateImpact.length === 0) return null

  const validEntries = rateImpact.filter((e) => e != null)
  if (validEntries.length === 0) return null

  const showLabels = validEntries.length > 1

  return (
    <div className="flex flex-col gap-1 text-xs px-1 py-1.5 rounded-lg bg-base-200/60">
      <div className="text-[10px] font-semibold text-base-content/50 uppercase tracking-wider mb-0.5">
        Rate Impact
      </div>
      {validEntries.map((entry) => (
        <EntryRow
          key={entry.marketUid}
          entry={entry}
          showMarketLabel={showLabels}
          label={marketLabels?.[entry.marketUid]}
          yields={marketYields?.[entry.marketUid]}
        />
      ))}
    </div>
  )
}
