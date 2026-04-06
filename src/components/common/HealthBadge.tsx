import React from 'react'

interface HealthBadgeProps {
  /** Health factor; pass null/undefined to render an "n/a" placeholder. */
  health: number | null | undefined
  /** DaisyUI badge size token, defaults to "sm". */
  size?: 'xs' | 'sm' | 'md'
}

/**
 * Standard health-factor badge: red below 1.1, yellow below 1.3, green above.
 * Extracted from UserTable to be reusable in YourPositions and the action
 * forms (HealthFactorProjection currently rolls its own).
 */
export const HealthBadge: React.FC<HealthBadgeProps> = ({ health, size = 'sm' }) => {
  if (health == null) {
    return <span className="text-xs text-base-content/50">n/a</span>
  }
  const tone =
    health < 1.1 ? 'badge-error' : health < 1.3 ? 'badge-warning' : 'badge-success'
  return (
    <span className={`badge badge-${size} ${tone} tabular-nums`}>
      {health.toFixed(2)}
    </span>
  )
}
