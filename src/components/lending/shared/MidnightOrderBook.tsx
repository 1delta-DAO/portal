import { useMidnightBook } from '../../../hooks/lending/useLendingOffers'
import { computeEffectiveBorrow, type LendingOffer } from '../../../hooks/lending/useLendingOffers'
import { formatTokenAmount, formatUsd } from '../../../utils/format'

/**
 * Combined two-sided order book for a Morpho-Midnight market — the classic
 * exchange view: ASKS (the lend/supply ladder) stacked above a mid/spread
 * divider, BIDS (the borrow/demand ladder) below it, each row a `size · depth-bar
 * · APR` line with the depth bar ∝ cumulative depth so the inside of book (best
 * offers, nearest the mid) reads at a glance.
 *
 * Ground truth (Midnight semantics): `asks` = maker SELL offers (maker
 * borrowers) — a taker fills them to LEND; `bids` = maker BUY offers (maker
 * lenders) — a taker fills them to BORROW. So:
 *   - Deposit/lend  → TAKE fills asks;  MAKE competes on bids.
 *   - Borrow        → TAKE fills bids;  MAKE competes on asks.
 *
 * `fillSide` is the tap-to-fill side (Take mode): tapping a row sets the amount
 * to that row's cumulative depth, filling best-first exactly like execution
 * (`multicall` of the taken offers). `marker` (Make mode) drops a highlighted
 * "your offer" line into the relevant side at its sorted position, so a maker can
 * see where their rate would rank before posting.
 */
export function MidnightOrderBook({
  chainId,
  lender,
  symbol,
  fillSide,
  amountTokens,
  onSelectAmount,
  marker,
  maxPerSide = 7,
}: {
  chainId?: string
  /** `MORPHO_MIDNIGHT_<id>` lender key (marketUid's first segment). */
  lender?: string
  symbol?: string
  /** Tap-to-fill side (Take mode). Omit for a read-only book (Make mode). */
  fillSide?: 'asks' | 'bids'
  /** Current fill amount (loan-token units) — highlights the offers it consumes. */
  amountTokens?: number
  /** Tap-to-fill callback — receives cumulative depth (loan-token units) through the row. */
  onSelectAmount?: (tokens: number) => void
  /** Make mode: draw a "your offer" line at `aprPct` on `side`, ranked in place. */
  marker?: { side: 'asks' | 'bids'; aprPct: number; sizeTokens?: number }
  /** Cap rows shown per side (nearest the mid); deeper offers collapse to a "+N" note. */
  maxPerSide?: number
}) {
  const { asks, bids, isLoading } = useMidnightBook({ chainId, lender, minAssetsUsd: 1 })

  const bestAsk = asks[0]?.aprPct
  const bestBid = bids[0]?.aprPct
  const mid = bestAsk != null && bestBid != null ? (bestAsk + bestBid) / 2 : (bestAsk ?? bestBid)
  const spread = bestAsk != null && bestBid != null ? Math.abs(bestAsk - bestBid) : null

  // Fill highlight — same source of truth as tap-to-fill: the offers this amount
  // consumes on the active side, best-first.
  const fillArr = fillSide === 'asks' ? asks : fillSide === 'bids' ? bids : []
  const eff = computeEffectiveBorrow(fillArr, amountTokens ?? 0)
  const consumed = new Set(eff.consumedTicks)
  const boundaryTick = eff.consumedTicks[eff.consumedTicks.length - 1]

  // Shown rows (nearest the mid) + their DISPLAY order per side (asks render
  // best-at-the-bottom, so reversed). The selected offers form a CONTIGUOUS run
  // in display order — track its top/bottom tick so the whole run draws as ONE
  // box (continuous border) instead of a stack of per-row rings.
  const asksShown = asks.slice(0, maxPerSide)
  const bidsShown = bids.slice(0, maxPerSide)
  const asksDisplayed = asksShown.slice().reverse()
  const bidsDisplayed = bidsShown
  const fillDisplayed =
    fillSide === 'asks' ? asksDisplayed : fillSide === 'bids' ? bidsDisplayed : []
  const selectedInDisplay = fillDisplayed.filter((o) => consumed.has(o.tick))
  const runTopTick = selectedInDisplay[0]?.tick
  const runBottomTick = selectedInDisplay[selectedInDisplay.length - 1]?.tick

  if (!isLoading && asks.length === 0 && bids.length === 0) {
    return (
      <div className="text-[10px] text-base-content/40 px-1 py-1">
        No live offers on this market’s order book yet.
      </div>
    )
  }
  if (isLoading && asks.length === 0 && bids.length === 0) {
    return (
      <div className="text-[10px] text-base-content/40 px-1 py-1 flex items-center gap-1.5">
        <span className="loading loading-spinner w-2.5 h-2.5" /> Loading order book…
      </div>
    )
  }

  const sizeTitle = (o: LendingOffer) =>
    `${formatTokenAmount(o.assets)}${symbol ? ` ${symbol}` : ''}${
      o.assetsUsd != null ? ` ($${formatUsd(o.assetsUsd)})` : ''
    } at ${o.aprPct.toFixed(2)}%\nCumulative depth: ${formatTokenAmount(o.cumulativeAssets)}${
      symbol ? ` ${symbol}` : ''
    }${o.makers?.length ? `\nMaker: ${o.makers.map((m) => `${m.slice(0, 6)}…${m.slice(-4)}`).join(', ')}` : ''}`

  // Rank a maker's rate among competing offers on `marker.side` (best-first): how
  // many offers are BETTER (fill ahead of it). asks → higher APR is better; bids
  // → lower APR is better.
  const markerRank = (() => {
    if (!marker) return null
    const arr = marker.side === 'asks' ? asks : bids
    const better =
      marker.side === 'asks'
        ? arr.filter((o) => o.aprPct > marker.aprPct)
        : arr.filter((o) => o.aprPct < marker.aprPct)
    return {
      ahead: better.length,
      total: arr.length,
      aheadSize: better.reduce((s, o) => s + o.assets, 0),
    }
  })()

  const renderRow = (o: LendingOffer, side: 'asks' | 'bids') => {
    // Bars share the deepest cumulative on their side so the staircase reads as a
    // depth profile (deepest offer = full width). Guard against a zero/degenerate max.
    const sideMax =
      (side === 'asks'
        ? asks[asks.length - 1]?.cumulativeAssets
        : bids[bids.length - 1]?.cumulativeAssets) ?? 0
    const widthPct = sideMax > 0 ? Math.max(3, (o.cumulativeAssets / sideMax) * 100) : 3
    const isFillable = fillSide === side && !!onSelectAmount
    const active = fillSide === side && consumed.has(o.tick)
    const isBoundary = o.tick === boundaryTick
    // Continuous-run box: only the first/last selected row (in display order) get
    // the rounded top/bottom + horizontal edge; middle rows keep just the sides.
    const isRunTop = active && o.tick === runTopTick
    const isRunBottom = active && o.tick === runBottomTick
    const tone = side === 'asks' ? 'success' : 'error'

    const onClick = () => {
      if (!isFillable) return
      const idx = fillArr.findIndex((x) => x.tick === o.tick)
      // Tap the boundary offer to deselect back one; else extend through this offer.
      onSelectAmount?.(
        active && isBoundary
          ? idx > 0
            ? fillArr[idx - 1].cumulativeAssets
            : 0
          : o.cumulativeAssets
      )
    }

    return (
      <button
        key={o.tick}
        type="button"
        disabled={!isFillable}
        aria-pressed={active}
        onClick={onClick}
        title={
          (isFillable
            ? `${side === 'asks' ? 'Lend' : 'Borrow'} through here: ${formatTokenAmount(
                o.cumulativeAssets
              )}${symbol ? ` ${symbol}` : ''}${active && isBoundary ? ' (tap to deselect)' : ''}\n`
            : '') + sizeTitle(o)
        }
        className={`relative grid grid-cols-[1fr_auto] items-center gap-2 px-1.5 py-0.5 overflow-hidden w-full text-left ${
          isFillable ? 'cursor-pointer hover:brightness-125' : 'cursor-default'
        } ${
          active
            ? `bg-primary/10 border-x border-primary ${isRunTop ? 'border-t rounded-t-md' : ''} ${
                isRunBottom ? 'border-b rounded-b-md' : ''
              }`
            : 'rounded'
        }`}
      >
        {/* Depth bar (cumulative), anchored left, colored by side. */}
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 ${
            tone === 'success' ? 'bg-success/15' : 'bg-error/15'
          }`}
          style={{ width: `${widthPct}%` }}
        />
        <span className="relative tabular-nums font-mono text-[10px] text-base-content/70 truncate">
          {active ? '✓ ' : ''}
          {formatTokenAmount(o.assets)}
          {symbol ? ` ${symbol}` : ''}
        </span>
        <span
          className={`relative tabular-nums text-[11px] font-semibold ${
            tone === 'success' ? 'text-success' : 'text-error'
          }`}
        >
          {o.aprPct.toFixed(2)}%
        </span>
      </button>
    )
  }

  const renderMarker = (side: 'asks' | 'bids') =>
    marker && marker.side === side ? (
      <div className="flex flex-col gap-px px-1.5 py-0.5 rounded border border-dashed border-primary bg-primary/10">
        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
          <span className="tabular-nums font-mono text-[10px] text-primary truncate">
            ▸ your offer
            {marker.sizeTokens
              ? ` · ${formatTokenAmount(marker.sizeTokens)}${symbol ? ` ${symbol}` : ''}`
              : ''}
          </span>
          <span className="tabular-nums text-[11px] font-semibold text-primary">
            {marker.aprPct.toFixed(2)}%
          </span>
        </div>
        {markerRank && (
          <div className="text-[9px] text-primary/70">
            {markerRank.ahead === 0
              ? '✓ best offer — fills first'
              : `ranks #${markerRank.ahead + 1} of ${markerRank.total + 1} · behind ${formatTokenAmount(
                  markerRank.aheadSize
                )}${symbol ? ` ${symbol}` : ''}`}
          </div>
        )}
      </div>
    ) : null

  const asksHidden = asks.length - asksShown.length
  const bidsHidden = bids.length - bidsShown.length
  // For asks, a top-of-block marker (rate better than every shown ask) should sit
  // ABOVE the reversed rows; simplest is to always place the ask marker at the top
  // of the asks block and the bid marker at the bottom of the bids block — both are
  // the "away from mid" extreme only when the maker is worst; ranking text carries
  // the precise standing, so exact interleave isn't needed for the check-realism goal.

  return (
    <div className="flex flex-col rounded-lg border border-base-300 bg-base-200/30 divide-y divide-base-300/60 text-xs">
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto] gap-2 px-1.5 py-1 text-[9px] uppercase tracking-wide text-base-content/40">
        <span>size{symbol ? ` (${symbol})` : ''}</span>
        <span>APR</span>
      </div>

      {/* Asks (lend / supply) — best at the bottom, adjacent to the mid. */}
      <div className="flex flex-col gap-0 p-1">
        <div className="px-1.5 pb-0.5 text-[9px] text-success/70 flex justify-between">
          <span>▲ lend offers (supply)</span>
          {asksHidden > 0 && <span className="text-base-content/30">+{asksHidden} deeper</span>}
        </div>
        {renderMarker('asks')}
        {asksDisplayed.map((o) => renderRow(o, 'asks'))}
        {asksDisplayed.length === 0 && (
          <div className="px-1.5 py-0.5 text-[10px] text-base-content/30">no lend offers</div>
        )}
      </div>

      {/* Mid / spread */}
      <div className="px-1.5 py-1 flex items-center justify-center gap-2 bg-base-300/30 text-[10px] text-base-content/60 tabular-nums">
        {mid != null ? (
          <>
            <span>mid {mid.toFixed(2)}%</span>
            {spread != null && (
              <span className="text-base-content/40">· spread {spread.toFixed(2)}%</span>
            )}
          </>
        ) : (
          <span className="text-base-content/40">—</span>
        )}
      </div>

      {/* Bids (borrow / demand) — best at the top, adjacent to the mid. */}
      <div className="flex flex-col gap-0 p-1">
        <div className="px-1.5 pb-0.5 text-[9px] text-error/70 flex justify-between">
          <span>▼ borrow offers (demand)</span>
          {bidsHidden > 0 && <span className="text-base-content/30">+{bidsHidden} deeper</span>}
        </div>
        {bidsDisplayed.map((o) => renderRow(o, 'bids'))}
        {renderMarker('bids')}
        {bidsDisplayed.length === 0 && (
          <div className="px-1.5 py-0.5 text-[10px] text-base-content/30">no borrow offers</div>
        )}
      </div>

      {/* Fill summary — reinforces the multi-select on the tap-to-fill side. */}
      {fillSide && eff.consumedTicks.length > 0 && (
        <div className="flex justify-between gap-2 px-1.5 py-0.5 text-[10px] text-base-content/60">
          <span>
            {eff.consumedTicks.length} offer{eff.consumedTicks.length > 1 ? 's' : ''} selected
          </span>
          <span className="tabular-nums">
            {formatTokenAmount(eff.filled)}
            {symbol ? ` ${symbol}` : ''}
            {eff.aprPct != null ? ` · ${eff.aprPct.toFixed(2)}% blended` : ''}
          </span>
        </div>
      )}
    </div>
  )
}
