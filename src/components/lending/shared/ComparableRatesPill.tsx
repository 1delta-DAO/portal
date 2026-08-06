import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useComparableRates,
  type ComparableRate,
  type ComparableRatesParams,
} from '../../../hooks/lending/useComparableRates'
import type { LenderInfo } from '../../../hooks/lending/useFlattenedPools'
import { LenderBadge } from './LenderBadge'

/**
 * "What would this cost elsewhere?" — a compact pill next to a borrow (or
 * supply) rate that opens the N best comparable venues for the same pair, priced
 * at the entered size and holding horizon.
 *
 * The pill itself only ever states the headline delta; every caveat that makes a
 * cross-venue rate comparison honest lives one hover away:
 *
 *  - a **fixed** rate is chipped with its remaining term, and marked `Locked`
 *    only when it is locked for the WHOLE horizon (a 4-week term over a 90-day
 *    hold is not — it has to be rolled, and the row says so);
 *  - a venue that cannot fund the entered size shows `capped` and sits below
 *    every venue that can, however good its rate looks;
 *  - a rate that is not obtainable right now (a Term repo between auction
 *    rounds quotes its LAST clearing rate) is hidden by default and, when
 *    shown, is labelled `last clearing` rather than rendered as a live quote.
 *
 * Reusable across every borrow-related surface: pass the pair, the amount and
 * the venue the user is currently on (`referenceMarketUid`) and it does the rest.
 */

interface Props {
  chainId: string
  /** Debt asset address — the borrowed side. */
  debtAddress?: string
  /** Collateral asset address. Omit to compare regardless of collateral. */
  collateralAddress?: string
  side?: 'borrow' | 'supply'
  /** Entered size in TOKEN units of the priced leg. Optional — 0 prices at spot. */
  amount?: number
  /** Holding period the comparison is normalized to. Defaults to the term
   *  length when one is passed, else a year. */
  horizonDays?: number
  /** The market the user is on — excluded from the list and shown as the anchor. */
  referenceMarketUid?: string
  referenceTermId?: string
  /**
   * The current venue's rate as a PERCENT (e.g. 4.04). Optimizer rows carry
   * fractions — multiply by 100 at the call site. Falls back to the server's
   * `reference` row when omitted.
   */
  currentAprPct?: number
  limit?: number
  lenderInfoMap?: Record<string, LenderInfo>
  className?: string
}

const fmtPct = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(2)}%`

const fmtDelta = (v: number): string => `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`

/** Compact remaining-term chip: 28d → "4W", 90d → "3M", 400d → "1.1Y". */
function termChip(days: number | null): string | null {
  if (days == null || !Number.isFinite(days) || days <= 0) return null
  if (days < 14) return `${Math.round(days)}D`
  if (days < 60) return `${Math.round(days / 7)}W`
  if (days < 365) return `${Math.round(days / 30)}M`
  return `${(days / 365).toFixed(1)}Y`
}

function maturityLabel(maturity: number | null): string | null {
  if (!maturity) return null
  return new Date(maturity * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

/** The rate to display for a row: horizon-normalized, else at-size, else sticker. */
const displayRate = (r: ComparableRate): number | null =>
  r.effectiveAprPct ?? r.aprAtAmountPct ?? r.aprPct

export function ComparableRatesPill({
  chainId,
  debtAddress,
  collateralAddress,
  side = 'borrow',
  amount,
  horizonDays,
  referenceMarketUid,
  referenceTermId,
  currentAprPct,
  limit = 5,
  lenderInfoMap,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const params = useMemo<ComparableRatesParams>(
    () => ({
      chainId,
      debt: debtAddress,
      collateral: collateralAddress,
      side,
      amount,
      horizonDays,
      limit,
      referenceMarketUid,
      referenceTermId,
      // Unobtainable quotes are fetched so the panel can EXPLAIN a missing
      // venue ("Term is between rounds") instead of silently omitting it; they
      // are always rendered as historical and never as the headline.
      includeUnobtainable: true,
    }),
    [
      chainId,
      debtAddress,
      collateralAddress,
      side,
      amount,
      horizonDays,
      limit,
      referenceMarketUid,
      referenceTermId,
    ]
  )

  const { data, isFetching, error } = useComparableRates(params)

  // Only rates you can actually take set the headline.
  const live = useMemo(() => (data?.items ?? []).filter((i) => i.obtainable), [data])
  const unobtainable = useMemo(() => (data?.items ?? []).filter((i) => !i.obtainable), [data])
  const best = live[0] ?? null

  const anchorPct =
    currentAprPct ?? (data?.reference ? (displayRate(data.reference) ?? null) : null)
  const bestPct = best ? displayRate(best) : null
  // For a borrow a lower rate is better; for a supply, higher.
  const delta =
    anchorPct != null && bestPct != null
      ? side === 'borrow'
        ? bestPct - anchorPct
        : anchorPct - bestPct
      : null
  const beatsCurrent = delta != null && delta < -0.005

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }, [])
  // Small grace period so the pointer can travel from the pill to the panel.
  const scheduleClose = useCallback(() => {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpen(false), 120)
  }, [cancelClose])

  useEffect(() => () => cancelClose(), [cancelClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  // The collateral the server compared against, when the caller pinned none.
  // Single-chain queries yield exactly one basis; a cross-chain query can differ
  // per chain, in which case each row's own collateral is the honest label.
  const basisGroups = useMemo(
    () => [...new Set(Object.values(data?.collateralBasis ?? {}))],
    [data]
  )
  const basisLabel = !collateralAddress && basisGroups.length === 1 ? basisGroups[0] : null
  const showCollateral = !collateralAddress && basisGroups.length !== 1

  const count = live.length
  if (!debtAddress && side === 'borrow') return null
  if (!count && !isFetching && !unobtainable.length) return null

  return (
    <div
      ref={wrapRef}
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => {
        cancelClose()
        setOpen(true)
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] leading-none transition-colors cursor-pointer ${
          beatsCurrent
            ? 'border-success/40 bg-success/10 text-success hover:bg-success/20'
            : 'border-base-300 bg-base-200/60 text-base-content/70 hover:bg-base-200'
        }`}
        title={`Comparable ${side} rates for this pair`}
      >
        {isFetching && !count ? (
          <span className="loading loading-spinner loading-xs" />
        ) : (
          <>
            <span className="font-mono tabular-nums">{fmtPct(bestPct)}</span>
            {delta != null && beatsCurrent && (
              <span className="font-mono tabular-nums opacity-80">{fmtDelta(delta)}</span>
            )}
            <span className="opacity-60">{beatsCurrent ? 'elsewhere' : `${count} comparable`}</span>
          </>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute right-0 top-full z-30 mt-1 w-[340px] rounded-lg border border-base-300 bg-base-100 p-2 shadow-xl"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-semibold">
              Comparable {side === 'borrow' ? 'borrow' : 'supply'} rates
            </span>
            <span className="text-[9px] text-base-content/50">
              {data?.horizonDays != null ? `over ${Math.round(data.horizonDays)}d` : ''}
              {amount ? ` · at ${fmtAmount(amount)}` : ''}
            </span>
          </div>

          {error && <div className="text-[10px] text-error">Couldn’t load comparable rates.</div>}

          {!error && !live.length && !unobtainable.length && (
            <div className="text-[10px] text-base-content/50">No other venue offers this pair.</div>
          )}

          {/* When the caller pinned no collateral the server picks ONE to compare
              against — say which, or the rates look like they came from nowhere. */}
          {basisLabel && (
            <div className="mb-1 text-[9px] text-base-content/50">
              Backed by {basisLabel} · like-for-like
            </div>
          )}

          <ul className="space-y-0.5">
            {live.map((r) => (
              <ComparableRow
                key={`${r.marketUid}-${r.termId ?? 'var'}`}
                r={r}
                anchorPct={anchorPct}
                side={side}
                showCollateral={showCollateral}
                lenderInfoMap={lenderInfoMap}
                referenceLenderName={data?.reference?.lenderName}
              />
            ))}
          </ul>

          {unobtainable.length > 0 && (
            <div className="mt-1.5 border-t border-base-300 pt-1.5">
              <div className="mb-0.5 text-[9px] uppercase tracking-wide text-base-content/40">
                Not open right now
              </div>
              <ul className="space-y-0.5">
                {unobtainable.map((r) => (
                  <ComparableRow
                    key={`${r.marketUid}-${r.termId ?? 'var'}`}
                    r={r}
                    anchorPct={anchorPct}
                    side={side}
                    showCollateral={showCollateral}
                    lenderInfoMap={lenderInfoMap}
                    referenceLenderName={data?.reference?.lenderName}
                  />
                ))}
              </ul>
            </div>
          )}

          {/* Never let an opinionated filter be invisible: a near-empty market
              quoting −25% is excluded on purpose, and the user should be able to
              tell that from "there is nothing else out there". */}
          {!!data?.droppedIlliquid && (
            <div className="mt-1 text-[9px] text-base-content/40">
              {data.droppedIlliquid} market{data.droppedIlliquid === 1 ? '' : 's'} too shallow to
              compare
              {data.liquidityFloorUsd > 0 ? ` (under $${fmtAmount(data.liquidityFloorUsd)})` : ''}.
            </div>
          )}

          {/* `droppedStale` is deliberately NOT rendered. It is a data-pipeline
              diagnostic (an ingest lag hiding otherwise-live venues), not
              something a borrower can act on — it stays on the response for
              debugging and shows up in devtools, but advertising our own
              freshness gaps in the UI helps nobody. */}

          {data?.truncated && (
            <div className="mt-1 text-[9px] text-base-content/40">
              Showing the deepest venues only — too many markets matched to rank them all.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function fmtAmount(v: number): string {
  return v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : String(v)
}

function ComparableRow({
  r,
  anchorPct,
  side,
  showCollateral,
  lenderInfoMap,
  referenceLenderName,
}: {
  r: ComparableRate
  anchorPct: number | null
  side: 'borrow' | 'supply'
  /** Label each row with its own collateral (mixed-collateral comparisons). */
  showCollateral?: boolean
  lenderInfoMap?: Record<string, LenderInfo>
  /**
   * Display name of the venue the user is on. A comparable from the SAME brand
   * is legitimate — Aave runs several independent deployments, and the
   * comparison can span chains — but rendering both as a bare "Aave V3" reads
   * as the venue being compared against itself. When the brand matches, the
   * row disambiguates itself with its market name.
   */
  referenceLenderName?: string | null
}) {
  const rate = displayRate(r)
  const delta =
    anchorPct != null && rate != null
      ? side === 'borrow'
        ? rate - anchorPct
        : anchorPct - rate
      : null
  const better = delta != null && delta < -0.005
  const chip = termChip(r.termDays)
  const maturity = maturityLabel(r.maturity)

  // A rate is only "locked" if it is fixed for the whole horizon — a term that
  // has to be rolled is explicitly not, and the tooltip carries the server's
  // own wording for why.
  const locked = r.horizon?.locked === true

  // Same brand as the venue the user is on: show WHICH market, so the row is
  // never mistaken for a self-comparison.
  const sameBrand = !!referenceLenderName && (r.lenderName ?? '') === referenceLenderName
  const qualifier =
    r.marketName || r.curatorName || (r.collateral?.symbol ? `vs ${r.collateral.symbol}` : null)
  const tooltip = [
    r.obtainableReason,
    ...(r.horizon?.assumptions ?? []),
    r.aprAtAmountPct != null && Math.abs(r.aprAtAmountPct - r.aprPct) > 0.005
      ? `Advertised ${fmtPct(r.aprPct)}; ${fmtPct(r.aprAtAmountPct)} at your size.`
      : null,
    // A rate held down (or pushed negative) by emissions is not the structural
    // cost — name the subsidy rather than letting the headline imply it's free.
    r.rewardAprPct != null && r.rewardAprPct > 0.005 && r.aprExRewardsPct != null
      ? `Includes ${fmtPct(r.rewardAprPct)} of reward emissions — ${fmtPct(r.aprExRewardsPct)} without them, and emissions can stop.`
      : null,
    r.depth.liquidityUsd != null
      ? `Depth $${fmtAmount(r.depth.liquidityUsd)}${showCollateral ? '' : ''}.`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <li
      className={`flex items-center gap-1.5 rounded-md px-1 py-1 ${
        r.obtainable ? 'hover:bg-base-200/60' : 'opacity-55'
      }`}
      title={tooltip || undefined}
    >
      {/* The server resolves the display name (a per-market lender's key is a
          hash); the locally-loaded map is only a fallback for logos. */}
      <LenderBadge
        lenderKey={r.lender}
        name={r.lenderName ?? lenderInfoMap?.[r.lender]?.name}
        logoURI={r.lenderLogoUri ?? lenderInfoMap?.[r.lender]?.logoURI}
        bare
        maxChars={14}
        className="text-[10px] shrink-0"
      />
      {sameBrand && qualifier && (
        <span
          className="shrink-0 rounded bg-base-300/60 px-1 py-px text-[9px] leading-none text-base-content/60"
          title={`A different ${r.lenderName ?? 'deployment'} market — ${r.marketUid}`}
        >
          {qualifier}
        </span>
      )}

      <div className="flex min-w-0 flex-1 items-center gap-1">
        {showCollateral && r.collateral.symbol && (
          <span
            className="rounded bg-base-300/60 px-1 py-px text-[9px] leading-none text-base-content/60"
            title={`Backed by ${r.collateral.symbol}`}
          >
            {r.collateral.symbol}
          </span>
        )}
        {r.rateType === 'fixed' ? (
          <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-1 py-px text-[9px] font-semibold leading-none text-warning">
            {chip ?? 'FIXED'}
            {maturity && <span className="font-normal opacity-70">{maturity}</span>}
          </span>
        ) : (
          <span className="rounded bg-base-300/60 px-1 py-px text-[9px] leading-none text-base-content/60">
            VAR
          </span>
        )}
        {locked && (
          <span
            className="text-[9px] leading-none text-success/80"
            title="Rate is locked for your whole holding period"
          >
            locked
          </span>
        )}
        {r.depth.capped && (
          <span
            className="text-[9px] leading-none text-error/80"
            title="This venue cannot fund your size"
          >
            capped
          </span>
        )}
        {r.quoteBasis === 'last-clearing' && (
          <span className="text-[9px] leading-none text-base-content/50">last clearing</span>
        )}
      </div>

      <span
        className={`font-mono text-[11px] tabular-nums ${better ? 'text-success' : 'text-base-content/80'}`}
      >
        {fmtPct(rate)}
      </span>
      {delta != null && (
        <span
          className={`w-[46px] shrink-0 text-right font-mono text-[9px] tabular-nums ${
            better ? 'text-success/80' : 'text-base-content/40'
          }`}
        >
          {fmtDelta(delta)}
        </span>
      )}
    </li>
  )
}
