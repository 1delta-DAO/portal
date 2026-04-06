import React, { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PoolRiskBreakdown } from '../../hooks/lending/useFlattenedPools'
import { riskDotColor } from './MarketsView/helpers'
import { useIsMobile } from '../../hooks/useIsMobile'
import { ModalHeader } from '../common/ModalHeader'

interface RiskBadgeProps {
  label: string
  breakdown: PoolRiskBreakdown[]
  size?: 'sm' | 'md'
}

function riskTextColor(label: string): string {
  switch (label) {
    case 'low':
      return 'text-success'
    case 'medium':
      return 'text-warning'
    case 'high':
      return 'text-error'
    case 'unknown':
      return 'text-base-content/40'
    default:
      return 'text-base-content/50'
  }
}

/** Body of the risk breakdown — shared between desktop popover and mobile modal. */
const RiskBreakdownContent: React.FC<{ breakdown: PoolRiskBreakdown[] }> = ({ breakdown }) => {
  const curators = [...new Set(breakdown.flatMap((b) => b.curatorIds ?? []))]
  return (
    <div className="flex flex-col gap-1.5">
      {breakdown.map((b) => (
        <div key={b.category}>
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-base-content/70 capitalize">{b.category}</span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${riskDotColor(b.label)}`} />
              <span className={`text-xs font-medium ${riskTextColor(b.label)}`}>{b.label}</span>
            </span>
          </div>
          {b.category === 'oracle' && b.description && (
            <div className="text-[10px] text-base-content/50 mt-0.5 ml-0.5">
              {b.description}
              {b.baseAsset && <span> (base: {b.baseAsset})</span>}
            </div>
          )}
        </div>
      ))}
      {curators.length > 0 && (
        <div className="flex items-start justify-between gap-4 pt-1 mt-0.5 border-t border-base-300">
          <span className="text-xs text-base-content/70 shrink-0">Curators</span>
          <span className="text-xs text-base-content/60 text-right wrap-break-word min-w-0">
            {curators.join(', ')}
          </span>
        </div>
      )}
    </div>
  )
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ label, breakdown, size = 'md' }) => {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    if (!triggerRef.current) return
    // On mobile we render a centered modal, no positioning needed.
    if (isMobile) {
      setOpen(true)
      return
    }
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.left })
    setOpen(true)
  }

  // Desktop only: reposition after the popover renders so we can measure it.
  React.useLayoutEffect(() => {
    if (isMobile || !open || !popoverRef.current || !triggerRef.current) return
    const popRect = popoverRef.current.getBoundingClientRect()
    const trigRect = triggerRef.current.getBoundingClientRect()
    const gap = 4
    let top = trigRect.bottom + gap
    let left = trigRect.left

    // Flip above if it would clip the bottom
    if (top + popRect.height > window.innerHeight) {
      top = trigRect.top - popRect.height - gap
    }
    // Nudge left if it would clip the right edge
    if (left + popRect.width > window.innerWidth) {
      left = window.innerWidth - popRect.width - 8
    }

    setPos({ top, left })
  }, [open, isMobile])

  const hide = () => {
    if (isMobile) return // mobile is dismissed via the close button / backdrop click
    closeTimer.current = setTimeout(() => setOpen(false), 150)
  }

  const keepOpen = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }

  const closeNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(false)
  }

  const isMd = size === 'md'
  const hasBreakdown = breakdown.length > 0

  return (
    <>
      <span
        ref={triggerRef}
        className={`inline-flex items-center ${hasBreakdown ? 'cursor-help' : ''} ${
          isMd ? 'gap-1.5 text-xs text-base-content/70' : 'gap-1 text-[10px] text-base-content/60'
        }`}
        onMouseEnter={hasBreakdown && !isMobile ? show : undefined}
        onMouseLeave={hasBreakdown && !isMobile ? hide : undefined}
        onClick={
          hasBreakdown
            ? (e) => {
                e.stopPropagation()
                show()
              }
            : undefined
        }
      >
        <span
          className={`rounded-full shrink-0 ${riskDotColor(label)} ${isMd ? 'w-2 h-2' : 'w-1.5 h-1.5'}`}
        />
        {label}
      </span>

      {open && hasBreakdown && isMobile &&
        createPortal(
          <div
            className="fixed inset-0 z-9999 flex items-center justify-center p-4"
            onClick={closeNow}
          >
            {/* backdrop */}
            <div className="absolute inset-0 bg-base-300/40 backdrop-blur-sm" />
            {/* sheet */}
            <div
              className="relative z-10 bg-base-100 border border-base-300 rounded-box shadow-lg w-full max-w-sm flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <ModalHeader title="Risk Breakdown" onClose={closeNow} />
              <div className="p-4">
                <RiskBreakdownContent breakdown={breakdown} />
              </div>
            </div>
          </div>,
          document.body
        )}

      {open && pos && hasBreakdown && !isMobile &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed z-9999 bg-base-100 border border-base-300 rounded-lg shadow-lg p-3 min-w-45 max-w-72"
            style={{ top: pos.top, left: pos.left }}
            onMouseEnter={keepOpen}
            onMouseLeave={hide}
          >
            <div className="text-[10px] font-semibold text-base-content/50 uppercase tracking-wider mb-2">
              Risk Breakdown
            </div>
            <RiskBreakdownContent breakdown={breakdown} />
          </div>,
          document.body
        )}
    </>
  )
}
