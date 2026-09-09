import React from 'react'

/**
 * Loading affordances that hold their contrast on every theme.
 *
 * The problem with the DaisyUI defaults these replace:
 *  - `loading loading-spinner` is a single mask painted in `currentColor`, so
 *    it inherits whatever the surrounding text color is. Inside a muted block
 *    (`text-base-content/50` and friends) that is a faint smudge on a dark
 *    ground, and with no track ring there is nothing to read it against.
 *  - `skeleton` is `bg-base-300`, a SURFACE token. The tonal step between
 *    base-100 and base-300 is deliberately tiny in the dark themes here
 *    (bloomberg: #000 → #1a1a1a) and inverted in the light ones, so the same
 *    block is nearly invisible on one theme and a grey slab on another.
 *
 * Both fixes are the same idea: derive the loading state from tokens whose
 * contrast against their background is already guaranteed — `base-content`
 * (the text color of that surface) and `primary` (the accent every theme
 * defines to pop) — instead of from a surface tone.
 */

const SPINNER_SIZE = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
} as const

interface SpinnerProps {
  size?: keyof typeof SPINNER_SIZE
  /**
   * `primary` (default) paints the arc in the theme accent over a muted track
   * — the standalone, on-a-panel case, where the ambient text color is often
   * muted and the spinner has to carry itself.
   *
   * `current` paints both in `currentColor` — for a spinner inside a button or
   * a colored chip, where the surrounding text is already the high-contrast
   * thing and an accent-colored spinner would fight it.
   */
  tone?: 'primary' | 'current'
  className?: string
  /** Announced to screen readers; also the hover title. */
  label?: string
}

/**
 * Indeterminate spinner: a full track ring plus a quarter arc. The track is
 * what makes it legible — a bare arc on a busy or low-contrast ground reads as
 * a stray mark, while a ring reads as a dial with something moving in it.
 */
export const Spinner: React.FC<SpinnerProps> = ({
  size = 'sm',
  tone = 'primary',
  className = '',
  label = 'Loading',
}) => (
  <svg
    viewBox="0 0 24 24"
    className={`${SPINNER_SIZE[size]} shrink-0 animate-spin ${className}`}
    role="status"
    aria-label={label}
  >
    <title>{label}</title>
    <circle
      cx="12"
      cy="12"
      r="9"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      className={tone === 'primary' ? 'text-base-content/20' : 'opacity-25'}
    />
    <path
      d="M12 3a9 9 0 0 1 9 9"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className={tone === 'primary' ? 'text-primary' : undefined}
    />
  </svg>
)

/**
 * A placeholder block for content that is loading, sized by the caller.
 *
 * Tinted from `base-content` rather than `base-300` so it is visible on the
 * page, on a card and on a lifted inner panel alike, with a sweep to say
 * "filling" rather than "empty". The sweep is a `::after` gradient (see
 * `.skeleton-sweep` in globals.css) and is disabled by the global
 * `prefers-reduced-motion` rule.
 */
export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`skeleton-sweep rounded-box bg-base-content/10 ${className}`}
    aria-hidden="true"
  />
)

/**
 * The standard "this whole panel is still loading" state: a centered spinner
 * with an optional line of text, at a height the caller sets so the block does
 * not resize when the content lands.
 */
export const LoadingBlock: React.FC<{
  label?: string
  size?: keyof typeof SPINNER_SIZE
  className?: string
}> = ({ label, size = 'md', className = 'py-12' }) => (
  <div className={`flex flex-col items-center justify-center gap-2 ${className}`}>
    <Spinner size={size} />
    {label ? <span className="text-xs text-base-content/50">{label}</span> : null}
  </div>
)
