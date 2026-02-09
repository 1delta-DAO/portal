import React, { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PoolExposure } from '../../../hooks/lending/useFlattenedPools'

interface ExposureCellProps {
  exposures: PoolExposure[]
  chainTokens: Record<string, any>
}

function collectUnique(exposures: PoolExposure[], side: 'collaterals' | 'debts'): string[] {
  const set = new Set<string>()
  for (const ex of exposures) {
    const list = side === 'collaterals' ? ex.collaterals : ex.debts
    list?.forEach((a) => set.add(a.toLowerCase()))
  }
  return Array.from(set)
}

const ICON_SIZE = 16
const OVERLAP = -4
const MAX_INLINE = 2

/**
 * Single-column exposure cell showing collaterals and debts as two rows
 * of overlapping token icons with click-to-expand popover.
 */
export const ExposureCell: React.FC<ExposureCellProps> = ({ exposures, chainTokens }) => {
  const collaterals = useMemo(() => collectUnique(exposures, 'collaterals'), [exposures])
  const debts = useMemo(() => collectUnique(exposures, 'debts'), [exposures])

  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLSpanElement | null>(null)

  const openPopover = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.left })
    setOpen(true)
  }

  const closePopover = () => setOpen(false)

  if (collaterals.length === 0 && debts.length === 0) {
    return <span className="text-xs text-base-content/40">&mdash;</span>
  }

  const renderIcon = (addr: string, idx: number) => {
    const token = chainTokens[addr] ?? chainTokens[addr.toLowerCase()]
    const symbol = token?.symbol ?? `${addr.slice(0, 6)}...`
    return (
      <span
        key={addr}
        title={`${symbol}\n${addr}`}
        className="inline-block rounded-full border border-base-100"
        style={{ marginLeft: idx === 0 ? 0 : OVERLAP, zIndex: idx }}
      >
        {token?.logoURI ? (
          <img
            src={token.logoURI}
            width={ICON_SIZE}
            height={ICON_SIZE}
            alt={symbol}
            className="rounded-full object-cover"
            style={{ width: ICON_SIZE, height: ICON_SIZE }}
          />
        ) : (
          <span
            className="bg-base-300 rounded-full flex items-center justify-center text-[8px] font-bold"
            style={{ width: ICON_SIZE, height: ICON_SIZE }}
          >
            {symbol.charAt(0)}
          </span>
        )}
      </span>
    )
  }

  const renderRow = (label: string, addrs: string[]) => {
    if (addrs.length === 0) return null
    const inline = addrs.slice(0, MAX_INLINE)
    const extra = addrs.length - MAX_INLINE
    return (
      <div className="flex items-center gap-1">
        <span className="text-[9px] text-base-content/50 w-3.5 shrink-0">{label}</span>
        <div className="flex items-center">
          {inline.map(renderIcon)}
          {extra > 0 && (
            <span
              ref={triggerRef}
              className="text-[9px] text-base-content/60 cursor-pointer ml-0.5"
              onClick={openPopover}
            >
              +{extra}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-0.5">
        {renderRow('C', collaterals)}
        {renderRow('D', debts)}
      </div>

      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-90" onClick={closePopover} />
            <div
              className="fixed z-100 shadow-lg bg-base-100 rounded-box p-2 max-w-xs max-h-60 overflow-auto border border-base-300"
              style={{ top: pos.top, left: pos.left }}
            >
              {collaterals.length > 0 && (
                <div className="mb-1">
                  <span className="text-[10px] font-semibold text-base-content/60">Collaterals</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {collaterals.map((a, i) => renderIcon(a, i))}
                  </div>
                </div>
              )}
              {debts.length > 0 && (
                <div>
                  <span className="text-[10px] font-semibold text-base-content/60">Debts</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {debts.map((a, i) => renderIcon(a, i))}
                  </div>
                </div>
              )}
            </div>
          </>,
          document.body
        )}
    </>
  )
}
