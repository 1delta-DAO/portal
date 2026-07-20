import { useLendingOffers } from '../../../hooks/lending/useLendingOffers'
import { formatUsd, formatTokenAmount } from '../../../utils/format'

/**
 * The LIVE order-book ladder for an order-book lending market: every maker offer
 * as a `rate → size` row, best-first, in a scrollable box. Replaces the single
 * "Available at this rate" line (which only showed the top-of-book depth).
 *
 * Provider-agnostic — it renders whatever offers the endpoint returns (Morpho
 * Midnight is today's only order-book lender). Falls back to that single line
 * while the live fetch is loading or comes back empty, so it never renders worse
 * than the cached snapshot did.
 */
export function OfferLadder({
  chainId,
  lender,
  symbol,
  fallbackAmount,
  fallbackAmountUsd,
}: {
  chainId?: string
  lender?: string
  symbol?: string
  fallbackAmount?: number
  fallbackAmountUsd?: number
}) {
  const { offers, hasMore, isLoading } = useLendingOffers({
    chainId,
    lender,
    // Drop sub-$1 dust so a tiny offer at a great tick can't head the list.
    minAssetsUsd: 1,
  })

  const sizeLabel = (assets: number, assetsUsd: number | null) =>
    `${formatTokenAmount(assets)}${symbol ? ` ${symbol}` : ''}${
      assetsUsd != null ? ` ($${formatUsd(assetsUsd)})` : ''
    }`

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

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between gap-2">
        <span title="Live maker offers on the order book, best rate first. Your borrow fills these top-down; larger borrows reach deeper (worse) offers.">
          Offers ({offers.length}
          {hasMore ? '+' : ''})
        </span>
        <span className="text-base-content/40 text-[10px]">rate → size</span>
      </div>
      <div className="max-h-40 overflow-y-auto rounded border border-base-300 divide-y divide-base-300">
        {offers.map((o, i) => (
          <div
            key={`${o.tick}-${i}`}
            className="flex justify-between gap-2 px-2 py-1 text-xs hover:bg-base-200/50"
            title={`Cumulative through this offer: ${sizeLabel(o.cumulativeAssets, o.assetsUsd != null && o.assets > 0 ? (o.cumulativeAssets / o.assets) * o.assetsUsd : null)}`}
          >
            <span className="tabular-nums font-medium">
              {o.aprPct.toFixed(2)}%
            </span>
            <span className="tabular-nums text-base-content/70">
              {sizeLabel(o.assets, o.assetsUsd)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
