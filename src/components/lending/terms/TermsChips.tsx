import React from 'react'
import { rankedTags, severityBadgeClass, severityOfTag } from './severity'
import { tagLabel } from './format'
import type { AnyTermSheet, TermSide } from './types'

/**
 * The **scan**-depth surface: 2–3 severity-ordered tags.
 *
 * Tags come from the API already derived from the structured fields, so a chip
 * can never contradict the numbers next to it. Unknown tags de-kebab into a
 * neutral chip rather than being dropped — a newer API emitting a tag this
 * build predates must degrade, not disappear.
 */
export const TermsChips: React.FC<{
  sheet: AnyTermSheet | undefined
  side: TermSide
  limit?: number
  className?: string
}> = ({ sheet, side, limit = 3, className }) => {
  if (!sheet?.[side]) return null

  const tags = rankedTags(sheet, side)
    // `info` tags are noise at this depth — the point of a chip is difference.
    .filter((t) => severityOfTag(t) !== 'info')
    .slice(0, limit)

  if (tags.length === 0) return null

  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ''}`}>
      {tags.map((tag) => (
        <span
          key={String(tag)}
          className={`rounded border px-1 py-px text-[9px] leading-tight ${severityBadgeClass(
            severityOfTag(tag)
          )}`}
        >
          {tagLabel(tag)}
        </span>
      ))}
    </div>
  )
}
