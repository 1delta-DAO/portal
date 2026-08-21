import React, { useState } from 'react'
import { Logo } from '../../../common/Logo'
import { Badge } from '../../../common/Badge'
import { Chevron } from '../../../common/Chevron'
import { useEarnHistory } from '../../../../hooks/earn/useEarnHistory'
import { HistoryChart } from './HistoryChart'
import { EMPTY_VALUE, formatPercent, riskBand } from '../../../../utils/format'
import type { EarnMarket, EarnVocabulary } from '../../../../sdk/earn-helper'

const WINDOWS = [7, 30, 90] as const

const RISK_TONE = { low: 'neutral', medium: 'warning', high: 'error', unknown: 'neutral' } as const

interface Props {
  /** The selected row, or null — the band keeps its place either way. */
  row: EarnMarket | null
  vocab: EarnVocabulary
  open: boolean
  onToggleOpen: () => void
}

/**
 * The selected row's history, full width above the listing.
 *
 * A rate series is a shape, and a shape needs horizontal room: at the 18–24rem
 * of the detail rail, 90 daily points land roughly three to a pixel column, so
 * the line reads as noise. Here it gets the whole list column — 700–1000px on a
 * normal screen — which is the difference between "this rate has been steady
 * for a month" and "this rate spiked yesterday", the one question the table
 * cannot answer and an APR sort keeps provoking.
 *
 * It is **always mounted**, with an empty state at the same height as the plot,
 * for the same reason the rail is: a band that appeared on the first selection
 * would push the whole table down and move the row out from under the cursor.
 * The collapse toggle is how a user who does not want the chart gets those
 * ~19rem back permanently — the state is persisted by the container.
 *
 * The rail keeps the numbers (rate decomposition, terms, exit); it no longer
 * keeps the chart, so there is exactly one of these on screen. On mobile there
 * is no band at all and the sheet carries the chart instead.
 */
export const HistoryPanel: React.FC<Props> = ({ row, vocab, open, onToggleOpen }) => {
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30)
  const { points, hasSharePrice, isLoading, error } = useEarnHistory(row?.earnUid, days)

  return (
    <div className="rounded-box border border-base-300">
      {/* Header: what is charted, and the collapse control.
          The WHOLE row is the button — a bare glyph was a 12px target that read
          as decoration, and the row is 800px of otherwise dead space. The
          chevron marks it, the trailing label says what the click does, and
          both stay visible rather than appearing on hover, because a control
          you have to discover is one most people never find. */}
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-box px-3 py-2 text-left hover:bg-base-200"
        onClick={onToggleOpen}
        aria-expanded={open}
      >
        <Chevron open={open} className="h-4 w-4 text-base-content/50" />

        {row ? (
          <>
            <Logo
              src={row.logoURI}
              alt={row.venue}
              size={22}
              fallbackText={row.brand ?? row.venue}
              className="protocol-logo shrink-0"
            />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-xs font-medium" title={row.name ?? row.venue}>
                {row.name || row.brand || row.venue}
              </div>
              <div className="truncate text-[10px] text-base-content/50">
                {row.subtitle ?? row.brand ?? row.venue}
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {row.risk?.score != null && (
                <Badge
                  tone={RISK_TONE[riskBand(row.risk.score)]}
                  title={`Risk ${row.risk.score} — higher is worse.`}
                >
                  risk {row.risk.score}
                </Badge>
              )}
              <span className="text-sm font-semibold tabular-nums">
                {Number.isFinite(row.rate.total) ? formatPercent(row.rate.total) : EMPTY_VALUE}
              </span>
            </div>
          </>
        ) : (
          <span className="mr-auto text-[10px] font-semibold uppercase tracking-wide text-base-content/50">
            History
          </span>
        )}

        {/* Says what the click DOES. A chevron alone tells you something
            expands; it does not tell you what, and on a header that is mostly
            a market name that ambiguity is the whole problem. */}
        <span className="ml-2 shrink-0 text-xs text-base-content/50">
          {open ? 'Hide chart' : 'Show chart'}
        </span>
      </button>

      {open && (
        <div className="border-t border-base-300 px-3 py-2">
          {/* The SAME component with no series stands in for the empty state,
              rather than a div of a height that has to be kept in sync by hand
              — selecting a row swaps the contents and moves nothing. */}
          <HistoryChart
            points={row ? points : []}
            hasSharePrice={hasSharePrice}
            isLoading={!!row && isLoading}
            error={row ? error : null}
            size="lg"
            emptyMessage={
              row
                ? undefined
                : 'Select a market or a position to chart its APR, TVL and share price.'
            }
            controls={
              row && (
                <div role="tablist" className="tabs tabs-boxed tabs-xs">
                  {WINDOWS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      role="tab"
                      className={`tab ${days === w ? 'tab-active' : ''}`}
                      onClick={() => setDays(w)}
                    >
                      {w}d
                    </button>
                  ))}
                </div>
              )
            }
          />
        </div>
      )}
    </div>
  )
}
