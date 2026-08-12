import React from 'react'

interface ChevronProps {
  /** Open ⇒ points down; closed ⇒ points right. */
  open: boolean
  /** Size utilities. Defaults to the 16px used by the dropdown triggers. */
  className?: string
}

/**
 * Disclosure chevron — the standard affordance for "this expands".
 *
 * A real icon rather than the `▸` / `▾` text glyphs that had crept into the
 * collapsible panels: those render at the font's own weight, sit off the
 * baseline, and are small enough that the control read as decoration rather
 * than as a button. Same heroicons chevron-down the dropdown triggers use,
 * rotated instead of swapped so the direction change is legible as motion.
 */
export const Chevron: React.FC<ChevronProps> = ({ open, className = 'h-4 w-4' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
    className={`${className} shrink-0 transition-transform duration-150 ${
      open ? '' : '-rotate-90'
    }`}
  >
    <path
      fillRule="evenodd"
      d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
      clipRule="evenodd"
    />
  </svg>
)
