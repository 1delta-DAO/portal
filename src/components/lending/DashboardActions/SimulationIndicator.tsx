import React from 'react'
import type { SimulationResult } from '../TradingDashboard/useTradingQuotes'

function fmtHf(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—'
  if (n > 1e6) return '> 1M'
  return n.toFixed(4)
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0'
  if (n < 0.01 && n > 0) return '< $0.01'
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function hfColor(pre: number, post: number): string {
  if (post === pre) return ''
  return post > pre ? 'text-success' : 'text-error'
}

function bcColor(pre: number, post: number): string {
  if (post === pre) return ''
  return post > pre ? 'text-success' : 'text-error'
}

export const SimulationIndicator: React.FC<{
  simulation: SimulationResult | undefined | null
}> = ({ simulation }) => {
  if (!simulation) return null

  const { pre, post } = simulation
  const hfChanged = pre.healthFactor !== post.healthFactor
  const bcChanged = pre.borrowCapacity !== post.borrowCapacity

  if (!hfChanged && !bcChanged) return null

  return (
    <div className="flex flex-col gap-1 text-xs px-1 py-1.5 rounded-lg bg-base-200/60">
      <div className="text-[10px] font-semibold text-base-content/45 uppercase tracking-wider mb-0.5">
        Position Impact
      </div>
      {hfChanged && (
        <div className="flex items-center justify-between">
          <span className="text-base-content/60">Health Factor:</span>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold">{fmtHf(pre.healthFactor)}</span>
            <span className="text-base-content/40">{'\u2192'}</span>
            <span
              className={`badge badge-xs font-semibold ${hfColor(pre.healthFactor, post.healthFactor)}`}
            >
              {fmtHf(post.healthFactor)}
            </span>
          </div>
        </div>
      )}
      {bcChanged && (
        <div className="flex items-center justify-between">
          <span className="text-base-content/60">Borrow Capacity:</span>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold">{fmtUsd(pre.borrowCapacity)}</span>
            <span className="text-base-content/40">{'\u2192'}</span>
            <span
              className={`badge badge-xs font-semibold ${bcColor(pre.borrowCapacity, post.borrowCapacity)}`}
            >
              {fmtUsd(post.borrowCapacity)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
