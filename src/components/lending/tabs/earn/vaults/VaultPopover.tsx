import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Logo } from '../../../../common/Logo'
import type { VaultEntry } from '../../../../../sdk/vaults-helper'
import { PROVIDER_LABELS, formatSupplyRate, isSupplyRateMeaningful } from './helpers'
import { abbreviateUsd } from '../../../../../utils/format'

// ---------------------------------------------------------------------------
// Copy-to-clipboard row (mirrors AssetPopover's CopyRow)
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
      <span className="text-base-content/50 shrink-0 w-16">{label}</span>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-mono text-[10px] hover:text-primary transition-colors min-w-0"
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

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-base-content/50 shrink-0 w-16">{label}</span>
      <span className="font-medium truncate capitalize">{value}</span>
    </div>
  )
}

interface VaultPopoverProps {
  vault: VaultEntry
  chainId?: string
  /** Underlying token symbol / logo, used as fallbacks. */
  underlyingSymbol?: string
  underlyingLogo?: string
  children?: React.ReactNode
}

/**
 * Vault icon + children with a click-triggered popover showing the vault's
 * identity and classification (provider, curator, asset class, yield profile,
 * denomination), share price, APR, TVL, fee, and copiable addresses. Mirrors
 * the lending `AssetPopover` UX. Rendered via a portal so it escapes the
 * table's overflow:hidden.
 */
export const VaultPopover: React.FC<VaultPopoverProps> = ({
  vault,
  chainId,
  underlyingSymbol,
  underlyingLogo,
  children,
}) => {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  const triggerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const logo = vault.logoURI ?? underlyingLogo
  const sym = vault.symbol || vault.name

  const reposition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const popH = popoverRef.current?.offsetHeight ?? 300
    const popW = 240 // w-60
    const gap = 6
    const top = rect.bottom + gap + popH > window.innerHeight
      ? rect.top - gap - popH
      : rect.bottom + gap
    const left = Math.min(rect.left, window.innerWidth - popW - 8)
    setCoords({ top, left })
  }, [])

  const toggle = useCallback(() => {
    // Don't stop propagation — let the click bubble so the row still selects.
    if (visible) {
      setVisible(false)
      return
    }
    reposition()
    setVisible(true)
  }, [visible, reposition])

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

  useEffect(() => {
    if (!visible) return
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [visible, reposition])

  useEffect(() => {
    if (visible && popoverRef.current) reposition()
  }, [visible, reposition])

  const apr = isSupplyRateMeaningful(vault) ? formatSupplyRate(vault) : null

  return (
    <>
      <div
        ref={triggerRef}
        className="relative flex items-center gap-2 min-w-0 cursor-pointer select-none group"
        onClick={toggle}
        title="Click for vault details"
      >
        <div className="shrink-0 group-hover:opacity-75 transition-opacity">
          <Logo
            src={logo}
            alt={sym}
            fallbackText={sym}
            className="rounded-full object-contain w-6 h-6 token-logo"
          />
        </div>
        <div className="min-w-0 flex-1 group-hover:opacity-75 transition-opacity">{children}</div>
      </div>

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
              <div className="flex items-center gap-2 min-w-0">
                <Logo
                  src={logo}
                  alt={sym}
                  fallbackText={sym}
                  className="rounded-full w-5 h-5 shrink-0 token-logo"
                />
                <span className="font-semibold text-sm truncate">{sym}</span>
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

            {/* Fields */}
            <div className="px-3 py-2 space-y-1.5 text-xs">
              {vault.name && vault.name !== sym && <Field label="Name" value={vault.name} />}
              <Field label="Provider" value={PROVIDER_LABELS[vault.provider] ?? vault.provider} />
              {vault.curator && <Field label="Curator" value={vault.curator} />}
              {vault.assetGroup && <Field label="Class" value={vault.assetGroup} />}
              {vault.yieldProfile && <Field label="Profile" value={vault.yieldProfile} />}
              {vault.denomination && <Field label="Denom." value={vault.denomination} />}
              {chainId && <Field label="Chain" value={chainId} />}
              {apr && <Field label="APR" value={<span className="text-success">{apr}</span>} />}
              {(vault.sharePriceUsd != null || vault.sharePrice != null) && (
                <div className="flex items-start gap-2">
                  <span className="text-base-content/50 shrink-0 w-16">Share px</span>
                  <span className="font-medium tabular-nums">
                    {vault.sharePriceUsd != null
                      ? `$${vault.sharePriceUsd.toLocaleString(undefined, { maximumFractionDigits: 4 })}`
                      : `${vault.sharePrice!.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${underlyingSymbol ?? ''}`}
                  </span>
                </div>
              )}
              {vault.totalAssetsUsd != null && vault.totalAssetsUsd > 0 && (
                <Field label="TVL" value={<span className="tabular-nums">{abbreviateUsd(vault.totalAssetsUsd)}</span>} />
              )}
              {vault.fee != null && vault.fee > 0 && (
                <Field label="Fee" value={`${vault.fee.toFixed(2)}%`} />
              )}
              {underlyingSymbol && <Field label="Underlying" value={underlyingSymbol} />}
              <CopyRow label="Asset" value={vault.underlying} />
              <CopyRow label="Vault" value={vault.address} />
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
