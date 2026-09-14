import React from 'react'
import { Badge, type BadgeTone } from '../../../common/Badge'
import { abbreviateUsd, formatPercent } from '../../../../utils/format'
import type { EarnExitHistory } from '../../../../sdk/earn-helper'

/**
 * The measured lockup picture for one earn row — `exit.history` from
 * `/v1/data/earn`. Two renderings of the same digest: a one-line hint for the
 * table's Exit column, and the field list in the detail panel.
 *
 * What it says and does not say. This is the LIQUIDITY mechanism only —
 * "could the money have left, at once, over the last 30 days" — measured
 * from hourly samples, so every number is a lower bound (a trough inside one
 * hour is invisible). It is withheld by the server for cooldown / queued
 * rows, whose 0 liquidity is a wait rather than a lockup probability, so
 * its absence on those is correct and the cooldown badge stands alone.
 */

const hours = (h: number): string => (h >= 48 ? `${Math.round(h / 24)}d` : `${Math.round(h)}h`)

/** Severity for the badge: dry right now > a day-long or frequent dry spell >
 *  any dry spell at all > never dry. */
export function exitHistoryTone(h: EarnExitHistory): BadgeTone {
  if (h.currentlyDry) return 'error'
  if ((h.worstDrySpellHours ?? 0) >= 24 || (h.dryShare ?? 0) >= 0.1) return 'warning'
  if (h.dryEpisodes > 0) return 'info'
  return 'success'
}

export function exitHistoryTitle(h: EarnExitHistory): string {
  const cap = h.capacityUsd
  const lines = [
    `Withdrawable at once, last ${h.days}d (hourly samples, ${Math.round(h.coverage * 100)}% observed):`,
    `  worst hour ${cap.worst != null ? abbreviateUsd(cap.worst) : '—'}`,
    `  95% of hours ≥ ${cap.p05 != null ? abbreviateUsd(cap.p05) : '—'}`,
    `  median ${cap.median != null ? abbreviateUsd(cap.median) : '—'}`,
    h.dryEpisodes > 0
      ? `Dry (< max($1k, 0.5% of TVL)) ${formatPercent((h.dryShare ?? 0) * 100, 1)} of the time — ${h.dryEpisodes} spell${h.dryEpisodes === 1 ? '' : 's'}, longest ${hours(h.worstDrySpellHours ?? 0)}${h.currentlyDry ? ', dry right now' : ''}`
      : 'Never dry in the window',
    'Every figure is a lower bound: a trough shorter than an hour is not sampled.',
  ]
  return lines.join('\n')
}

/** One line for the table: what the worst 30-day stretch looked like. */
export const ExitHistoryHint: React.FC<{ history?: EarnExitHistory }> = ({ history }) => {
  if (!history) return null
  const tone = exitHistoryTone(history)
  const label =
    history.dryEpisodes === 0
      ? `liquid ${history.days}d`
      : history.currentlyDry
        ? `dry now · ${hours(history.worstDrySpellHours ?? 0)} worst`
        : `dry ${formatPercent((history.dryShare ?? 0) * 100, 0)} · ${hours(history.worstDrySpellHours ?? 0)} worst`
  return (
    <Badge tone={tone} className="ml-1" title={exitHistoryTitle(history)}>
      {label}
    </Badge>
  )
}

/** Field rows for the detail panel. `Field` is the panel's own primitive,
 *  passed in so this file does not depend on the panel's internals. */
export function exitHistoryFields(
  h: EarnExitHistory,
  Field: React.FC<{ label: string; value: string; warn?: boolean; hint?: string }>
): React.ReactNode {
  const cap = h.capacityUsd
  const ratio = h.capacityRatio
  const usdAndRatio = (usd: number | null, r: number | null) =>
    usd == null
      ? '—'
      : `${abbreviateUsd(usd)}${r != null ? ` (${formatPercent(r * 100, 0)} of TVL)` : ''}`
  return (
    <>
      <Field
        label="Worst hour"
        value={usdAndRatio(cap.worst, ratio.worst)}
        warn={(cap.worst ?? 1) <= 0}
        hint="The least that could be withdrawn at once in any sampled hour of the window."
      />
      <Field
        label="95% of hours ≥"
        value={usdAndRatio(cap.p05, ratio.p05)}
        hint="5th percentile of withdrawable capacity — in 19 of 20 sampled hours at least this much could leave."
      />
      <Field label="Median" value={usdAndRatio(cap.median, ratio.median)} />
      <Field
        label="Dry share"
        value={h.dryShare != null ? formatPercent(h.dryShare * 100, 1) : '—'}
        warn={(h.dryShare ?? 0) >= 0.1}
        hint="Share of sampled hours with less than max($1k, 0.5% of TVL) withdrawable."
      />
      <Field
        label="Dry spells"
        value={
          h.dryEpisodes === 0
            ? 'none'
            : `${h.dryEpisodes} · longest ${hours(h.worstDrySpellHours ?? 0)}${h.currentlyDry ? ' · dry now' : ''}`
        }
        warn={h.currentlyDry || (h.worstDrySpellHours ?? 0) >= 24}
        hint="Maximal runs of consecutive dry hours. A spell that reaches the window edge is still counted."
      />
      <Field
        label="Observed"
        value={`${Math.round(h.coverage * 100)}% of ${h.days}d`}
        hint="Share of the window with an hourly sample. Every figure above is a LOWER bound — a trough shorter than an hour is not sampled."
      />
    </>
  )
}
