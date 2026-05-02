import React, { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PoolOwnerShare, PoolRiskBreakdown } from '../../../hooks/lending/useFlattenedPools'
import { riskDotColor } from '../tabs/earn/helpers'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { ModalHeader } from '../../common/ModalHeader'

// DaisyUI theme tokens — keep slice colors consistent with the rest of the app
// and re-color automatically on theme switch.
const PIE_PALETTE = [
  'var(--color-primary)',
  'var(--color-secondary)',
  'var(--color-accent)',
  'var(--color-info)',
  'var(--color-success)',
  'var(--color-warning)',
  'var(--color-error)',
]
const PIE_OTHERS_COLOR = 'var(--color-base-content)'

function shortOwner(owner: string): string {
  if (owner === 'others') return 'others'
  if (owner.startsWith('0x') && owner.length > 12) {
    return `${owner.slice(0, 6)}…${owner.slice(-4)}`
  }
  return owner
}

function sliceArcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const x1 = cx + r * Math.cos(startAngle)
  const y1 = cy + r * Math.sin(startAngle)
  const x2 = cx + r * Math.cos(endAngle)
  const y2 = cy + r * Math.sin(endAngle)
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0
  return `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`
}

const OWNER_LEGEND_COLLAPSED_LIMIT = 6

const OwnerDistributionChart: React.FC<{ distribution: PoolOwnerShare[] }> = ({ distribution }) => {
  // Sort descending by share so the biggest slices draw first and the legend
  // reads top-heavy. Keep "others" visually distinct even if it lands mid-list.
  const rows = [...distribution].sort((a, b) => b.share - a.share)
  const total = rows.reduce((s, r) => s + (r.share > 0 ? r.share : 0), 0)
  const [expanded, setExpanded] = useState(false)

  if (total <= 0) return null

  const size = 96
  const r = size / 2
  const cx = r
  const cy = r

  const colored = rows.map((row, i) => ({
    ...row,
    color: row.owner === 'others' ? PIE_OTHERS_COLOR : PIE_PALETTE[i % PIE_PALETTE.length],
  }))

  // Single-owner pools draw as a full disc; arc math can't represent a 2π sweep.
  const singleSlice = colored.length === 1 || colored[0].share / total >= 0.999

  let angle = -Math.PI / 2 // start at 12 o'clock
  const slices = singleSlice
    ? []
    : colored.map((row) => {
        const sweep = (row.share / total) * 2 * Math.PI
        const d = sliceArcPath(cx, cy, r, angle, angle + sweep)
        angle += sweep
        return { d, color: row.color, key: row.owner }
      })

  const canCollapse = colored.length > OWNER_LEGEND_COLLAPSED_LIMIT
  const visible = canCollapse && !expanded
    ? colored.slice(0, OWNER_LEGEND_COLLAPSED_LIMIT)
    : colored
  const hiddenCount = colored.length - visible.length

  return (
    <div className="flex items-start gap-3 mt-1">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0"
        aria-label="Owner distribution pie chart"
      >
        {singleSlice ? (
          <circle cx={cx} cy={cy} r={r} fill={colored[0].color} />
        ) : (
          slices.map((s) => <path key={s.key} d={s.d} fill={s.color} />)
        )}
      </svg>
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <ul className="flex flex-col gap-0.5 text-[10px] min-w-0">
          {visible.map((row) => (
            <li key={row.owner} className="flex items-center justify-between gap-2 min-w-0">
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-sm shrink-0"
                  style={{ backgroundColor: row.color }}
                />
                <span
                  className="font-mono text-base-content/70 truncate"
                  title={row.owner}
                >
                  {shortOwner(row.owner)}
                </span>
              </span>
              <span className="text-base-content/60 shrink-0 tabular-nums">
                {(row.share * 100).toFixed(2)}%
              </span>
            </li>
          ))}
        </ul>
        {canCollapse && (
          <button
            type="button"
            className="text-[10px] text-base-content/60 hover:text-base-content self-start underline underline-offset-2"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((v) => !v)
            }}
          >
            {expanded ? 'Show less' : `Show ${hiddenCount} more`}
          </button>
        )}
      </div>
    </div>
  )
}

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
          {b.category === 'concentration' && b.ownerDistribution && b.ownerDistribution.length > 0 && (
            <OwnerDistributionChart distribution={b.ownerDistribution} />
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
          // React events bubble through the React tree, not the DOM tree —
          // so without stopPropagation here, taps on the backdrop (and any
          // tap inside the portal that isn't caught by the sheet's own
          // stopPropagation) would bubble back up through <RiskBadge> →
          // <td> → <tr onClick> and end up selecting the row underneath.
          <div
            className="fixed inset-0 z-9999 flex items-center justify-center p-4"
            onClick={(e) => {
              e.stopPropagation()
              closeNow()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
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
