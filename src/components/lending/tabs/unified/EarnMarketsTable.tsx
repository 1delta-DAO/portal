import React from 'react'
import { Logo } from '../../../common/Logo'
import { Badge } from '../../../common/Badge'
import { TableEmptyRow } from '../../../common/TableEmptyRow'
import { SortableHeader } from '../../../common/SortableHeader'
import {
  abbreviateNumber,
  abbreviateUsd,
  EMPTY_VALUE,
  formatPercent,
  riskBand,
} from '../../../../utils/format'
import {
  vocabLabel,
  vocabDescription,
  type EarnMarket,
  type EarnVocabulary,
} from '../../../../sdk/earn-helper'

export type EarnSortKey = 'rate' | 'marketRate' | 'tvl' | 'liquidity'

interface Props {
  items: EarnMarket[]
  /** Server-supplied display vocabulary — see `useEarnVocabulary`. */
  vocab: EarnVocabulary
  sortKey: EarnSortKey
  onToggleSort: (key: EarnSortKey) => void
  selected: EarnMarket | null
  onRowClick: (row: EarnMarket) => void
}

const pct = (n?: number) => (n == null || !Number.isFinite(n) ? EMPTY_VALUE : formatPercent(n))

const RISK_TONE = { low: 'neutral', medium: 'warning', high: 'error', unknown: 'neutral' } as const

/**
 * The sub-line under the headline APR.
 *
 * Only rendered when the venue's own yield differs from the total — i.e. when
 * some of the APR is the asset's own. For the majority of rows the two are
 * equal and a second number would be noise.
 */
function venueNote(row: EarnMarket): string | null {
  const { total, marketOwn } = row.rate
  if (marketOwn == null) return null
  if (Math.abs(total - marketOwn) < 0.005) return null
  if (row.rate.passthrough) return 'venue pays 0%'
  return `venue ${formatPercent(marketOwn)}`
}

export const EarnMarketsTable: React.FC<Props> = ({
  items,
  vocab,
  sortKey,
  onToggleSort,
  selected,
  onRowClick,
}) => (
  <div className="overflow-x-auto">
    <table className="table table-sm w-full table-fixed [&_td]:overflow-hidden [&_th]:overflow-hidden [&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:border-b [&_th]:border-base-300 [&_th]:bg-base-100">
      <thead>
        <tr>
          <th className="w-[30%]">Venue</th>
          <th className="w-[10%]">Asset</th>
          {/* Clicking cycles total ⇄ venue APR. Dropping the Venue APR column
              must not drop the ability to RANK by it — that ordering is what
              sinks pass-through rows on their own merit instead of relying on
              them being filtered out. */}
          <SortableHeader
            sortKey={sortKey === 'marketRate' ? 'marketRate' : 'rate'}
            activeKey={sortKey}
            activeDir="desc"
            onToggle={() => onToggleSort(sortKey === 'rate' ? 'marketRate' : 'rate')}
            className="w-[13%] text-right"
            title="Click to switch between total APR and the venue's own APR"
          >
            {sortKey === 'marketRate' ? 'Venue APR' : 'APR'}
          </SortableHeader>
          <SortableHeader
            sortKey="tvl"
            activeKey={sortKey}
            activeDir="desc"
            onToggle={onToggleSort}
            className="w-[12%] text-right"
          >
            TVL
          </SortableHeader>
          <SortableHeader
            sortKey="liquidity"
            activeKey={sortKey}
            activeDir="desc"
            onToggle={onToggleSort}
            className="w-[12%] text-right"
          >
            Liquidity
          </SortableHeader>
          <th className="w-[11%]">Risk</th>
          <th className="w-[12%]">Exit</th>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 && <TableEmptyRow colSpan={7}>No earn opportunities</TableEmptyRow>}
        {items.map((row) => {
          const isSel = selected?.earnUid === row.earnUid
          const note = venueNote(row)
          return (
            <tr
              key={row.earnUid}
              className={`cursor-pointer hover ${isSel ? 'bg-primary/10' : ''}`}
              onClick={() => onRowClick(row)}
            >
              <td>
                <div className="flex items-center gap-2">
                  {/* Circular crop: token art is a mix of square and round
                      source images, so clip them to one shape rather than
                      letting each provider's asset decide. */}
                  <span className="shrink-0 overflow-hidden rounded-full">
                    <Logo
                      src={row.logoURI}
                      alt={row.venue}
                      size={24}
                      fallbackText={row.brand ?? row.venue}
                      className="rounded-full"
                    />
                  </span>
                  <div className="min-w-0 leading-tight">
                    {/* MARKET first, brand second. The brand is shared by every
                        row of a protocol — Pendle alone has ~50 — so leading
                        with it prints the same word down the whole column while
                        the line that actually distinguishes the rows sits
                        underneath in small grey text. Falls back to the brand
                        when a row has no market name, so the primary line is
                        never empty. */}
                    <div className="truncate text-xs font-medium" title={row.name ?? row.venue}>
                      {row.name || row.brand || row.venue}
                    </div>
                    {/* Curator · protocol · kind. The protocol is the part that
                        distinguishes a Morpho vault from a Euler one — both
                        otherwise render as their curator. The brand is skipped
                        when it is already the primary line, rather than
                        rendering "Pendle · Pendle". */}
                    <div className="truncate text-[10px] text-base-content/50" title={row.venue}>
                      {row.curator?.name ? `${row.curator.name} · ` : ''}
                      {row.protocol?.name ?? (row.name && row.brand ? row.brand : '')}
                      {row.protocol?.name ? ' · ' : ''}
                      {vocabLabel(vocab, 'venueKind', row.venueKind)}
                    </div>
                  </div>
                </div>
              </td>
              <td className="truncate text-xs">
                {row.asset.symbol ? (
                  row.asset.symbol
                ) : row.asset.address ? (
                  // The underlying is not in the token registry. Showing a
                  // short address keeps the row identifiable and makes the gap
                  // actionable; "—" reads as "no underlying", which is never
                  // true for a vault.
                  <span
                    className="font-mono text-base-content/40"
                    title={`${row.asset.address} — not in the token registry`}
                  >
                    {row.asset.address.slice(0, 6)}…{row.asset.address.slice(-4)}
                  </span>
                ) : (
                  <span className="text-base-content/40">{EMPTY_VALUE}</span>
                )}
              </td>
              <td className="text-right text-xs font-medium tabular-nums">
                <div>{pct(row.rate.total)}</div>
                {/* The venue's own share, shown ONLY when it differs from the
                    headline — i.e. when part of the yield is the asset's own.
                    As its own column it was empty on the large majority of
                    rows, which read as "this venue pays nothing". */}
                {note && (
                  <div
                    className={`text-[10px] font-normal ${
                      row.rate.passthrough ? 'text-warning' : 'text-base-content/50'
                    }`}
                    title={
                      row.rate.passthrough
                        ? 'This venue pays nothing of its own — the headline is what the asset already earns in your wallet.'
                        : `Venue ${pct(row.rate.marketOwn)} · asset ${pct(row.rate.intrinsic)}`
                    }
                  >
                    {note}
                  </div>
                )}
              </td>
              <td className="text-right text-xs tabular-nums">
                {row.tvl.usd != null ? (
                  abbreviateUsd(row.tvl.usd)
                ) : row.tvl.formatted != null ? (
                  // Not priced: show the TOKEN amount, abbreviated and visibly
                  // distinguished. Printing a raw decimal in a USD column reads
                  // as dollars and overstates by whatever the token is worth.
                  <span
                    className="text-base-content/50"
                    title={`${row.tvl.formatted.toLocaleString()} ${row.asset.symbol} — not priced in USD`}
                  >
                    {abbreviateNumber(row.tvl.formatted)}{' '}
                    <span className="text-[10px]">{row.asset.symbol}</span>
                  </span>
                ) : (
                  <span className="text-base-content/40">{EMPTY_VALUE}</span>
                )}
              </td>
              <td className="text-right text-xs tabular-nums">
                {row.liquidity?.usd != null ? (
                  abbreviateUsd(row.liquidity.usd)
                ) : row.liquidity?.formatted != null ? (
                  <span
                    className="text-base-content/50"
                    title={`${row.liquidity.formatted.toLocaleString()} ${row.asset.symbol} — not priced in USD`}
                  >
                    {abbreviateNumber(row.liquidity.formatted)}
                  </span>
                ) : (
                  <span className="text-base-content/40">{EMPTY_VALUE}</span>
                )}
              </td>
              <td>
                {/* Higher is worse. `illiquid` is a separate axis: a market can
                    be low-risk on collateral and still be one you cannot
                    exit. */}
                {row.risk?.score != null ? (
                  <Badge
                    tone={RISK_TONE[riskBand(row.risk.score)]}
                    // The server's own label where it sent one, else the band
                    // this score falls in — never a third opinion.
                    title={`Risk: ${row.risk.label ?? riskBand(row.risk.score)}`}
                  >
                    {row.risk.score}
                  </Badge>
                ) : (
                  <span className="text-xs text-base-content/40">{EMPTY_VALUE}</span>
                )}
                {row.risk?.illiquid && (
                  <Badge
                    tone="error"
                    className="ml-1"
                    title="Claims a same-block exit but reports zero liquidity — enterable, not exitable."
                  >
                    illiquid
                  </Badge>
                )}
              </td>
              <td className="truncate">
                <Badge title={vocabDescription(vocab, 'exitMode', row.exit.mode)}>
                  {vocabLabel(vocab, 'exitMode', row.exit.mode)}
                </Badge>
                {row.exit.cooldownSecs ? (
                  <span className="ml-1 text-[10px] tabular-nums text-base-content/50">
                    {Math.round(row.exit.cooldownSecs / 86400)}d
                  </span>
                ) : null}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  </div>
)
