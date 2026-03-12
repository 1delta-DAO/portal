import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IrmDetailsButton } from './IrmDock'

interface AssetPopoverProps {
  address?: string
  name: string
  symbol: string
  logoURI?: string
  /** Content rendered next to the icon (labels, sub-text, etc.) */
  children?: React.ReactNode
  /** Optional position indicator dot */
  positionDot?: boolean
  /** If provided, shows an IRM details link in the popover */
  marketUid?: string
  /** Market name for the IRM panel header */
  marketName?: string
  /** Current utilization ratio 0–1 for the IRM chart */
  currentUtilization?: number
  /** Current deposit APR (%) to show in the IRM panel */
  currentDepositRate?: number
  /** Current borrow APR (%) to show in the IRM panel */
  currentBorrowRate?: number
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
}) => {
  const [copied, setCopied] = useState(false)
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  const copyTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (visible) {
      setVisible(false)
      return
    }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setCoords({ top: rect.bottom + 6, left: rect.left })
    }
    setVisible(true)
  }, [visible])

  const copyAddress = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!address) return
      navigator.clipboard.writeText(address)
      setCopied(true)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 1500)
    },
    [address]
  )

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
    const reposition = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        setCoords({ top: rect.bottom + 6, left: rect.left })
      }
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [visible])

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current)
    }
  }, [])

  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''

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
              className="rounded-full object-contain w-6 h-6"
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
                    className="rounded-full w-5 h-5 shrink-0"
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
              {address && (
                <div className="flex items-start gap-2">
                  <span className="text-base-content/50 shrink-0 w-14">Address</span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-mono text-[11px] hover:text-primary transition-colors min-w-0"
                    onClick={copyAddress}
                    title="Copy address"
                  >
                    {copied ? (
                      <span className="text-success font-sans">Copied!</span>
                    ) : (
                      <>
                        {short}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="w-3 h-3 opacity-40 shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              )}
              {marketUid && (
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
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
