import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IrmDetailsButton } from './IrmDock'

// ---------------------------------------------------------------------------
// Reusable copy-to-clipboard row
// ---------------------------------------------------------------------------

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const short = `${value.slice(0, 6)}…${value.slice(-4)}`

  const copy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(value)
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1500)
  }, [value])

  return (
    <div className="flex items-start gap-2">
      <span className="text-base-content/50 shrink-0 w-14">{label}</span>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-mono text-[11px] hover:text-primary transition-colors min-w-0"
        onClick={copy}
        title={`Copy ${label.toLowerCase()}: ${value}`}
      >
        {copied ? (
          <span className="text-success font-sans">Copied!</span>
        ) : (
          <>
            {short}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 opacity-40 shrink-0"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          </>
        )}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------

function formatPrice(v: number): string {
  if (v >= 1) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  if (v >= 0.01) return `$${v.toFixed(4)}`
  return `$${v.toPrecision(4)}`
}

interface AssetPopoverProps {
  address?: string
  name: string
  symbol: string
  logoURI?: string
  children?: React.ReactNode
  positionDot?: boolean
  marketUid?: string
  marketName?: string
  currentUtilization?: number
  currentDepositRate?: number
  currentBorrowRate?: number
  /** Market price (from price feed) */
  priceUsd?: number
  /** Oracle price in USD */
  oraclePriceUsd?: number
  /** Chain ID for display */
  chainId?: string
}

/**
 * Inline asset icon + children with a click-triggered popover showing
 * address (copiable), name and symbol.
 *
 * The popover is rendered via a React portal so it escapes
 * overflow:hidden containers (tables, cards) and stays interactive.
 */
export const AssetPopover: React.FC<AssetPopoverProps> = ({
  address,
  name,
  symbol,
  logoURI,
  children,
  positionDot,
  marketUid,
  marketName,
  currentUtilization,
  currentDepositRate,
  currentBorrowRate,
  priceUsd,
  oraclePriceUsd,
  chainId,
}) => {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  const triggerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const reposition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const popH = popoverRef.current?.offsetHeight ?? 280
    const popW = 240 // w-60 = 15rem = 240px
    const gap = 6
    const top = rect.bottom + gap + popH > window.innerHeight
      ? rect.top - gap - popH
      : rect.bottom + gap
    const left = Math.min(rect.left, window.innerWidth - popW - 8)
    setCoords({ top, left })
  }, [])

  const toggle = useCallback((e: React.MouseEvent) => {
    // Don't stop propagation — let the click bubble up so parent row
    // handlers (e.g. market selection) still fire.
    if (visible) {
      setVisible(false)
      return
    }
    reposition()
    setVisible(true)
  }, [visible, reposition])

  // Close on outside click
  useEffect(() => {
    if (!visible) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (!triggerRef.current?.contains(t) && !popoverRef.current?.contains(t)) {
        setVisible(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [visible])

  // Reposition on scroll / resize while visible
  useEffect(() => {
    if (!visible) return
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [visible, reposition])

  // Re-measure once the popover mounts so flip logic uses actual height
  useEffect(() => {
    if (visible && popoverRef.current) reposition()
  }, [visible, reposition])

  return (
    <>
      <div
        ref={triggerRef}
        className="relative flex items-center gap-2 min-w-0 cursor-pointer select-none group"
        onClick={toggle}
        title="Click for details"
      >
        {/* Icon */}
        <div className="relative shrink-0 group-hover:opacity-75 transition-opacity">
          {logoURI ? (
            <img
              src={logoURI}
              width={24}
              height={24}
              alt={symbol}
              className="rounded-full object-contain w-6 h-6 token-logo"
            />
          ) : (
            <div className="bg-base-300 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
              {(symbol || name || '?').charAt(0)}
            </div>
          )}
          {positionDot && (
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-base-100" />
          )}
        </div>

        {/* Label content */}
        <div className="min-w-0 flex-1 group-hover:opacity-75 transition-opacity">{children}</div>
      </div>

      {/* Portal popover */}
      {visible &&
        coords &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed z-9999 shadow-xl bg-base-200 rounded-box w-60 border border-base-300 animate-in fade-in zoom-in-95 duration-100 origin-top-left"
            style={{ top: coords.top, left: coords.left }}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2 border-b border-base-300">
              <div className="flex items-center gap-2">
                {logoURI && (
                  <img
                    src={logoURI}
                    width={20}
                    height={20}
                    alt={symbol}
                    className="rounded-full w-5 h-5 shrink-0 token-logo"
                  />
                )}
                <span className="font-semibold text-sm">{symbol}</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-circle -mr-1"
                onClick={(e) => { e.stopPropagation(); setVisible(false) }}
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Labeled fields */}
            <div className="px-3 py-2 space-y-1.5 text-xs">
              {marketName && (
                <div className="flex items-start gap-2">
                  <span className="text-base-content/50 shrink-0 w-14">Market</span>
                  <span className="font-medium truncate">{marketName}</span>
                </div>
              )}
              <div className="flex items-start gap-2">
                <span className="text-base-content/50 shrink-0 w-14">Symbol</span>
                <span className="font-medium">{symbol}</span>
              </div>
              {name && name !== symbol && (
                <div className="flex items-start gap-2">
                  <span className="text-base-content/50 shrink-0 w-14">Name</span>
                  <span className="font-medium truncate">{name}</span>
                </div>
              )}
              {chainId && (
                <div className="flex items-start gap-2">
                  <span className="text-base-content/50 shrink-0 w-14">Chain</span>
                  <span className="font-medium">{chainId}</span>
                </div>
              )}
              {address && (
                <CopyRow label="Address" value={address} />
              )}
              {(priceUsd != null || oraclePriceUsd != null) && (
                <div className="flex items-start gap-2">
                  <span className="text-base-content/50 shrink-0 w-14">Price</span>
                  <div className="flex flex-col gap-0.5">
                    {priceUsd != null && (
                      <span className="font-medium tabular-nums">
                        {formatPrice(priceUsd)}
                        <span className="text-base-content/40 font-normal ml-1">market</span>
                      </span>
                    )}
                    {oraclePriceUsd != null && (
                      <span className="font-medium tabular-nums">
                        {formatPrice(oraclePriceUsd)}
                        <span className="text-base-content/40 font-normal ml-1">oracle</span>
                      </span>
                    )}
                  </div>
                </div>
              )}
              {marketUid && (
                <>
                  <CopyRow label="Mkt ID" value={marketUid} />
                  <div className="flex items-start gap-2 pt-1">
                    <span className="text-base-content/50 shrink-0 w-14">Details</span>
                    <IrmDetailsButton
                      marketUid={marketUid}
                      marketName={marketName ?? name}
                      currentUtilization={currentUtilization}
                      currentDepositRate={currentDepositRate}
                      currentBorrowRate={currentBorrowRate}
                    />
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
