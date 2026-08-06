import React from 'react'

/**
 * The single row primitive every term-sheet block renders through.
 *
 * Matches the existing `flex justify-between` + `tabular-nums` pattern already
 * used across the lending panels, so term sheets introduce no new visual
 * language — only a new data source.
 *
 * **Present-but-zero is stated, not hidden.** A `0` renders; only `undefined`
 * hides the row. That convention already exists in the fixed-term details
 * ("shown WHEN PRESENT, even at 0.00%, so 'no fee' is stated explicitly rather
 * than looking like missing data") and is generalized here to every block.
 */
export const TermRow: React.FC<{
  label: string
  /** Rendered right-aligned. `undefined` hides the whole row. */
  value?: React.ReactNode
  /** Tooltip on the label — where the "why does this matter" text lives. */
  hint?: string
  /** Emphasis for a value that carries risk. */
  tone?: 'default' | 'warn' | 'critical' | 'good'
  /** Full-width note under the row, for a consequence sentence. */
  note?: React.ReactNode
}> = ({ label, value, hint, tone = 'default', note }) => {
  if (value === undefined || value === null) return null

  const toneClass =
    tone === 'critical'
      ? 'text-error font-medium'
      : tone === 'warn'
        ? 'text-warning'
        : tone === 'good'
          ? 'text-success'
          : ''

  return (
    <div className="space-y-0.5">
      <div className="flex justify-between gap-3">
        <span className="text-base-content/60 shrink-0" title={hint}>
          {label}
        </span>
        <span className={`tabular-nums text-right ${toneClass}`}>{value}</span>
      </div>
      {note ? <div className="text-[10px] text-base-content/50">{note}</div> : null}
    </div>
  )
}

/** A labelled group of rows. Renders nothing when it has no visible children. */
export const TermSection: React.FC<{
  title: string
  children: React.ReactNode
}> = ({ title, children }) => {
  const hasContent = React.Children.toArray(children).some(Boolean)
  if (!hasContent) return null
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-base-content/40">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

/**
 * Explicit "not yet available" marker for a `coverage.pending` block.
 *
 * The point of rendering this at all: a missing oracle block must never read
 * as "this market has no oracle" when the truth is "we have not classified it
 * yet". Silence would be the wrong answer, not a neutral one.
 */
export const TermPending: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex justify-between gap-3">
    <span className="text-base-content/60">{label}</span>
    <span className="text-base-content/40 italic">not yet available</span>
  </div>
)
