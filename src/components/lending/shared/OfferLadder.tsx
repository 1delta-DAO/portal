import { useState } from 'react'
import { useLendingOffers } from '../../../hooks/lending/useLendingOffers'
import { formatUsd, formatTokenAmount } from '../../../utils/format'

/**
 * The LIVE order-book ladder for an order-book lending market, as a selectable
 * sub-selection of TILES (styled like the fixed-term tiles): each maker offer is
 * a `rate / size` tile, best-first. When `onSelectAmount` is given, tapping a
 * tile fills the borrow amount up to that tier's cumulative depth (so you pick a
 * rate ceiling); otherwise the tiles are read-only.
 *
 * Provider-agnostic — renders whatever offers the endpoint returns (Morpho
 * Midnight is today's only order-book lender). Falls back to the single
 * "Available at this rate" line while loading or if the fetch is empty.
 */
export function OfferLadder({
  chainId,
  lender,
  symbol,
  fallbackAmount,
  fallbackAmountUsd,
  onSelectAmount,
}: {
  chainId?: string
  lender?: string
  symbol?: string
  fallbackAmount?: number
  fallbackAmountUsd?: number
  /** Tap-to-fill: receives the cumulative depth (loan-token units) through the tile. */
  onSelectAmount?: (tokens: number) => void
}) {
  const { offers, hasMore, isLoading } = useLendingOffers({
    chainId,
    lender,
    // Drop sub-$1 dust so a tiny offer at a great tick can't head the list.
    minAssetsUsd: 1,
  })
  const [selectedTick, setSelectedTick] = useState<string | null>(null)

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
        <span className="tabular-nums">
          {sizeLabel(fallbackAmount, fallbackAmountUsd ?? null)}
        </span>
      </div>
    )
  }

  const selectable = !!onSelectAmount

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between gap-2">
        <span title="Live maker offers on the order book, best rate first. Your borrow fills these top-down; a larger borrow reaches deeper (worse) offers.">
          Offers ({offers.length}
          {hasMore ? '+' : ''})
        </span>
        <span className="text-base-content/40 text-[10px]">
          {selectable ? 'tap to fill amount' : 'rate → size'}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
        {offers.map((o) => {
          const active = selectedTick === o.tick
          return (
            <button
              key={o.tick}
              type="button"
              disabled={!selectable}
              onClick={() => {
                setSelectedTick(o.tick)
                onSelectAmount?.(o.cumulativeAssets)
              }}
              title={
                (selectable
                  ? `Borrow up to ${sizeLabel(o.cumulativeAssets, null)} — worst rate ≤ ${o.aprPct.toFixed(2)}%`
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
    </div>
  )
}
