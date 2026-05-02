import React from 'react'
import type { LendingActionSimulation } from '../../../sdk/lending-helper/fetchLendingAction'

const HEALTH_INF_THRESHOLD = 1e15

function formatHealth(health: number): string {
  if (health >= HEALTH_INF_THRESHOLD) return '\u221E'
  return health.toFixed(2)
}

function healthColor(health: number): string {
  if (health >= HEALTH_INF_THRESHOLD) return 'text-success'
  if (health < 1.1) return 'text-error'
  if (health < 1.3) return 'text-warning'
  return 'text-success'
}

function healthBadgeColor(health: number): string {
  if (health >= HEALTH_INF_THRESHOLD) return 'badge-success'
  if (health < 1.1) return 'badge-error'
  if (health < 1.3) return 'badge-warning'
  return 'badge-success'
}

export const HealthFactorProjection: React.FC<{
  simulation: LendingActionSimulation | undefined
}> = ({ simulation }) => {
  if (!simulation) return null

  const before = simulation.pre.healthFactor
  const after = simulation.post.healthFactor

  return (
    <div className="flex flex-col gap-1 text-xs px-1 py-1.5 rounded-lg bg-base-200/60">
      <div className="flex items-center justify-between">
        <span className="text-base-content/60">Health Factor:</span>
        <div className="flex items-center gap-1.5">
          {before != null ? (
            <span className={`font-semibold ${healthColor(before)}`}>
              {formatHealth(before)}
            </span>
          ) : (
            <span className="text-base-content/40">n/a</span>
          )}
          <span className="text-base-content/40">{'\u2192'}</span>
          {after != null ? (
            <span className={`badge badge-xs font-semibold ${healthBadgeColor(after)}`}>
              {formatHealth(after)}
            </span>
          ) : (
            <span className="text-base-content/40">n/a</span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-base-content/60">Borrow Capacity:</span>
        <div className="flex items-center gap-1.5">
          <span className="font-semibold">
            ${simulation.pre.borrowCapacity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-base-content/40">{'\u2192'}</span>
          <span className="badge badge-xs font-semibold">
            ${simulation.post.borrowCapacity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </div>
  )
}
