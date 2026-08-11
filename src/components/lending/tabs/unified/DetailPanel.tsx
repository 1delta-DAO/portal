import React, { useState } from 'react'
import { Logo } from '../../../common/Logo'
import { useEarnHistory } from '../../../../hooks/earn/useEarnHistory'
import { HistoryChart } from './HistoryChart'
import { EarnActionPanel } from './EarnActionPanel'
import { TermSheetPanel } from './TermSheetPanel'
import {
  vocabDescription,
  vocabLabel,
  type EarnMarket,
  type EarnVocabulary,
} from '../../../../sdk/earn-helper'

interface Props {
  row: EarnMarket
  vocab: EarnVocabulary
  onClose: () => void
}

const WINDOWS = [7, 30, 90] as const

/**
 * Detail panel for a selected earn row: history on the left, actions on the
 * right.
 *
 * The split is the point. The left side answers "has this rate been real, or
 * is today a spike?" — which the table cannot show, and which matters most for
 * exactly the rows an APR sort floats to the top. The right side is the action
 * surface, driven entirely by `row.capabilities`, so it needs no knowledge of
 * which venue this is.
 */
export const DetailPanel: React.FC<Props> = ({ row, vocab, onClose }) => {
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30)
  const { points, hasSharePrice, isLoading, error } = useEarnHistory(row.earnUid, days)

  const pct = (v?: number) => (v === undefined || !Number.isFinite(v) ? '—' : `${v.toFixed(2)}%`)

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-3 p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {/* The panel is the focused view of ONE market, so its identity
                gets real weight here rather than the row-sized treatment.
                Circular crop matches the table: token art mixes square and
                round sources, so the shape is ours to decide, not the
                provider's. `ring` keeps a light-on-light logo from dissolving
                into the card. */}
            <span className="shrink-0 overflow-hidden rounded-full ring-1 ring-base-300">
              <Logo
                src={row.logoURI}
                alt={row.venue}
                size={44}
                fallbackText={row.brand ?? row.venue}
                className="rounded-full"
              />
            </span>
            <div className="min-w-0">
              {/* Market first, brand second — same ordering as the table, so
                  the header does not disagree with the row that opened it. */}
              <div className="truncate text-lg font-semibold leading-tight" title={row.name}>
                {row.name || row.brand || row.venue}
              </div>
              <div className="truncate text-xs opacity-60" title={row.venue}>
                {row.curator?.name ? `${row.curator.name} · ` : ''}
                {row.protocol?.name ?? (row.name && row.brand ? row.brand : '')}
                {row.protocol?.name ? ' · ' : ''}
                {vocabLabel(vocab, 'venueKind', row.venueKind)}
                {row.asset.symbol ? ` · ${row.asset.symbol}` : ''}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* ── Left / centre: history ─────────────────────────────────── */}
          <div className="lg:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs opacity-60">History</span>
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
            </div>

            <HistoryChart
              points={points}
              hasSharePrice={hasSharePrice}
              isLoading={isLoading}
              error={error}
            />

            {/* Rate decomposition — a single APR cannot say where it comes
                from, and for a yield-bearing collateral that is the whole
                question. */}
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              <Field label="Total APR" value={pct(row.rate.total)} />
              <Field
                label="Venue APR"
                value={pct(row.rate.marketOwn)}
                warn={row.rate.passthrough}
                hint={
                  row.rate.passthrough
                    ? 'This venue pays nothing of its own — the headline is what the asset already earns in your wallet.'
                    : 'What this venue pays for taking its risk.'
                }
              />
              {row.rate.intrinsic !== undefined && (
                <Field label="Asset yield" value={pct(row.rate.intrinsic)} />
              )}
              {row.rate.rewards !== undefined && (
                <Field label="Rewards" value={pct(row.rate.rewards)} />
              )}
              <Field label="Rate type" value={vocabLabel(vocab, 'rateKind', row.rate.kind)} />
              <Field label="Source" value={vocabLabel(vocab, 'rateSource', row.rate.source)} />
              {row.utilization !== undefined && (
                <Field label="Utilization" value={`${(row.utilization * 100).toFixed(1)}%`} />
              )}
              {row.risk?.yieldProfile && <Field label="Profile" value={row.risk.yieldProfile} />}
              {row.risk?.score != null && (
                <Field
                  label="Risk score"
                  value={`${row.risk.score}${row.risk.label ? ` · ${row.risk.label}` : ''}`}
                  warn={row.risk.score >= 4}
                  hint="Worst of chain, lender and collateral risk. Higher is worse; the API lists <= 4 by default."
                />
              )}
            </div>

            <TermSheetPanel termSheet={row.termSheet} />
          </div>

          {/* ── Right: actions ─────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 lg:border-l lg:border-base-300 lg:pl-4">
            <div>
              <div className="text-xs opacity-60">Exit</div>
              <div
                className="text-sm font-medium"
                title={vocabDescription(vocab, 'exitMode', row.exit.mode)}
              >
                {vocabLabel(vocab, 'exitMode', row.exit.mode)}
              </div>
              <div className="text-[11px] opacity-60">
                {vocabDescription(vocab, 'exitMode', row.exit.mode)}
              </div>
              {row.exit.cooldownSecs ? (
                <div className="mt-1 text-[11px]">
                  Cooldown: {Math.round(row.exit.cooldownSecs / 86400)} days
                </div>
              ) : null}
              {row.exit.feeBps != null ? (
                <div className="text-[11px]">Instant-exit fee: {row.exit.feeBps} bps</div>
              ) : null}
            </div>

            {row.risk?.illiquid && (
              <div className="alert alert-error py-2">
                <span className="text-[11px]">
                  Reports a same-block exit but zero liquidity — you can enter this position and be
                  unable to leave it.
                </span>
              </div>
            )}

            {!row.availability.canDeposit && (
              <div className="alert alert-warning py-2">
                <span className="text-[11px]">
                  {row.availability.reason ?? vocabLabel(vocab, 'gating', row.availability.gating)}
                </span>
              </div>
            )}

            <EarnActionPanel row={row} vocab={vocab} />

            <code className="mt-auto break-all text-[10px] opacity-40" title={row.earnUid}>
              {row.earnUid}
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  warn,
  hint,
}: {
  label: string
  value: string
  warn?: boolean
  hint?: string
}) {
  return (
    <div title={hint}>
      <div className="opacity-60">{label}</div>
      <div className={`font-medium ${warn ? 'text-warning' : ''}`}>{value}</div>
    </div>
  )
}
