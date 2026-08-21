import React from 'react'
import { Link } from 'react-router-dom'
import { ChainBadgedLogo } from '../../../common/ChainBadgedLogo'
import { Badge } from '../../../common/Badge'
import { RiskFindings } from '../../shared/RiskFindings'
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
import { buildPath, OPTIMIZER_DEEPLINK_KEYS } from '../../../../utils/routes'
import { AutoBalancedPill, basketExplainer } from '../../shared/SmartVault'

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
 * Deep link into the Lending tab for rows that ARE a lending market.
 *
 * `refs.marketUid` is the uid when the server sends one — but it does not
 * always: the hosted API returns `refs`, the local worker omits it entirely,
 * and gating on it made the icon vanish against a local backend. So compose the
 * fallback from fields that are always present. `venue` IS the lender key
 * (`MORPHO_BLUE_E7B3…`, matching `lenderInfo.key` on `/v1/data/lending/latest`)
 * and a market uid is `LENDER:chainId:asset`, so the three documented fields
 * rebuild it exactly — verified against the lending endpoint's own uids.
 *
 * Composing beats splitting `earnUid`, which is identical for these rows but
 * documented as opaque ("pass back verbatim; never split it").
 *
 * Vault rows are excluded by `venueKind`, which is the only thing that
 * separates them: their uid is well-formed too (`vault.savings:1:0x…`), it just
 * names no lending market. Fail-safe direction — if that value is ever renamed
 * the icon disappears rather than pointing at a market that isn't there.
 */
function lendingPathForRow(row: EarnMarket): string | null {
  if (row.venueKind !== 'lending') return null
  const asset = row.asset.address
  if (!asset || !row.venue) return null
  const uid = row.refs?.marketUid ?? `${row.venue}:${row.chainId}:${asset}`
  return buildPath('lending', row.chainId, row.venue, {
    [OPTIMIZER_DEEPLINK_KEYS.colMarket]: uid,
    [OPTIMIZER_DEEPLINK_KEYS.collateral]: asset,
    [OPTIMIZER_DEEPLINK_KEYS.action]: 'deposit',
  })
}

/** Arrow-out-of-box — the same "opens elsewhere" mark the Earn table uses. */
function OpenInIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17L17 7" />
      <path d="M7 7h10v10" />
    </svg>
  )
}

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

/**
 * The term, for rows that HAVE one.
 *
 * Provider-agnostic by construction: it reads `row.maturity`, which the server
 * stamps on both PT providers (Pendle, Spectra) and will stamp on the
 * fixed-term lenders as the term-sheet adapter reaches them. Nothing here
 * branches on a venue.
 *
 * Days are recomputed from the maturity TIMESTAMP against the clock, not read
 * off `secondsToMaturity` — that field is a snapshot from fetch time, and a
 * cached page would keep counting down from whenever it was built. Same rule
 * the server applies when it decides a PT is still live.
 *
 * Without this the listing shows "Fixed 3.19%" identically for a market that
 * matures in nine days and one that matures in 2031 — which is the whole
 * reason `maturity` sits on the row root rather than inside the term sheet.
 */
function termNote(row: EarnMarket): { label: string; title: string } | null {
  const m = row.maturity
  if (!m || m.kind === 'perpetual') return null
  const at = typeof m.maturity === 'number' ? m.maturity : null
  const secs =
    at != null
      ? at - Math.floor(Date.now() / 1000)
      : typeof m.secondsToMaturity === 'number'
        ? m.secondsToMaturity
        : null
  if (secs == null) return null
  const iso = m.maturityIso ?? (at != null ? new Date(at * 1000).toISOString() : null)
  const on = iso ? ` (${iso.slice(0, 10)})` : ''
  if (secs <= 0) return { label: 'matured', title: `Matured${on}` }
  const days = secs / 86_400
  return {
    label: `${Math.max(1, Math.round(days))}-day`,
    title: `${days.toFixed(2)} days to maturity${on}`,
  }
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
          const term = termNote(row)
          const lendingPath = lendingPathForRow(row)
          return (
            <tr
              key={row.earnUid}
              className={`cursor-pointer hover ${isSel ? 'bg-primary/10' : ''}`}
              onClick={() => onRowClick(row)}
            >
              <td>
                <div className="flex items-center gap-2">
                  {/* Chain badged onto the venue logo — rows from every
                      selected chain are interleaved here, and a row is only
                      actionable on its own. */}
                  <ChainBadgedLogo
                    src={row.logoURI}
                    alt={row.venue}
                    chainId={row.chainId}
                    size={24}
                    fallbackText={row.brand ?? row.venue}
                    round={false}
                  />
                  <div className="min-w-0 leading-tight">
                    {/* MARKET first, brand second. The brand is shared by every
                        row of a protocol — Pendle alone has ~50 — so leading
                        with it prints the same word down the whole column while
                        the line that actually distinguishes the rows sits
                        underneath in small grey text. Falls back to the brand
                        when a row has no market name, so the primary line is
                        never empty. */}
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="truncate text-xs font-medium" title={row.name ?? row.venue}>
                        {row.name || row.brand || row.venue}
                      </span>
                      {/* Lending markets only — a vault has no entry there. A
                          real <Link>, so cmd/middle-click opens a tab instead
                          of swallowing the modifier the way an onClick-only
                          anchor does. */}
                      {lendingPath && (
                        <Link
                          to={lendingPath}
                          className="shrink-0 text-base-content/30 hover:text-primary transition-colors"
                          title={`Open ${
                            row.name || row.asset.symbol || 'this market'
                          } in the Lending tab`}
                          aria-label="Open in the Lending tab"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <OpenInIcon />
                        </Link>
                      )}
                    </div>
                    {/* Who runs it · what it runs on · kind — see venueLabel.ts
                        for why the second segment is not always the same
                        field. */}
                    <div className="truncate text-[10px] text-base-content/50" title={row.venue}>
                      {row.subtitle ?? row.brand ?? row.venue}
                    </div>
                  </div>
                </div>
              </td>
              <td className="truncate text-xs">
                {/* A basket row's asset symbol is a half-truth: it is what you
                    hand over, not what you end up holding. The pill is the only
                    thing on the row that says so. */}
                {row.basket && (
                  <AutoBalancedPill
                    className="mb-0.5"
                    title={basketExplainer(row.basket, row.asset.symbol)}
                  />
                )}
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
                {/* The TERM qualifies the headline, so it sits directly under
                    it. A fixed rate with no term beside it is the same number
                    whether it runs nine days or five years. */}
                {term && (
                  <div className="text-[10px] font-normal text-base-content/50" title={term.title}>
                    {term.label}
                  </div>
                )}
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
                {/* Score (higher is worse) plus ONE icon for everything the
                    score doesn't cover — losses already taken, an exit that
                    doesn't work, a stale rating. Those are separate axes: a
                    market can be low-risk on collateral and still be one you
                    cannot exit, or one whose money is already gone. Details
                    live in the icon's popover so the column stays one line. */}
                <div className="flex items-center gap-1">
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
                  <RiskFindings risk={row.risk} />
                </div>
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
