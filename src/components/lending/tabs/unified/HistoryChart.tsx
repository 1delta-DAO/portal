import React, { useId, useMemo, useState } from 'react'
import type { EarnHistoryPoint } from '../../../../hooks/earn/useEarnHistory'
import { Badge } from '../../../common/Badge'
import { Skeleton } from '../../../common/Loader'
import { EMPTY_VALUE, abbreviateUsd, formatPercent } from '../../../../utils/format'

type Metric = 'apr' | 'tvlUsd' | 'sharePrice' | 'liquidityUsd'

interface Props {
  points: EarnHistoryPoint[]
  hasSharePrice: boolean
  /**
   * Whether the series carries `liquidityUsd` — the withdrawable-at-once
   * capacity the lockup chart plots. Told by the server; a PT / GM row has
   * none and gets no tab, rather than a flat line at zero.
   */
  hasLiquidity?: boolean
  isLoading?: boolean
  error?: Error | null
  /**
   * `lg` for the wide band above the table, where the extra height is what the
   * horizontal room buys you; `sm` in the rail / mobile sheet.
   */
  size?: 'sm' | 'lg'
  /**
   * Rendered beside the metric tabs — the time-window picker lives here rather
   * than in a header row of its own, so a chart costs one row of chrome and not
   * two.
   */
  controls?: React.ReactNode
  /**
   * What stands in for the plot when there is no series. Defaults to the
   * "nothing recorded yet" wording; the band above the table overrides it with
   * "nothing selected", which is a different fact.
   */
  emptyMessage?: string
}

const METRIC_LABEL: Record<Metric, string> = {
  apr: 'APR',
  tvlUsd: 'TVL',
  sharePrice: 'Share price',
  // What could have left the venue at once, hour by hour. The lockup chart:
  // a trough here is the market being lent out, and the digest's "dry" hours
  // are exactly the points on this line below max($1k, 0.5% of TVL).
  liquidityUsd: 'Withdrawable',
}

/** Horizontal gridlines (and their labels), including the two end ticks. */
const TICK_COUNT = { sm: 3, lg: 4 } as const

/** viewBox units. The box is stretched to the container, so these are ratios. */
const W = 640
const H = 160
const PAD_X = 3
/** Vertical breathing room so the extremes don't graze the frame. */
const PAD_Y = 12

/** Height of the date row under the plot — held by the empty states too. */
const AXIS_ROW_H = 'h-3.5'
/** Width of the value gutter on the right, matched by the axis row's spacer. */
const GUTTER_W = 'w-14'

const DAY = 86_400_000

/**
 * Inline SVG line chart for one earn row's history.
 *
 * Hand-rolled rather than pulling in a charting library: this app ships no
 * chart dependency today, and a single-series line with a hover readout is a
 * ~200-line problem. A library here would cost more bundle than the whole tab.
 *
 * Deliberate choices about honesty:
 *  - **X is time, not sample index.** The recorder's cadence is not uniform —
 *    a backfill or an outage changes how many points land in a day — and an
 *    index axis silently stretches the dense stretches and squeezes the sparse
 *    ones. Spacing points by their timestamp means a gap in the recording
 *    reads as a gap.
 *  - **The Y axis is not forced to zero.** An APR series that moves between
 *    3.1 % and 3.4 % would look like a flat line against a 0 baseline, hiding
 *    exactly the variation the chart exists to show. Every gridline is
 *    labelled, so the scale is never implied.
 *  - **Gaps are gaps.** Points with no value for the selected metric break the
 *    line (and its fill) instead of being interpolated across.
 *  - **Fewer than two points renders no line**, with a message, rather than a
 *    dot that suggests a series exists.
 *
 * Rendering notes: the viewBox is stretched (`preserveAspectRatio="none"`), so
 * anything that must stay circular — the hover dot, the last-value dot — is an
 * absolutely positioned HTML element at a percentage offset rather than an SVG
 * circle, which would come out as an ellipse. Strokes carry
 * `vectorEffect="non-scaling-stroke"` for the same reason.
 */
export const HistoryChart: React.FC<Props> = ({
  points,
  hasSharePrice,
  hasLiquidity = false,
  isLoading,
  error,
  size = 'sm',
  controls,
  emptyMessage = 'Not enough history recorded for this market yet',
}) => {
  const [metric, setMetric] = useState<Metric>('apr')
  const [hover, setHover] = useState<number | null>(null)
  // One height for the plot and for every state that stands in for it, so
  // loading → empty → drawn never changes the block's size.
  const plotH = size === 'lg' ? 'h-56' : 'h-40'
  // Gradient ids must not collide when the rail and the band are both mounted.
  const gradientId = `hist-fill-${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  const metrics: Metric[] = [
    'apr',
    'tvlUsd',
    ...(hasSharePrice ? (['sharePrice'] as Metric[]) : []),
    ...(hasLiquidity ? (['liquidityUsd'] as Metric[]) : []),
  ]

  const series = useMemo(
    () => points.map((p) => ({ t: new Date(p.t).getTime(), v: p[metric] })),
    [points, metric]
  )

  const defined = useMemo(
    () => series.filter((s) => s.v !== undefined && Number.isFinite(s.v) && Number.isFinite(s.t)),
    [series]
  )

  const geom = useMemo(() => {
    if (defined.length < 2) return null
    const values = defined.map((s) => s.v as number)
    // Withdrawable capacity is the one metric whose zero is the story: a dry
    // hour is the line touching the floor, and a floating axis would draw a
    // $10 trough at the same height as a $10M one. Every other metric keeps
    // the floating axis (see the notes above).
    const min = metric === 'liquidityUsd' ? Math.min(0, ...values) : Math.min(...values)
    const max = Math.max(...values)
    // A perfectly flat series would divide by zero; give it a band so the line
    // renders through the middle instead of vanishing.
    const span = max - min || Math.abs(max) || 1
    const t0 = series[0].t
    const t1 = series[series.length - 1].t
    const tSpan = t1 - t0
    // Timestamps out of order or all-identical (a single snapshot repeated)
    // would collapse the axis — fall back to even spacing rather than NaN.
    const useTime = Number.isFinite(tSpan) && tSpan > 0
    const x = (i: number) =>
      PAD_X +
      (useTime ? (series[i].t - t0) / tSpan : i / Math.max(1, series.length - 1)) * (W - PAD_X * 2)
    const y = (v: number) => H - PAD_Y - ((v - min) / span) * (H - PAD_Y * 2)
    return { min, max, x, y, t0, t1, tSpan: useTime ? tSpan : 0 }
  }, [defined, series, metric])

  /**
   * The line and its fill, one sub-path per unbroken run of points. Built
   * together so a hole in the recording opens both.
   */
  const shape = useMemo(() => {
    if (!geom) return { line: '', area: '' }
    const runs: { x: number; y: number }[][] = []
    let run: { x: number; y: number }[] = []
    series.forEach((s, i) => {
      if (s.v === undefined || !Number.isFinite(s.v)) {
        if (run.length) runs.push(run)
        run = []
        return
      }
      run.push({ x: geom.x(i), y: geom.y(s.v) })
    })
    if (run.length) runs.push(run)

    let line = ''
    let area = ''
    for (const r of runs) {
      // A lone point is not a line; drawing it would imply a segment.
      if (r.length < 2) continue
      const d = r.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
      line += `${d} `
      area += `${d} L${r[r.length - 1].x.toFixed(1)} ${H} L${r[0].x.toFixed(1)} ${H} Z `
    }
    return { line: line.trim(), area: area.trim() }
  }, [series, geom])

  const fmt = (v: number | undefined, compact = false) => {
    if (v === undefined || !Number.isFinite(v)) return EMPTY_VALUE
    if (metric === 'apr') return formatPercent(v)
    if (metric === 'tvlUsd' || metric === 'liquidityUsd') return abbreviateUsd(v)
    return v.toLocaleString(undefined, { maximumFractionDigits: compact ? 4 : 6 })
  }

  const fmtDate = (t: number) => {
    if (!Number.isFinite(t)) return ''
    const d = new Date(t)
    // Below a fortnight the hour is the interesting part of the stamp; above
    // it, the date alone is what a reader is placing the point against.
    return geom && geom.tSpan > 0 && geom.tSpan <= 14 * DAY
      ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' })
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  const hovered = hover != null ? series[hover] : undefined
  const latest = defined[defined.length - 1]
  /** What the headline number reads: the hovered point, else where it ends. */
  const readout = hovered?.v !== undefined ? hovered : latest

  /** Movement across the window shown — first recorded value to last. */
  const delta = useMemo(() => {
    if (defined.length < 2) return null
    const first = defined[0].v as number
    const last = defined[defined.length - 1].v as number
    const diff = last - first
    if (!Number.isFinite(diff)) return null
    const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'
    // APR moves in percentage POINTS. "+12%" on a rate is ambiguous — it reads
    // as a relative change — so rates get pp and everything else gets percent.
    const text =
      metric === 'apr'
        ? `${Math.abs(diff).toFixed(2)} pp`
        : first !== 0
          ? `${Math.abs((diff / first) * 100).toFixed(2)}%`
          : EMPTY_VALUE
    return { dir, text } as const
  }, [defined, metric])

  /** Gridline values, bottom (min) to top (max) of the plotted range. */
  const ticks = useMemo(() => {
    if (!geom) return []
    const n = TICK_COUNT[size]
    return Array.from({ length: n }, (_, i) => geom.min + ((geom.max - geom.min) * i) / (n - 1))
  }, [geom, size])

  /** Nearest sample to the pointer, skipping holes in the recording. */
  const pickIndex = (ratio: number) => {
    if (!geom) return null
    const target = geom.tSpan > 0 ? geom.t0 + ratio * geom.tSpan : null
    let best = -1
    let bestDist = Infinity
    series.forEach((s, i) => {
      if (s.v === undefined || !Number.isFinite(s.v)) return
      const dist =
        target === null
          ? Math.abs(i / Math.max(1, series.length - 1) - ratio)
          : Math.abs(s.t - target)
      if (dist < bestDist) {
        bestDist = dist
        best = i
      }
    })
    return best >= 0 ? best : null
  }

  const pct = (n: number) => `${(n * 100).toFixed(3)}%`

  return (
    <div className="flex flex-col gap-2">
      {/* ── Chrome: what is plotted (left), what it says (right) ───────── */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" className="tabs tabs-boxed tabs-xs">
            {metrics.map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={metric === m}
                className={`tab ${metric === m ? 'tab-active' : ''}`}
                onClick={() => setMetric(m)}
              >
                {METRIC_LABEL[m]}
              </button>
            ))}
          </div>
          {controls}
        </div>

        {/* The reading, not a legend: the hovered value when the pointer is on
            the plot, the latest otherwise, so the number never goes blank. It
            stays mounted through the load so the header does not resize under
            the cursor when the series arrives. */}
        {(geom || isLoading) && (
          <div className="text-right leading-tight">
            <div
              className={`font-semibold tabular-nums ${size === 'lg' ? 'text-lg' : 'text-sm'}`}
              title={hovered ? 'Value at the hovered point' : 'Latest recorded value'}
            >
              {fmt(readout?.v)}
            </div>
            <div className="mt-0.5 flex h-4 items-center justify-end gap-1.5 text-[10px]">
              {hovered?.v !== undefined ? (
                <span className="text-base-content/50 tabular-nums">{fmtDate(hovered.t)}</span>
              ) : (
                delta && (
                  <>
                    <Badge
                      tone={
                        delta.dir === 'up' ? 'success' : delta.dir === 'down' ? 'error' : 'neutral'
                      }
                      title="Change from the first to the last point in the window shown"
                    >
                      {delta.dir === 'up' ? '▲' : delta.dir === 'down' ? '▼' : '±'} {delta.text}
                    </Badge>
                    <span className="text-base-content/40">over window</span>
                  </>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Plot ───────────────────────────────────────────────────────── */}
      {isLoading ? (
        // A skeleton, not a spinner: the block keeps its shape while it fills.
        <>
          <Skeleton className={`${plotH} w-full`} />
          <div className={AXIS_ROW_H} />
        </>
      ) : error ? (
        <>
          <div className={`flex ${plotH} items-center justify-center text-xs text-base-content/50`}>
            History unavailable
          </div>
          <div className={AXIS_ROW_H} />
        </>
      ) : !geom ? (
        <>
          <div
            className={`flex ${plotH} items-center justify-center px-4 text-center text-xs text-base-content/50`}
          >
            {/* Not "no data" — the recorder may simply not have this row yet. */}
            {emptyMessage}
          </div>
          <div className={AXIS_ROW_H} />
        </>
      ) : (
        <>
          <div className="flex">
            <div
              className={`relative ${plotH} min-w-0 flex-1 cursor-crosshair`}
              onPointerLeave={() => setHover(null)}
              onPointerMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                if (!rect.width) return
                const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
                setHover(pickIndex(ratio))
              }}
              role="img"
              aria-label={`${METRIC_LABEL[metric]} history, ${defined.length} points, ${fmt(
                geom.min
              )} to ${fmt(geom.max)}`}
            >
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="absolute inset-0 h-full w-full text-primary"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                  </linearGradient>
                </defs>

                {/* Gridlines sit under the series and carry the scale with the
                    gutter labels — the plot is not zero-based, so an unlabelled
                    baseline would overstate the movement. */}
                <g className="text-base-content/10">
                  {ticks.map((v, i) => (
                    <line
                      key={i}
                      x1={0}
                      x2={W}
                      y1={geom.y(v)}
                      y2={geom.y(v)}
                      stroke="currentColor"
                      strokeWidth={1}
                      strokeDasharray={i === 0 || i === ticks.length - 1 ? undefined : '2 4'}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </g>

                <path d={shape.area} fill={`url(#${gradientId})`} stroke="none" />
                <path
                  d={shape.line}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />

                {hovered?.v !== undefined && (
                  <line
                    x1={geom.x(hover as number)}
                    x2={geom.x(hover as number)}
                    y1={0}
                    y2={H}
                    stroke="currentColor"
                    strokeWidth={1}
                    className="text-base-content/40"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>

              {/* Round things live in HTML: the viewBox is stretched, so an SVG
                  circle would render as an ellipse. */}
              {latest?.v !== undefined && (
                <span
                  className="pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
                  style={{
                    left: pct(geom.x(series.indexOf(latest)) / W),
                    top: pct(geom.y(latest.v) / H),
                  }}
                />
              )}
              {hovered?.v !== undefined && (
                <span
                  className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-base-100 bg-primary"
                  style={{
                    left: pct(geom.x(hover as number) / W),
                    top: pct(geom.y(hovered.v) / H),
                  }}
                />
              )}
            </div>

            {/* Value gutter. Outside the plot rather than floating over it, so
                a label never sits on top of the line it is describing. */}
            <div className={`relative ${GUTTER_W} shrink-0`}>
              {ticks.map((v, i) => (
                <span
                  key={i}
                  className="absolute right-0 -translate-y-1/2 pl-2 text-[10px] tabular-nums text-base-content/50"
                  style={{ top: pct(geom.y(v) / H) }}
                >
                  {fmt(v, true)}
                </span>
              ))}
            </div>
          </div>

          {/* ── Time axis ────────────────────────────────────────────────── */}
          <div className="flex">
            <div
              className={`flex min-w-0 flex-1 items-center justify-between ${AXIS_ROW_H} text-[10px] tabular-nums text-base-content/50`}
            >
              <span>{fmtDate(geom.t0)}</span>
              <span className="text-base-content/40">{defined.length} points</span>
              <span>{fmtDate(geom.t1)}</span>
            </div>
            <div className={`${GUTTER_W} shrink-0`} />
          </div>
        </>
      )}
    </div>
  )
}
