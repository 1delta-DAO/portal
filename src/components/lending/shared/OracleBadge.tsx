import React, { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { OracleBand, PoolOracleInfo, PoolOracleFeed } from '../../../hooks/lending/useFlattenedPools'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { ModalHeader } from '../../common/ModalHeader'

/** Map an oracle risk band to a DaisyUI dot color. */
function bandDotColor(band: OracleBand): string {
  switch (band) {
    case 'LOW':
      return 'bg-success'
    case 'MEDIUM':
      return 'bg-warning'
    case 'HIGH':
      return 'bg-error'
    case 'CRITICAL':
      return 'bg-error'
    default:
      return 'bg-base-content/20'
  }
}

/** Map an oracle risk band to a DaisyUI text color. */
function bandTextColor(band: OracleBand): string {
  switch (band) {
    case 'LOW':
      return 'text-success'
    case 'MEDIUM':
      return 'text-warning'
    case 'HIGH':
    case 'CRITICAL':
      return 'text-error'
    default:
      return 'text-base-content/50'
  }
}

function shortAddress(addr: string): string {
  if (addr.startsWith('0x') && addr.length > 12) {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`
  }
  return addr
}

const CopyAddressButton: React.FC<{ address: string }> = ({ address }) => {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(address)
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1200)
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 text-base-content/40 hover:text-primary transition-colors"
      title={copied ? 'Copied!' : `Copy ${address}`}
      aria-label={`Copy ${address}`}
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-success"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  )
}

/** A yes / no / unknown indicator for a boolean-or-null feed property. */
const CheckFlag: React.FC<{ value: boolean | null; label: string }> = ({ value, label }) => {
  const text = value === null ? 'unknown' : value ? 'yes' : 'no'
  const color =
    value === null ? 'text-base-content/40' : value ? 'text-success' : 'text-error'
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[11px] text-base-content/70">{label}</span>
      <span className={`text-[11px] font-medium ${color}`}>{text}</span>
    </div>
  )
}

/** One feed's detail block. */
const FeedBlock: React.FC<{ feed: PoolOracleFeed }> = ({ feed }) => {
  return (
    <div className="flex flex-col gap-1 pt-2 first:pt-0 border-t border-base-300 first:border-0">
      {/* Provider + asset + band */}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 min-w-0">
          {feed.provider && (
            <span className="text-xs font-medium capitalize truncate">{feed.provider}</span>
          )}
          {feed.asset && (
            <span className="text-[11px] text-base-content/60 truncate">{feed.asset}</span>
          )}
          {feed.fixedRate && (
            <span className="badge badge-xs bg-base-content/10 border-0 text-base-content/60">
              fixed
            </span>
          )}
        </span>
        <span className="inline-flex items-center gap-1.5 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${bandDotColor(feed.band)}`} />
          <span className={`text-[11px] font-medium ${bandTextColor(feed.band)}`}>
            {feed.band}
          </span>
        </span>
      </div>

      {/* Reported vs intended pair */}
      {(feed.priceDescription || feed.intendedPair) && (
        <div className="flex flex-col gap-0.5 text-[11px]">
          {feed.priceDescription && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-base-content/50">reports</span>
              <span className="font-mono text-base-content/80 truncate">{feed.priceDescription}</span>
            </div>
          )}
          {feed.intendedPair && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-base-content/50">expected</span>
              <span className="font-mono text-base-content/80 truncate">{feed.intendedPair}</span>
            </div>
          )}
        </div>
      )}

      <CheckFlag value={feed.correctOracle} label="Correct asset" />
      <CheckFlag value={feed.denominatorMatch} label="Numeraire match" />

      <div className="flex items-center justify-between gap-4">
        <span className="text-[11px] text-base-content/70">Score</span>
        <span className={`text-[11px] font-medium tabular-nums ${bandTextColor(feed.band)}`}>
          {feed.score}/100
        </span>
      </div>

      {feed.flags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {feed.flags.map((f) => (
            <span
              key={f}
              className="badge badge-xs bg-error/10 text-error border-0 font-mono"
            >
              {f}
            </span>
          ))}
        </div>
      )}

      {feed.oracle && (
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="font-mono text-[10px] text-base-content/50 truncate" title={feed.oracle}>
            {shortAddress(feed.oracle)}
          </span>
          <CopyAddressButton address={feed.oracle} />
        </div>
      )}
    </div>
  )
}

/** Body of the oracle breakdown — shared between desktop popover and mobile modal. */
const OracleFeedsContent: React.FC<{ oracleInfo: PoolOracleInfo }> = ({ oracleInfo }) => {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-base-content/70">Worst feed</span>
        <span className="inline-flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${bandDotColor(oracleInfo.worstBand)}`} />
          <span className={`text-xs font-medium ${bandTextColor(oracleInfo.worstBand)}`}>
            {oracleInfo.worstBand} · {oracleInfo.worstScore}/100
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {oracleInfo.feeds.map((feed, i) => (
          <FeedBlock key={feed.oracle ?? `${feed.provider}-${i}`} feed={feed} />
        ))}
      </div>
    </div>
  )
}

interface OracleBadgeProps {
  oracleInfo: PoolOracleInfo
  size?: 'sm' | 'md'
}

export const OracleBadge: React.FC<OracleBadgeProps> = ({ oracleInfo, size = 'md' }) => {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    if (!triggerRef.current) return
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

    if (top + popRect.height > window.innerHeight) {
      top = trigRect.top - popRect.height - gap
    }
    if (left + popRect.width > window.innerWidth) {
      left = window.innerWidth - popRect.width - 8
    }

    setPos({ top, left })
  }, [open, isMobile])

  const hide = () => {
    if (isMobile) return
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

  return (
    <>
      <span
        ref={triggerRef}
        className={`inline-flex items-center cursor-help ${
          isMd ? 'gap-1.5 text-xs text-base-content/70' : 'gap-1 text-[10px] text-base-content/60'
        }`}
        onMouseEnter={!isMobile ? show : undefined}
        onMouseLeave={!isMobile ? hide : undefined}
        onClick={(e) => {
          e.stopPropagation()
          show()
        }}
      >
        {/* signal / oracle feed icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 ${bandTextColor(oracleInfo.worstBand)} ${isMd ? 'w-3.5 h-3.5' : 'w-3 h-3'}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M4.93 19.07a10 10 0 010-14.14" />
          <path d="M7.76 16.24a6 6 0 010-8.49" />
          <path d="M16.24 7.76a6 6 0 010 8.49" />
          <path d="M19.07 4.93a10 10 0 010 14.14" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        </svg>
        Oracle
      </span>

      {open && isMobile &&
        createPortal(
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
              <ModalHeader title="Oracle Feeds" onClose={closeNow} />
              <div className="p-4">
                <OracleFeedsContent oracleInfo={oracleInfo} />
              </div>
            </div>
          </div>,
          document.body
        )}

      {open && pos && !isMobile &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed z-9999 bg-base-100 border border-base-300 rounded-lg shadow-lg p-3 min-w-56 max-w-80"
            style={{ top: pos.top, left: pos.left }}
            onMouseEnter={keepOpen}
            onMouseLeave={hide}
          >
            <div className="text-[10px] font-semibold text-base-content/50 uppercase tracking-wider mb-2">
              Oracle Feeds
            </div>
            <OracleFeedsContent oracleInfo={oracleInfo} />
          </div>,
          document.body
        )}
    </>
  )
}
