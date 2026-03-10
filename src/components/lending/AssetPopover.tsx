import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface AssetPopoverProps {
  address?: string
  name: string
  symbol: string
  logoURI?: string
  /** Content rendered next to the icon (labels, sub-text, etc.) */
  children?: React.ReactNode
  /** Optional position indicator dot */
  positionDot?: boolean
}

/** Delay (ms) before the popover hides after mouse leaves */
const HIDE_DELAY = 250

/**
 * Inline asset icon + children with a hover popover showing
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
}) => {
  const [copied, setCopied] = useState(false)
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  const copyTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

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

  const show = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setCoords({ top: rect.bottom + 4, left: rect.left })
    }
    setVisible(true)
  }, [])

  const scheduleHide = useCallback(() => {
    hideTimer.current = setTimeout(() => setVisible(false), HIDE_DELAY)
  }, [])

  const cancelHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }, [])

  // Reposition on scroll / resize while visible
  useEffect(() => {
    if (!visible) return
    const reposition = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        setCoords({ top: rect.bottom + 4, left: rect.left })
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
      if (hideTimer.current) clearTimeout(hideTimer.current)
      if (copyTimer.current) clearTimeout(copyTimer.current)
    }
  }, [])

  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''

  return (
    <>
      <div
        ref={triggerRef}
        className="relative flex items-center gap-2 min-w-0"
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
      >
        {/* Icon */}
        <div className="relative shrink-0">
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

        {/* Label content — allowed to truncate freely */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>

      {/* Portal popover */}
      {visible &&
        coords &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed z-[9999] shadow-lg bg-base-200 rounded-box w-60 border border-base-300 animate-in fade-in duration-150"
            style={{ top: coords.top, left: coords.left }}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-base-300">
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
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
