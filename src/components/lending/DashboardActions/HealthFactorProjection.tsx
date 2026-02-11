import React from 'react'
import type { LendingActionSimulation } from '../../../sdk/lending-helper/fetchLendingAction'

function healthColor(health: number): string {
  if (health < 1.1) return 'text-error'
  if (health < 1.3) return 'text-warning'
  return 'text-success'
}

function healthBadgeColor(health: number): string {
  if (health < 1.1) return 'badge-error'
  if (health < 1.3) return 'badge-warning'
  return 'badge-success'
}

export const HealthFactorProjection: React.FC<{
  simulation: LendingActionSimulation | undefined
  currentHealth: number | null
}> = ({ simulation, currentHealth }) => {
  if (!simulation) return null

  const projected = simulation.healthFactor

  return (
    <div className="flex items-center justify-between text-xs px-1 py-1.5 rounded-lg bg-base-200/60">
      <span className="text-base-content/60">Health Factor:</span>
      <div className="flex items-center gap-1.5">
        {currentHealth != null ? (
          <span className={`font-semibold ${healthColor(currentHealth)}`}>
            {currentHealth.toFixed(2)}
          </span>
        ) : (
          <span className="text-base-content/40">n/a</span>
        )}
        <span className="text-base-content/40">{'\u2192'}</span>
        {projected != null ? (
          <span className={`badge badge-xs font-semibold ${healthBadgeColor(projected)}`}>
            {projected.toFixed(2)}
          </span>
        ) : (
          <span className="text-base-content/40">n/a</span>
        )}
      </div>
    </div>
  )
}
