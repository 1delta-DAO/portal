import React, { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PoolTerm } from '../../../hooks/lending/useFlattenedPools'

/**
 * Borrow-side APR cell for brokered (Lista) markets. The raw `variableBorrowRate`
 * is 0 and misleading, so show a stacked "Fixed" pill over the cheapest term
 * ("from X%"), and reveal the full rate card on hover.
 *
 * The hover panel renders through a portal (like {@link RiskBadge}) so it isn't
 * clipped by the table's `overflow-hidden` cells.
 */
export const BrokeredAprCell: React.FC<{ terms?: PoolTerm[] | null }> = ({ terms }) => {
  const list = terms ?? []
  const bestApr = list.length ? Math.min(...list.map((t) => t.apr)) : null
  const triggerRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const show = () => {
    if (!triggerRef.current || list.length === 0) return
    const r = triggerRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left })
  }
  const hide = () => setPos(null)

  return (
    <div
      ref={triggerRef}
      className="inline-flex flex-col items-start gap-0.5 cursor-help"
      onMouseEnter={show}
      onMouseLeave={hide}
      title={list.length === 0 ? 'Fixed-term borrowing only — variable borrow unavailable' : undefined}
    >
      <span className="badge badge-xs bg-warning/20 text-warning border-0 font-medium">Fixed</span>
      {bestApr != null && (
        <span className="text-xs font-medium tabular-nums text-warning whitespace-nowrap">
          from {bestApr.toFixed(2)}%
        </span>
      )}

      {pos &&
        list.length > 0 &&
        createPortal(
          <div
            className="fixed z-[100] rounded-lg border border-base-300 bg-base-100 shadow-xl p-1.5 min-w-[7.5rem]"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="text-[10px] uppercase tracking-wide text-base-content/40 px-1 pb-1">
              Fixed terms
            </div>
            <div className="space-y-0.5">
              {list.map((t) => (
                <div
                  key={t.termId}
                  className="flex items-center justify-between gap-4 px-1 text-[11px]"
                >
                  <span className="text-base-content/70">{t.durationDays}-day</span>
                  <span className="font-mono tabular-nums text-warning">{t.apr.toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
