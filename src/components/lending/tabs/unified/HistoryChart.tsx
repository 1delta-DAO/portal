import React, { useMemo, useState } from 'react'
import type { EarnHistoryPoint } from '../../../../hooks/earn/useEarnHistory'

type Metric = 'apr' | 'tvlUsd' | 'sharePrice'

interface Props {
  points: EarnHistoryPoint[]
  hasSharePrice: boolean
  isLoading?: boolean
  error?: Error | null
}

const METRIC_LABEL: Record<Metric, string> = {
  apr: 'APR',
  tvlUsd: 'TVL',
  sharePrice: 'Share price',
}

/**
 * Inline SVG line chart for one earn row's history.
 *
 * Hand-rolled rather than pulling in a charting library: this app ships no
 * chart dependency today, and a single-series line with a hover readout is a
 * ~60-line problem. A library here would cost more bundle than the whole tab.
 *
 * Deliberate choices about honesty:
 *  - **The Y axis is not forced to zero.** An APR series that moves between
 *    3.1 % and 3.4 % would look like a flat line against a 0 baseline, hiding
 *    exactly the variation the chart exists to show. The visible range is
 *    labelled at both ends so the scale is never implied.
 *  - **Gaps are gaps.** Points with no value for the selected metric break the
 *    line instead of being interpolated across — a recorder outage should read
 *    as missing data, not as a smooth trend through it.
 *  - **Fewer than two points renders no line**, with a message, rather than a
 *    dot that suggests a series exists.
 */
export const HistoryChart: React.FC<Props> = ({ points, hasSharePrice, isLoading, error }) => {
  const [metric, setMetric] = useState<Metric>('apr')
  const [hover, setHover] = useState<number | null>(null)

  const metrics: Metric[] = hasSharePrice ? ['apr', 'tvlUsd', 'sharePrice'] : ['apr', 'tvlUsd']

  const series = useMemo(() => points.map((p) => ({ t: p.t, v: p[metric] })), [points, metric])

  const values = series
    .map((s) => s.v)
    .filter((v): v is number => v !== undefined && Number.isFinite(v))

  const W = 640
  const H = 160
  const PAD = 8

  const geom = useMemo(() => {
    if (values.length < 2) return null
    const min = Math.min(...values)
    const max = Math.max(...values)
    // A perfectly flat series would divide by zero; give it a band so the line
    // renders through the middle instead of vanishing.
    const span = max - min || Math.abs(max) || 1
    const x = (i: number) => PAD + (i / Math.max(1, series.length - 1)) * (W - PAD * 2)
    const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2)
    return { min, max, x, y }
  }, [values, series.length])

  const path = useMemo(() => {
    if (!geom) return ''
    let d = ''
    let penDown = false
    series.forEach((s, i) => {
      if (s.v === undefined || !Number.isFinite(s.v)) {
        // Break the line — do not bridge a hole in the recording.
        penDown = false
        return
      }
      d += `${penDown ? 'L' : 'M'}${geom.x(i).toFixed(1)} ${geom.y(s.v).toFixed(1)} `
      penDown = true
    })
    return d.trim()
  }, [series, geom])

  const fmt = (v: number | undefined) => {
    if (v === undefined || !Number.isFinite(v)) return '—'
    if (metric === 'apr') return `${v.toFixed(2)}%`
    if (metric === 'tvlUsd')
      return v >= 1e6
        ? `$${(v / 1e6).toFixed(2)}M`
        : v >= 1e3
          ? `$${(v / 1e3).toFixed(1)}K`
          : `$${v.toFixed(2)}`
    return v.toLocaleString(undefined, { maximumFractionDigits: 6 })
  }

  const hovered = hover != null ? series[hover] : undefined

  return (
    <div className="flex min-h-[13rem] flex-col gap-2">
      <div className="flex items-center justify-between">
        <div role="tablist" className="tabs tabs-boxed tabs-xs">
          {metrics.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              className={`tab ${metric === m ? 'tab-active' : ''}`}
              onClick={() => setMetric(m)}
            >
              {METRIC_LABEL[m]}
            </button>
          ))}
        </div>
        <div className="text-xs tabular-nums">
          {hovered ? (
            <>
              <span className="font-medium">{fmt(hovered.v)}</span>
              <span className="ml-2 opacity-50">{new Date(hovered.t).toLocaleDateString()}</span>
            </>
          ) : (
            <span className="opacity-50">{values.length ? `${values.length} points` : ''}</span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <span className="loading loading-spinner loading-sm" />
        </div>
      ) : error ? (
        <div className="flex h-40 items-center justify-center text-xs opacity-60">
          History unavailable
        </div>
      ) : !geom ? (
        <div className="flex h-40 items-center justify-center text-xs opacity-60">
          {/* Not "no data" — the recorder may simply not have this row yet. */}
          Not enough history recorded for this market yet
        </div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-40 w-full"
            preserveAspectRatio="none"
            onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const ratio = (e.clientX - rect.left) / rect.width
              const i = Math.round(ratio * (series.length - 1))
              setHover(Math.max(0, Math.min(series.length - 1, i)))
            }}
          >
            <path
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="text-primary"
              vectorEffect="non-scaling-stroke"
            />
            {hover != null && series[hover]?.v !== undefined && (
              <line
                x1={geom.x(hover)}
                x2={geom.x(hover)}
                y1={PAD}
                y2={H - PAD}
                stroke="currentColor"
                strokeWidth={1}
                className="text-base-content/30"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          {/* The axis is NOT zero-based, so both ends are labelled — an
              unlabelled non-zero baseline overstates the movement. */}
          <div className="pointer-events-none absolute inset-y-0 right-0 flex flex-col justify-between py-1 text-[10px] opacity-50">
            <span>{fmt(geom.max)}</span>
            <span>{fmt(geom.min)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
