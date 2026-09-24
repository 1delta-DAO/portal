import React from 'react'
import { Badge, type BadgeTone } from '../../../common/Badge'
import { Chevron } from '../../../common/Chevron'
import { abbreviateUsd, EMPTY_VALUE, formatPercent } from '../../../../utils/format'
import {
  useEarnMetrics,
  type EarnMetrics,
  type MetricsForwardThreshold,
  type MetricsThreshold,
} from '../../../../hooks/earn/useEarnMetrics'
import type { EarnMarket } from '../../../../sdk/earn-helper'

/**
 * The full withdrawability picture for the selected row — `/v1/data/earn/metrics`.
 *
 * The listing already carries the 30-day digest (`exit.history`): worst hour,
 * p05, median, one bar per day. This band answers the question the digest
 * cannot, which is the one a depositor actually has: **at MY size, for how long
 * would I have been unable to get out** — and alongside it, the two numbers a
 * rate column can never show: what the venue quoted averaged over the time each
 * quote was in force, and what a deposit actually earned.
 *
 * Three rules taken from the endpoint's own contract, because a renderer that
 * breaks them turns an honest measurement into a false promise:
 *
 *  1. **Lead with `pHorizon`, not `pInst`.** A market that is dry 23 hours out
 *     of 24 and clears every night has `pInst ≈ 0.96` and `pHorizon[24h] = 0`.
 *     The first reads as "almost always stuck"; the second is what happened to
 *     anyone who waited a day. So the matrix is horizons, and `pInst` is one
 *     column at the end.
 *  2. **Coverage and age travel with every number.** These are hourly point
 *     samples over whatever part of the window was actually recorded, so the
 *     header carries `coverage` and `asOf` and the footer says what they mean.
 *     A row that left the sweep still answers, and it must not look live.
 *  3. **A block that does not apply is SAID to not apply.** A cooldown vault
 *     gets no liquidity statistics at all (its liquidity is 0 by definition, and
 *     "stuck 100 % of the time" would misdescribe a known 7-day wait); a PT's
 *     capacity is pool depth, i.e. a price, not a wait. The server decides
 *     which via `exit.mechanism`; this component explains the decision instead
 *     of rendering zeros.
 */

const HORIZON_ORDER = ['1', '6', '24', '72', '168'] as const

const horizonLabel = (h: string): string => {
  const n = Number(h)
  if (!Number.isFinite(n)) return `${h}h`
  return n >= 48 ? `${Math.round(n / 24)}d` : `${n}h`
}

const hours = (h: number | null | undefined): string =>
  h == null ? EMPTY_VALUE : h >= 48 ? `${Math.round(h / 24)}d` : `${Math.round(h)}h`

/** Probability tone: anything above a coin flip is an error, a tenth is a warning. */
const pTone = (p: number | null): BadgeTone => {
  if (p == null) return 'neutral'
  if (p >= 0.5) return 'error'
  if (p >= 0.1) return 'warning'
  if (p > 0) return 'info'
  return 'success'
}

const pct = (p: number | null, decimals = 1): string =>
  p == null ? EMPTY_VALUE : formatPercent(p * 100, decimals)

interface Props {
  row: EarnMarket | null
  open: boolean
  onToggleOpen: () => void
}

export const WithdrawabilityPanel: React.FC<Props> = ({ row, open, onToggleOpen }) => {
  // A collapsed band must not fetch: this is one row's worth of server work and
  // the user has said they are not looking at it.
  const { metrics, isLoading, error } = useEarnMetrics(row?.earnUid, { enabled: open && !!row })

  return (
    <div className="rounded-box border border-base-300">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-box px-3 py-2 text-left hover:bg-base-200"
        onClick={onToggleOpen}
        aria-expanded={open}
      >
        <Chevron open={open} className="h-4 w-4 text-base-content/50" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-base-content/50">
          Withdrawability &amp; realized rate
        </span>
        {open && metrics && <HeaderChips metrics={metrics} />}
        <span className="ml-auto shrink-0 text-xs text-base-content/50">
          {open ? 'Hide' : 'Show'}
        </span>
      </button>

      {open && (
        <div className="border-t border-base-300 px-3 py-2">
          {!row ? (
            <p className="py-6 text-center text-xs text-base-content/50">
              Select a market or a position to measure how long its money has taken to get out.
            </p>
          ) : isLoading ? (
            <p className="py-6 text-center text-xs text-base-content/50">Measuring…</p>
          ) : error ? (
            <p className="py-6 text-center text-xs text-error">
              {error.message || 'Could not load the measurement.'}
            </p>
          ) : !metrics ? (
            <p className="py-6 text-center text-xs text-base-content/50">
              No recorded history for this row yet.
            </p>
          ) : (
            <Body metrics={metrics} />
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The same measurement with no band around it — for the mobile sheet, where
 * there is no room for a second collapsible header and the surrounding
 * `Section` already gates the mount (so this only ever fetches when open).
 */
export const WithdrawabilityDetail: React.FC<{ row: EarnMarket }> = ({ row }) => {
  const { metrics, isLoading, error } = useEarnMetrics(row.earnUid)
  if (isLoading) return <p className="text-xs text-base-content/50">Measuring…</p>
  if (error)
    return (
      <p className="text-xs text-error">{error.message || 'Could not load the measurement.'}</p>
    )
  if (!metrics)
    return <p className="text-xs text-base-content/50">No recorded history for this row yet.</p>
  return (
    <div className="space-y-2">
      <HeaderChips metrics={metrics} />
      <Body metrics={metrics} />
    </div>
  )
}

/** Coverage and age, in the header, so they are never further away than the
 *  numbers they qualify. */
const HeaderChips: React.FC<{ metrics: EarnMetrics }> = ({ metrics }) => {
  const w = metrics.window
  const stale = w.staleHours != null && w.staleHours > w.gapCapHours
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Badge
        tone={w.coverage >= 0.9 ? 'success' : w.coverage >= 0.5 ? 'warning' : 'error'}
        title={`${Math.round(w.observedHours)}h of the ${w.requestedDays}-day window carry an hourly sample. Everything measured here is measured over THAT time, not the whole window.`}
      >
        {Math.round(w.coverage * 100)}% observed
      </Badge>
      {w.asOf && (
        <Badge
          tone={stale ? 'error' : 'neutral'}
          title={
            stale
              ? `Last observed ${hours(w.staleHours)} ago — this market has dropped out of the recording, so every figure below (and the rate in the table) describes the past, not now.`
              : `Last observed ${hours(w.staleHours)} ago.`
          }
        >
          {stale ? `stale · ${hours(w.staleHours)} old` : `as of ${hours(w.staleHours)} ago`}
        </Badge>
      )}
      <Badge tone="neutral" title="Which mechanism decides whether this row's money can leave.">
        {metrics.exit.mechanism}
      </Badge>
    </span>
  )
}

const Body: React.FC<{ metrics: EarnMetrics }> = ({ metrics }) => {
  const { exit, rate, window: w } = metrics
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-3">
          <StuckMatrix metrics={metrics} />
          {exit.impact.available && <ImpactBlock metrics={metrics} />}
        </div>
        <div className="space-y-3">
          {exit.floor.available && <FloorBlock metrics={metrics} />}
          <CapacityBlock metrics={metrics} />
          <ContractualBlock metrics={metrics} />
          <DriftBlock metrics={metrics} />
          {exit.administrative.available && <AdministrativeBlock metrics={metrics} />}
          <RateBlock rate={rate} />
        </div>
      </div>

      {/* The caption is not decoration: without it a reader takes these as
          probabilities of the future rather than frequencies of a partially
          observed past. */}
      <p className="text-[10px] leading-relaxed text-base-content/40">
        Measured from hourly point samples of what could be withdrawn at once, over the{' '}
        {Math.round(w.observedHours)}h of the last {w.requestedDays} days that were recorded (
        {Math.round(w.coverage * 100)}%; {w.gaps} gap{w.gaps === 1 ? '' : 's'}, longest{' '}
        {hours(w.longestGapHours)}). <strong>Every figure is a lower bound</strong> — a trough that
        opens and closes inside one hour is never sampled — and it is a frequency over the past, not
        a forecast. Liquidity only: cooldowns, queues and maturities are the contractual block, and
        solvency is not measured here at all.
      </p>
    </div>
  )
}

/**
 * The centrepiece: for each size, how often you would have been unable to get
 * out for at least h.
 *
 * `pHorizon[h]` is the share of fully observed start instants from which the
 * market stayed below the size for the WHOLE horizon — so the column heading is
 * "stuck ≥ h", which is what the number means, rather than "p" and a tooltip.
 */
const StuckMatrix: React.FC<{ metrics: EarnMetrics }> = ({ metrics }) => {
  // Where the protocol publishes its own withdrawal limit, THAT is the binding
  // constraint and the matrix is built over it — measuring only idle cash would
  // promise sizes the protocol will not release. The header says which one is on
  // screen, because the two can differ by orders of magnitude.
  const floorBinds = metrics.exit.floor.available && metrics.exit.floor.thresholds.length > 0
  const rows = floorBinds ? metrics.exit.floor.thresholds : metrics.exit.thresholds
  const forwardAt = new Map<number, MetricsForwardThreshold>(
    metrics.exit.forward.thresholds.map((t) => [t.x, t])
  )
  if (rows.length === 0) {
    return (
      <div className="rounded-box bg-base-200/40 p-3">
        <SectionTitle>Could the money have left?</SectionTitle>
        <p className="mt-1 text-xs text-base-content/60">
          {metrics.exit.mechanism === 'contractual'
            ? 'Not a liquidity question for this row: there is no instant leg, so its withdrawable balance is zero by definition and the wait is the cooldown or queue beside it. Measuring "stuck" here would report a known wait as a lockup.'
            : metrics.exit.mechanism === 'off-chain'
              ? 'Exit is settled off-chain; nothing on-chain measures it.'
              : 'No withdrawable-capacity series is recorded for this row, so this cannot be measured. Absent, not zero.'}
        </p>
      </div>
    )
  }
  const horizons = HORIZON_ORDER.filter((h) => rows.some((r) => h in r.pHorizon))
  const showForward = metrics.exit.forward.available && forwardAt.size > 0
  return (
    <div className="overflow-x-auto rounded-box bg-base-200/40 p-3">
      <SectionTitle>
        Could the money have left?{' '}
        <span className="font-normal normal-case text-base-content/50">
          share of the window you would have been stuck for at least…
          {floorBinds ? ' · against the protocol’s own limit' : ''}
        </span>
      </SectionTitle>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-base-content/50">
            <th className="py-1 text-left font-medium">withdrawing</th>
            {horizons.map((h) => (
              <th key={h} className="py-1 text-right font-medium">
                ≥ {horizonLabel(h)}
              </th>
            ))}
            <th
              className="py-1 text-right font-medium"
              title="Share of sampled hours in which this size could not have left AT THAT MOMENT. Read it last: a market that clears every night scores high here and still never trapped anyone for a day."
            >
              any hour
            </th>
            <th
              className="py-1 text-right font-medium"
              title="Longest observed dry run at this size, censored runs included."
            >
              worst spell
            </th>
            <th
              className="py-1 text-right font-medium"
              title="Expected remaining wait for someone who arrives while the market is already dry (length-biased residual over complete runs)."
            >
              wait if dry
            </th>
            {showForward && (
              <>
                <th
                  className="py-1 text-right font-medium text-primary/70"
                  title="FORWARD, from the state the market is in now: probability of still being below this size a day from now, from a Markov chain fitted on the window's transitions. It is memoryless, so on a market that clears at a fixed hour every night it overstates — read it against the backward columns, never instead of them."
                >
                  fwd ≥ 24h
                </th>
                <th
                  className="py-1 text-right font-medium text-primary/70"
                  title="Expected hours until this size could leave, from today's state — composed from short transitions, so it can exceed anything the window actually contained. Blank when the market is not dry now; an em dash when no exit was ever observed, which is a pin rather than a wait."
                >
                  fwd wait
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <ThresholdRow
              key={t.x}
              t={t}
              horizons={horizons}
              forward={showForward ? (forwardAt.get(t.x) ?? null) : undefined}
            />
          ))}
        </tbody>
      </table>
      {showForward && !metrics.exit.forward.adequate && (
        <p className="mt-1 text-[10px] text-warning/80" title={metrics.exit.forward.note ?? ''}>
          The forward columns are under-sampled on this window — fewer than 20 transitions per
          state. Prefer the measured columns until the recording is longer.
        </p>
      )}
      {floorBinds && metrics.exit.floor.note && (
        <p className="mt-1 text-[10px] leading-relaxed text-base-content/40">
          {metrics.exit.floor.note}
        </p>
      )}
    </div>
  )
}

const ThresholdRow: React.FC<{
  t: MetricsThreshold
  horizons: readonly string[]
  /** `undefined` = no chain fitted; `null` = fitted but no rung at this size */
  forward?: MetricsForwardThreshold | null
}> = ({ t, horizons, forward }) => (
  <tr className="border-t border-base-300/50">
    <td className="py-1 font-medium tabular-nums">
      {abbreviateUsd(t.x)}
      {t.currentlyDry && (
        <Badge
          tone="error"
          className="ml-1"
          title={`Below this size right now, and has been for ${hours(t.currentRunHours)}.`}
        >
          dry now
        </Badge>
      )}
    </td>
    {horizons.map((h) => {
      const p = t.pHorizon[h] ?? null
      return (
        <td key={h} className="py-1 text-right tabular-nums">
          {p == null ? (
            <span
              className="text-base-content/30"
              title="No start instant in the window had this horizon fully observed — the window is too short, or outages cover it. Unknown, not zero."
            >
              {EMPTY_VALUE}
            </span>
          ) : (
            <span className={p >= 0.5 ? 'text-error' : p >= 0.1 ? 'text-warning' : ''}>
              {pct(p)}
            </span>
          )}
        </td>
      )
    })}
    <td className="py-1 text-right tabular-nums text-base-content/60">{pct(t.pInst)}</td>
    <td className="py-1 text-right tabular-nums">
      {t.worstHours == null ? (
        EMPTY_VALUE
      ) : (
        <span
          title={`${t.episodes} spell${t.episodes === 1 ? '' : 's'}, ${t.completeEpisodes} with both ends observed${t.censoredEpisodes ? `, ${t.censoredEpisodes} censored (their true length is a lower bound)` : ''}.`}
        >
          {hours(t.worstHours)}
        </span>
      )}
    </td>
    <td className="py-1 text-right tabular-nums text-base-content/60">
      {hours(t.meanResidualWaitHours)}
    </td>
    {forward !== undefined && (
      <>
        <td className="py-1 text-right tabular-nums text-primary/80">
          {forward ? pct(forward.pStuck['24'] ?? null) : EMPTY_VALUE}
        </td>
        <td className="py-1 text-right tabular-nums text-primary/80">
          {!forward || !forward.currentlyDry ? (
            <span className="text-base-content/30" title="Not below this size right now.">
              —
            </span>
          ) : forward.expectedWaitHours === null ? (
            <span
              className="text-error"
              title="No exit from the dry state was ever observed in this window. That is a pin, not a wait — there is no expected time at which this size becomes withdrawable."
            >
              pinned
            </span>
          ) : (
            hours(forward.expectedWaitHours)
          )}
        </td>
      </>
    )}
  </tr>
)

/**
 * The protocol's own withdrawal limit (M5).
 *
 * Kept as its own block and placed ABOVE the observed capacity, because where it
 * exists it is the binding number and the observed one is a narrower question.
 * Two shapes: a Fluid-style floor under the supply, and a savings provider's own
 * instant-leg inventory — which for several providers sits somewhere our
 * liquidity read does not look, so on those rows this is the only honest figure.
 */
const FloorBlock: React.FC<{ metrics: EarnMetrics }> = ({ metrics }) => {
  const f = metrics.exit.floor
  const locked = f.latestLockedRatio
  return (
    <div className="rounded-box border border-warning/30 bg-warning/5 p-3">
      <SectionTitle>
        {f.kind === 'provider-instant-leg'
          ? 'The provider’s own limit'
          : 'The protocol’s own floor'}
      </SectionTitle>
      <div className="mt-1 space-y-0.5 text-xs">
        <Row
          label="Locked now"
          hint={
            f.kind === 'provider-instant-leg'
              ? 'Share of the vault its instant leg cannot pay out this block, as the provider reports it.'
              : 'Share of the supply the protocol will not release right now — a floor, not a shortage of cash.'
          }
        >
          <span className={(locked ?? 0) > 0.5 ? 'text-error' : ''}>
            {locked == null ? EMPTY_VALUE : formatPercent(locked * 100, 1)}
          </span>
        </Row>
        {f.lockedRatio && (
          <Row label="Worst hour" hint="The most that was locked in any sampled hour.">
            {formatPercent(f.lockedRatio.max * 100, 1)}
          </Row>
        )}
        {f.capacityUsd && (
          <>
            <Row
              label="Binding capacity"
              hint="min(idle liquidity, what the limit allows) — the number a withdrawal actually meets. The matrix on the left is computed over this series."
            >
              {abbreviateUsd(f.capacityUsd.median)}
            </Row>
            <Row
              label="Worst hour"
              hint="Least that could have left in any sampled hour, after the limit."
            >
              {abbreviateUsd(f.capacityUsd.worst)}
            </Row>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * What leaving DOES (M5).
 *
 * A withdrawal does not only consume liquidity, it raises utilization for whoever
 * stays — and that rising rate is the mechanism by which the liquidity comes
 * back. Both halves of that matter to a depositor: the first is what their exit
 * costs everyone else, the second is why the next depositor's wait is shorter
 * than the last one's.
 */
const ImpactBlock: React.FC<{ metrics: EarnMetrics }> = ({ metrics }) => {
  const im = metrics.exit.impact
  if (im.points.length === 0) return null
  return (
    <div className="overflow-x-auto rounded-box bg-base-200/40 p-3">
      <SectionTitle>
        If you leave{' '}
        <span className="font-normal normal-case text-base-content/50">
          what your exit does to the market you are leaving
        </span>
      </SectionTitle>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-base-content/50">
            <th className="py-1 text-left font-medium">withdrawing</th>
            <th className="py-1 text-right font-medium">of the pool</th>
            <th className="py-1 text-right font-medium" title="debt / (deposits − x)">
              utilization →
            </th>
            <th className="py-1 text-right font-medium">borrow APR →</th>
            <th className="py-1 text-right font-medium">supply APR →</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-base-300/50 text-base-content/60">
            <td className="py-1">now</td>
            <td className="py-1 text-right">—</td>
            <td className="py-1 text-right tabular-nums">
              {im.currentUtilization == null
                ? EMPTY_VALUE
                : formatPercent(im.currentUtilization * 100, 1)}
            </td>
            <td className="py-1 text-right tabular-nums">
              {im.currentBorrowAprPct == null ? EMPTY_VALUE : formatPercent(im.currentBorrowAprPct)}
            </td>
            <td className="py-1 text-right tabular-nums">
              {im.currentDepositAprPct == null
                ? EMPTY_VALUE
                : formatPercent(im.currentDepositAprPct)}
            </td>
          </tr>
          {im.points.map((p) => (
            <tr key={p.x} className="border-t border-base-300/50">
              <td className="py-1 tabular-nums">
                {abbreviateUsd(p.x)}
                {p.exceedsLiquidity && (
                  <Badge
                    tone="error"
                    className="ml-1"
                    title="Larger than the pool's idle balance: this withdrawal cannot complete in one block at all, whatever the rate would have been."
                  >
                    over
                  </Badge>
                )}
              </td>
              <td className="py-1 text-right tabular-nums text-base-content/60">
                {p.shareOfDeposits == null
                  ? EMPTY_VALUE
                  : formatPercent(p.shareOfDeposits * 100, 1)}
              </td>
              <td className="py-1 text-right tabular-nums">
                {p.utilization == null ? EMPTY_VALUE : formatPercent(p.utilization * 100, 1)}
              </td>
              <td className="py-1 text-right tabular-nums">
                {p.borrowAprPct == null ? EMPTY_VALUE : formatPercent(p.borrowAprPct)}
              </td>
              <td className="py-1 text-right tabular-nums">
                {p.depositAprPct == null ? EMPTY_VALUE : formatPercent(p.depositAprPct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Why the liquidity comes back — or does not (M6 / L4).
 *
 * This is the block that separates two markets the measured columns cannot tell
 * apart: one at 95 % utilization with a punitive kink above it, back to normal
 * within hours, and one at 95 % with a flat curve, where nothing is pushing and it
 * simply stays there.
 */
const DriftBlock: React.FC<{ metrics: EarnMetrics }> = ({ metrics }) => {
  const d = metrics.exit.drift
  if (!d.available) return null
  return (
    <div className="rounded-box bg-base-200/40 p-3">
      <SectionTitle>Does the rate pull it back?</SectionTitle>
      <div className="mt-1 space-y-0.5 text-xs">
        {d.irmSlopeAtCurrent != null && (
          <Row
            label="Curve steepness here"
            hint="d(borrow APR)/d(utilization) at today's utilization, from the market's own IRM. A big number means ten more points of utilization costs a borrower a lot — which is the force that pulls liquidity back."
          >
            {`${(d.irmSlopeAtCurrent / 100).toFixed(2)} pp / pt`}
          </Row>
        )}
        {d.fit && (
          <>
            <Row
              label="Mean reversion"
              hint={`OLS of the 24h change in utilization on utilization and on the rate's distance from its own median, over ${d.fit.n} observations (R² ${d.fit.r2.toFixed(2)}).`}
            >
              {d.fit.uCoef < 0 ? (
                <span className="text-success">yes</span>
              ) : (
                <span className="text-warning">not measurable</span>
              )}
            </Row>
            {d.fit.halfLifeHours != null && (
              <Row
                label="Shock half-life"
                hint="Implied by the fit: how long a jump in utilization takes to half-decay."
              >
                {hours(d.fit.halfLifeHours)}
              </Row>
            )}
          </>
        )}
      </div>
      {d.unbounded && (
        <p className="mt-2 text-[10px] leading-relaxed text-error/80">
          This family’s IRM has no ceiling: above its target the rate ratchets indefinitely, so a
          pinned market here does not refill by repayment — it resolves by the borrower defaulting.
          Read any wait above as a solvency path, not a queue.
        </p>
      )}
      {!d.fit && d.note && (
        <p className="mt-2 text-[10px] leading-relaxed text-base-content/40">{d.note}</p>
      )}
    </div>
  )
}

const CapacityBlock: React.FC<{ metrics: EarnMetrics }> = ({ metrics }) => {
  const cap = metrics.exit.capacityUsd
  const ratio = metrics.exit.capacityRatio
  if (!cap) return null
  const line = (label: string, usd: number, r: number | undefined, hint?: string) => (
    <Row label={label} hint={hint}>
      {abbreviateUsd(usd)}
      {r != null && (
        <span className="ml-1 text-base-content/40">({formatPercent(r * 100, 1)} of TVL)</span>
      )}
    </Row>
  )
  return (
    <div className="rounded-box bg-base-200/40 p-3">
      <SectionTitle>Withdrawable at once</SectionTitle>
      <div className="mt-1 space-y-0.5 text-xs">
        {line(
          'Worst hour',
          cap.worst,
          ratio?.worst,
          'The least that could have left in any sampled hour.'
        )}
        {line(
          '95% of hours ≥',
          cap.p05,
          ratio?.p05,
          'In 19 of 20 sampled hours, at least this much could have left.'
        )}
        {line('Median', cap.median, ratio?.median)}
        {line(
          'Latest',
          cap.latest,
          ratio?.latest,
          'The most recent sample — as old as the header says.'
        )}
      </div>
    </div>
  )
}

const ContractualBlock: React.FC<{ metrics: EarnMetrics }> = ({ metrics }) => {
  const c = metrics.exit.contractual
  const days = (s: number | null) => (s == null ? null : s / 86400)
  const cooldownDays = days(c.cooldownSeconds)
  return (
    <div className="rounded-box bg-base-200/40 p-3">
      <SectionTitle>The wait that is written down</SectionTitle>
      <div className="mt-1 space-y-0.5 text-xs">
        <Row label="Mode">{c.withdrawalMode ?? metrics.exit.mechanism}</Row>
        {cooldownDays != null && (
          <Row label="Cooldown" hint="Deterministic, known at deposit time — not a probability.">
            {cooldownDays >= 1
              ? `${cooldownDays.toFixed(cooldownDays < 10 ? 1 : 0)}d`
              : hours(cooldownDays * 24)}
          </Row>
        )}
        {c.instantFeeBps != null && <Row label="Instant-exit fee">{c.instantFeeBps} bps</Row>}
        {c.termDays && (
          <Row
            label={metrics.exit.mechanism === 'fixed-maturity' ? 'Time to maturity' : 'Term'}
            hint="Principal comes back at maturity; leaving earlier is a sale on a book, at whatever price it clears."
          >
            {c.termDays.min === c.termDays.max
              ? `${c.termDays.min.toFixed(c.termDays.min < 10 ? 1 : 0)}d`
              : `${c.termDays.min.toFixed(0)}–${c.termDays.max.toFixed(0)}d`}
          </Row>
        )}
        <Row label="Legs">
          {[c.hasInstantLeg ? 'instant' : null, c.hasQueuedLeg ? 'queued' : null]
            .filter(Boolean)
            .join(' + ') || 'none published'}
        </Row>
        {c.instantLiquidityRatio != null && (
          <Row label="Exitable now" hint="Share of the row's own size that could leave this block.">
            {formatPercent(c.instantLiquidityRatio * 100, 2)}
          </Row>
        )}
      </div>
      {c.note && <p className="mt-2 text-[10px] leading-relaxed text-base-content/50">{c.note}</p>}
    </div>
  )
}

/**
 * The administrative mechanism — a freeze, not a drought. Kept separate on
 * purpose: it is a rare jump event, and averaging it into a liquidity
 * probability would hide both.
 */
const AdministrativeBlock: React.FC<{ metrics: EarnMetrics }> = ({ metrics }) => {
  const a = metrics.exit.administrative
  const flags = a.current ?? {}
  const inactive = flags.isActive === false
  return (
    <div className="rounded-box bg-base-200/40 p-3">
      <SectionTitle>Switches</SectionTitle>
      <div className="mt-1 space-y-0.5 text-xs">
        <Row label="Live now" hint="`is_active` — the flag that stops withdrawals outright.">
          {inactive ? <span className="text-error">no</span> : 'yes'}
        </Row>
        <Row
          label="Flag changes"
          hint="Transitions recorded inside the window. A freeze that flipped back is invisible in the liquidity series — this is where it shows."
        >
          {a.transitions}
        </Row>
        {a.inactiveHours != null && a.inactiveHours > 0 && (
          <Row label="Hours not live">{hours(a.inactiveHours)}</Row>
        )}
      </div>
      {a.events.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[10px] text-base-content/50">
          {a.events.slice(-4).map((e) => (
            <li key={e.at} className="truncate" title={`${e.at} ${JSON.stringify(e.changed)}`}>
              {new Date(e.at).toISOString().slice(0, 16).replace('T', ' ')} ·{' '}
              {Object.entries(e.changed)
                .map(([k, v]) => `${k}=${String(v)}`)
                .join(', ')}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Quoted versus realized.
 *
 * `quoted.twaPct` is the rate averaged by the time each quote was in force —
 * not by how many rows the recorder happened to write, which is what a plain
 * average of the series would measure. `realized` is the exact first-to-last
 * ratio of the accumulator (a vault share price, a lending supply index), so it
 * is path-independent and assumes no compounding. The gap between them is the
 * point of the block: it is what the venue advertised minus what a deposit got.
 */
const RateBlock: React.FC<{ rate: EarnMetrics['rate'] }> = ({ rate }) => {
  const r = rate.realized
  return (
    <div className="rounded-box bg-base-200/40 p-3">
      <SectionTitle>Quoted vs realized</SectionTitle>
      <div className="mt-1 space-y-0.5 text-xs">
        <Row
          label="Quoted (time-weighted)"
          hint={`The rate averaged over the ${Math.round(rate.quoted.observedHours)}h each quote was in force, across ${rate.quoted.samples} samples.`}
        >
          {rate.quoted.twaPct == null ? EMPTY_VALUE : formatPercent(rate.quoted.twaPct)}
        </Row>
        {r ? (
          <>
            <Row
              label="Realized"
              hint={`Exact ${r.source === 'share_price' ? 'share-price' : 'supply-index'} growth over ${r.spanDays.toFixed(1)} days, annualized simply. Denominated in ${r.denomination === 'usd' ? 'USD' : 'the underlying asset'}.`}
            >
              <span className={r.aprPct < 0 ? 'text-error' : ''}>{formatPercent(r.aprPct)}</span>
            </Row>
            {rate.gapPp != null && (
              <Row
                label="Gap"
                hint="Realized minus quoted, in percentage points. Negative means the row paid less than it advertised over this window."
              >
                <span className={rate.gapPp < -0.25 ? 'text-warning' : ''}>
                  {rate.gapPp >= 0 ? '+' : ''}
                  {rate.gapPp.toFixed(2)} pp
                </span>
              </Row>
            )}
            {r.flat && (
              <p className="pt-1 text-[10px] leading-relaxed text-base-content/50">
                The accumulator did not move across the window — a rebasing share (growth shows in
                the balance, not the price) or a dead series. Not a measured 0 %.
              </p>
            )}
          </>
        ) : (
          <p className="pt-1 text-[10px] leading-relaxed text-base-content/50">
            No realized figure: this row has no recorded accumulator (share price or supply index)
            over a long enough span. Absent rather than restating the quote as if it had been
            earned.
          </p>
        )}
        {rate.rewards && <RewardLegRows rewards={rate.rewards} total={rate.totalAprPct} />}
      </div>
    </div>
  )
}

/**
 * The reward leg (M7 / A5), kept apart from the base one.
 *
 * The accumulator captures base only, and a reward APR is the venue's forecast
 * even when the base leg is exact — so these are never silently added into
 * "realized". What the integral buys is honesty about time: a stream that ended
 * mid-window is paid only for the hours it existed, where averaging its APR
 * across the window would pay it after it stopped.
 */
const RewardLegRows: React.FC<{
  rewards: NonNullable<EarnMetrics['rate']['rewards']>
  total: number | null
}> = ({ rewards, total }) => (
  <>
    <Row
      label="Rewards (integrated)"
      hint={`${rewards.note} Basis: ${rewards.basis ?? 'none'} — 'usd' is the venue's own valuation at each hour, 'quoted-apr' is its forecast.`}
    >
      {rewards.aprPct == null ? EMPTY_VALUE : formatPercent(rewards.aprPct)}
      {rewards.basis === 'quoted-apr' && (
        <Badge
          tone="warning"
          className="ml-1"
          title="No USD value was published for these streams, so this leg is an integral of the venue's forecast rate rather than of money it valued."
        >
          quoted
        </Badge>
      )}
    </Row>
    {total != null && (
      <Row
        label="Base + rewards"
        hint="A MIXED figure by construction: an exact accumulator ratio plus an integral of published reward rates. Shown beside its parts, never instead of them."
      >
        {formatPercent(total)}
      </Row>
    )}
    {rewards.streams.length > 0 && (
      <ul className="pt-1 text-[10px] text-base-content/50">
        {rewards.streams.slice(0, 4).map((st) => (
          <li
            key={st.token}
            className="truncate"
            title={`${st.sourceLabel ?? st.source ?? ''} · ${st.token}`}
          >
            {st.symbol ?? st.token.slice(0, 8)} ·{' '}
            {st.valueUsd != null
              ? abbreviateUsd(st.valueUsd)
              : formatPercent((st.aprIntegral ?? 0) * 100, 2)}{' '}
            over {hours(st.observedHours)}
          </li>
        ))}
      </ul>
    )}
  </>
)

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[10px] font-semibold uppercase tracking-wide text-base-content/50">
    {children}
  </div>
)

const Row: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({
  label,
  hint,
  children,
}) => (
  <div className="flex items-baseline justify-between gap-2" title={hint}>
    <span className="text-base-content/50">{label}</span>
    <span className="text-right tabular-nums">{children}</span>
  </div>
)
