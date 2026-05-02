import React from 'react'
import type { PoolConfig } from '../../../hooks/lending/usePoolData'
import { getMaxLtv } from './helpers'

interface Props {
  config: Record<string, PoolConfig>
  /** "cell" = table cell style with dash fallback; "inline" = card style with LTV label, null fallback */
  variant: 'cell' | 'inline'
}

export const LtvBadge: React.FC<Props> = ({ config, variant }) => {
  const ltv = getMaxLtv(config)

  if (!ltv) {
    return variant === 'cell' ? (
      <span className="text-xs text-base-content/40">&mdash;</span>
    ) : null
  }

  const pct = `${(ltv.max * 100).toFixed(0)}%`
  const upTo = !ltv.allSame && <span className="text-base-content/50">up to </span>

  if (variant === 'cell') {
    return (
      <span className="text-xs font-medium">
        {upTo}
        {pct}
      </span>
    )
  }

  return (
    <span>
      LTV: {upTo}
      <span className="font-medium">{pct}</span>
    </span>
  )
}
