import React from 'react'

interface PresetButtonProps {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  className?: string
  title?: string
}

/**
 * Compact ghost button used for preset values (amount %, slippage %, etc.).
 * Replaces the duplicated `btn btn-ghost btn-xs px-1.5 py-0 h-5 min-h-0 text-[10px]`
 * pattern in AmountQuickButtons + SlippageInput so the two stay visually in sync.
 */
export const PresetButton: React.FC<PresetButtonProps> = ({
  children,
  onClick,
  active,
  className = '',
  title,
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`btn btn-ghost btn-xs px-1.5 py-0 h-5 min-h-0 text-[10px] ${
      active ? 'btn-active' : ''
    } ${className}`}
  >
    {children}
  </button>
)
