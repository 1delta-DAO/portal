import React from 'react'

interface EmptyStateProps {
  /** Short heading shown at full opacity. */
  title: string
  /** Optional secondary line shown muted. */
  description?: string
  /** Optional icon (svg / element). Renders centered above the title. */
  icon?: React.ReactNode
  /** Optional action (e.g. "Clear filters" button) shown below description. */
  action?: React.ReactNode
  /** Compact variant for use inside table cells / popovers. */
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Standard empty state used throughout the app — replaces ad-hoc
 * `<div className="alert alert-info">...</div>` and "No matches" text.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  action,
  size = 'md',
  className = '',
}) => {
  const isSm = size === 'sm'
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        isSm ? 'gap-1 py-4' : 'gap-2 py-8'
      } ${className}`}
    >
      {icon && (
        <div className={`text-base-content/20 ${isSm ? 'w-6 h-6' : 'w-8 h-8'}`}>
          {icon}
        </div>
      )}
      <p
        className={`text-base-content/55 ${
          isSm ? 'text-xs' : 'text-sm font-medium'
        }`}
      >
        {title}
      </p>
      {description && (
        <p className="text-[10px] text-base-content/35 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
