import React from 'react'

export type BadgeTone = 'success' | 'error' | 'warning' | 'info' | 'primary' | 'neutral'

interface BadgeProps {
  tone?: BadgeTone
  size?: 'xs' | 'sm' | 'md'
  className?: string
  title?: string
  children: React.ReactNode
}

/**
 * Canonical tinted-pill badge. Replaces the hand-rolled
 * `badge badge-xs bg-{tone}/15 text-{tone} border-0` recipe that had drifted
 * between /15 and /20 tints across the lending UI.
 *
 * Tint is fixed at /15 everywhere (see DESIGN.md). Tone class strings are
 * spelled out in full so Tailwind's content scanner can see them — do not
 * build them by interpolation.
 */
const TONE_CLASS: Record<BadgeTone, string> = {
  success: 'bg-success/15 text-success',
  error: 'bg-error/15 text-error',
  warning: 'bg-warning/15 text-warning',
  info: 'bg-info/15 text-info',
  primary: 'bg-primary/15 text-primary',
  neutral: 'bg-base-content/10 text-base-content/70',
}

export const Badge: React.FC<BadgeProps> = ({
  tone = 'neutral',
  size = 'xs',
  className = '',
  title,
  children,
}) => (
  <span
    title={title}
    className={`badge badge-${size} border-0 font-medium tabular-nums ${TONE_CLASS[tone]} ${className}`}
  >
    {children}
  </span>
)
