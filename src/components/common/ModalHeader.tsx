import React from 'react'

interface ModalHeaderProps {
  title: React.ReactNode
  onClose: () => void
  /** Optional content rendered between title and close button (badges, status, etc.) */
  trailing?: React.ReactNode
  className?: string
}

/**
 * Standard modal/popover header — title on the left, optional trailing
 * content, then a circular ghost close button. Use for any dialog or
 * docked panel that has a title bar.
 */
export const ModalHeader: React.FC<ModalHeaderProps> = ({
  title,
  onClose,
  trailing,
  className = '',
}) => (
  <div
    className={`flex items-center justify-between gap-2 px-4 py-3 border-b border-base-300 ${className}`}
  >
    <h3 className="font-semibold text-sm min-w-0 truncate">{title}</h3>
    <div className="flex items-center gap-2 shrink-0">
      {trailing}
      <button
        type="button"
        className="btn btn-ghost btn-xs btn-circle"
        onClick={onClose}
        aria-label="Close"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  </div>
)
