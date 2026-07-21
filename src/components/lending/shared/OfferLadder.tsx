import { useLendingOffers, computeEffectiveBorrow } from '../../../hooks/lending/useLendingOffers'
import { formatUsd, formatTokenAmount } from '../../../utils/format'

/**
 * The LIVE order-book ladder for an order-book lending market, as a MULTI-SELECT
 * of TILES (styled like the fixed-term tiles): each maker offer is a `rate / size`
 * tile, best-first. Selection is a contiguous best-first RUN — tapping an offer
 * selects the run from the top through it (and sets the borrow amount to that
 * run's cumulative depth); tapping the current boundary offer deselects it. This
 * mirrors execution, which always fills cheapest-first (`clampByAssets` → a
 * `multicall` of the taken offers), so you can't skip a cheaper offer to reach a
 * worse one — that would misrepresent the on-chain take. Typing an amount selects
 * the same way (the boundary offer is partial-filled), so both gestures agree.
 *
 * Provider-agnostic — renders whatever offers the endpoint returns (Morpho
 * Midnight is today's only order-book lender). Falls back to the single
 * "Available at this rate" line while loading or if the fetch is empty.
 */
export function OfferLadder({
  chainId,
  lender,
  symbol,
  side = 'borrow',
  fallbackAmount,
  fallbackAmountUsd,
  onSelectAmount,
  amountTokens,
}: {
  chainId?: string
  lender?: string
  symbol?: string
  /** Which side of the book: `borrow` (bids, what you pay) or `lend` (asks,
   *  what you earn). Only the copy differs — the fill math is symmetric. */
  side?: 'borrow' | 'lend'
  fallbackAmount?: number
  fallbackAmountUsd?: number
  /** Tap-to-fill: receives the cumulative depth (loan-token units) through the run. */
  onSelectAmount?: (tokens: number) => void
  /** Current borrow/lend amount (loan-token units) — highlights the offers it consumes. */
  amountTokens?: number
}) {
  const { offers, hasMore, isLoading } = useLendingOffers({
    chainId,
    lender,
    side,
    // Drop sub-$1 dust so a tiny offer at a great tick can't head the list.
    minAssetsUsd: 1,
  })
  // Side-aware copy — a borrow PAYS deeper (worse=higher) offers, a lend EARNS
  // deeper (worse=lower-yield) ones. The fill/highlight math is identical.
  const isLend = side === 'lend'
  const verb = isLend ? 'Lend' : 'Borrow'
  // The offers the current amount fills, best-first — one source of truth for the
  // highlight, so tapping a tile AND typing an amount light up the same run.
  const eff = computeEffectiveBorrow(offers, amountTokens ?? 0)
  const consumed = new Set(eff.consumedTicks)
  const boundaryTick = eff.consumedTicks[eff.consumedTicks.length - 1]

  const sizeLabel = (assets: number, assetsUsd: number | null) =>
    `${formatTokenAmount(assets)}${symbol ? ` ${symbol}` : ''}${
      assetsUsd != null ? ` ($${formatUsd(assetsUsd)})` : ''
    }`

  const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
  const makerLabel = (makers?: string[]) => {
    if (!makers || makers.length === 0) return ''
    if (makers.length === 1) return `\nMaker: ${shortAddr(makers[0])}`
    return `\n${makers.length} makers: ${makers.map(shortAddr).join(', ')}`
  }

  // Fallback: no live ladder yet → the single top-of-book depth row (as before).
  if (offers.length === 0) {
    if (fallbackAmount == null || !(fallbackAmount > 0)) return null
    return (
      <div className="flex justify-between gap-2">
        <span>{isLoading ? 'Available (loading offers…)' : 'Available at this rate'}</span>
        <span className="tabular-nums">{sizeLabel(fallbackAmount, fallbackAmountUsd ?? null)}</span>
      </div>
    )
  }

  const selectable = !!onSelectAmount

  // Tapping an offer sets the contiguous run: through this offer (extend), or, if
  // it's already the boundary, back to the previous offer (deselect / shrink).
  const onTileClick = (i: number) => {
    if (!selectable) return
    const isBoundary = offers[i].tick === boundaryTick
    onSelectAmount?.(
      isBoundary ? (i > 0 ? offers[i - 1].cumulativeAssets : 0) : offers[i].cumulativeAssets
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between gap-2">
        <span
          title={
            isLend
              ? 'Live maker offers on the order book, best yield first. Your deposit fills these top-down; a larger deposit reaches deeper (lower-yield) offers.'
              : 'Live maker offers on the order book, best rate first. Your borrow fills these top-down; a larger borrow reaches deeper (worse) offers.'
          }
        >
          Offers ({offers.length}
          {hasMore ? '+' : ''})
        </span>
        <span className="text-base-content/40 text-[10px]">
          {selectable ? 'tap offers to select' : 'rate → size'}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
        {offers.map((o, i) => {
          const active = consumed.has(o.tick)
          const isBoundary = o.tick === boundaryTick
          const hint = !active
            ? '' // extend
            : isBoundary
              ? ' (tap to deselect)'
              : ' (tap to trim selection to here)'
          return (
            <button
              key={o.tick}
              type="button"
              disabled={!selectable}
              aria-pressed={active}
              onClick={() => onTileClick(i)}
              title={
                (selectable
                  ? `${verb} through this offer: ${sizeLabel(o.cumulativeAssets, null)} — ${
                      isLend ? 'down to' : 'worst rate ≤'
                    } ${o.aprPct.toFixed(2)}%${isLend ? ' yield' : ''}${hint}`
                  : `Cumulative through here: ${sizeLabel(o.cumulativeAssets, null)}`) +
                makerLabel(o.makers)
              }
              className={`flex flex-col items-start px-2.5 py-1 rounded-lg border text-left transition-colors ${
                selectable ? 'cursor-pointer' : 'cursor-default'
              } ${
                active
                  ? 'border-primary bg-primary/10 ring-1 ring-primary'
                  : 'border-base-300 bg-base-200/50 hover:bg-base-200'
              }`}
            >
              <span className="text-xs font-semibold tabular-nums">
                {active ? '✓ ' : ''}
                {o.aprPct.toFixed(2)}%
              </span>
              <span className="text-[10px] font-mono tabular-nums text-base-content/60">
                {formatTokenAmount(o.assets)}
                {symbol ? ` ${symbol}` : ''}
              </span>
            </button>
          )
        })}
      </div>
      {/* Selection summary — reinforces the multi-select and shows the blend the
          selected run resolves to (the same rate the borrow will pay). */}
      {selectable && eff.consumedTicks.length > 0 && (
        <div className="flex justify-between gap-2 text-[10px] text-base-content/60 px-0.5">
          <span>
            {eff.consumedTicks.length} offer
            {eff.consumedTicks.length > 1 ? 's' : ''} selected
          </span>
          <span className="tabular-nums">
            {sizeLabel(eff.filled, null)}
            {eff.aprPct != null
              ? ` · ${eff.aprPct.toFixed(2)}% blended${isLend ? ' yield' : ''}`
              : ''}
          </span>
        </div>
      )}
    </div>
  )
}
