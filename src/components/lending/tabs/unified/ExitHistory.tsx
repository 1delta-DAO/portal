import React from 'react'
import { Badge, type BadgeTone } from '../../../common/Badge'
import { abbreviateUsd, formatPercent } from '../../../../utils/format'
import type { EarnExitHistory, EarnExitHistoryDay } from '../../../../sdk/earn-helper'

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

/**
 * The lockup chart, listing-sized: one bar per UTC day of the digest window,
 * height = the day's WORST withdrawable share of TVL, colour = how much of
 * the day was dry. Drawn from `exit.history.daily`, which rides on the
 * listing row — no request, so it can sit in the detail panel the moment a
 * row is selected; the full hourly series is the "Withdrawable" tab of the
 * history chart.
 *
 * Honesty rules, same as the digest it comes from:
 *  - **Days are placed by DATE, not by index.** A day with no sample is an
 *    empty slot, so a gap in the recording reads as a gap — never as "was
 *    fine".
 *  - **Height is the worst hour of the day**, not the mean: the question is
 *    "could I have gotten out", and one dry hour answers it.
 *  - **Everything is a lower bound** (hourly samples), which is why the
 *    caption says so instead of the bars implying precision.
 */
export const ExitHistoryStrip: React.FC<{ history: EarnExitHistory; className?: string }> = ({
  history,
  className = '',
}) => {
  const daily = history.daily ?? []
  if (daily.length === 0) return null
  const byDate = new Map<string, EarnExitHistoryDay>(daily.map((d) => [d.d, d]))
  // The window ends on the last sampled day and spans `days` calendar days
  // back from it, so the strip is always the same width for the same window.
  const last = daily[daily.length - 1].d
  const end = new Date(`${last}T00:00:00Z`).getTime()
  const slots: { d: string; day?: EarnExitHistoryDay }[] = []
  for (let i = history.days - 1; i >= 0; i--) {
    const d = new Date(end - i * 86_400_000).toISOString().slice(0, 10)
    slots.push({ d, day: byDate.get(d) })
  }
  const H = 28
  return (
    <div className={`w-full ${className}`}>
      <div
        className="flex items-end gap-px"
        style={{ height: H }}
        role="img"
        aria-label={`Worst withdrawable share of TVL per day over the last ${history.days} days`}
      >
        {slots.map(({ d, day }) => {
          if (!day) {
            return (
              <div
                key={d}
                className="flex-1 border-b border-dotted border-base-content/20"
                title={`${d}: no sample`}
              />
            )
          }
          const ratio = day.worstRatio
          // A null ratio is a TVL of zero — nothing to be a share OF. Drawn as
          // a floor mark, distinct from a dry day (a real 0).
          const h = ratio == null ? 0 : Math.max(1, Math.round(ratio * H))
          const dryPart = day.samples > 0 ? day.dryHours / day.samples : 0
          const tone =
            dryPart >= 0.5
              ? 'bg-error'
              : dryPart > 0
                ? 'bg-warning'
                : ratio == null
                  ? 'bg-base-content/30'
                  : 'bg-success/70'
          const title = [
            d,
            `worst hour ${day.worstUsd != null ? abbreviateUsd(day.worstUsd) : '—'}${
              ratio != null ? ` (${formatPercent(ratio * 100, 0)} of TVL)` : ''
            }`,
            day.dryHours > 0
              ? `dry ${day.dryHours} of ${day.samples} sampled hours`
              : `${day.samples} samples, never dry`,
          ].join(' · ')
          return (
            <div key={d} className="flex flex-1 items-end" style={{ height: H }} title={title}>
              <div
                className={`w-full rounded-sm ${tone}`}
                style={{ height: ratio == null ? 2 : h }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-0.5 flex justify-between text-[9px] text-base-content/40">
        <span>{slots[0].d.slice(5)}</span>
        <span>worst hour each day · share of TVL withdrawable</span>
        <span>{last.slice(5)}</span>
      </div>
    </div>
  )
}
