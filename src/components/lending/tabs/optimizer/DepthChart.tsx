import { useMemo, useRef, useState } from 'react'
import { useMarketDepth, type DepthGrid, type DepthGridPoint } from '../../../../hooks/lending/useMarketDepth'
import { formatUsd } from '../../../../utils/format'

interface Props {
  /** Debt market (borrow side) or collateral market (supply side) UID. */
  marketUid?: string
  side?: 'borrow' | 'supply'
  /** Live marker amount in TOKEN units (same units as grid `size`). */
  markerAmount?: number
  symbol?: string
  /** USD price per token, for value labels. */
  price?: number
  /**
   * Click-to-pick: called with the TOKEN-unit size at the clicked x-position.
   * When set, the chart becomes interactive (click anywhere on the curve to
   * choose that amount). Used by the optimizer panel to set the borrow amount.
   */
  onPick?: (size: number) => void
}

const rateOf = (p: DepthGridPoint, side: 'borrow' | 'supply'): number =>
  side === 'supply' ? p.depositAprPct : p.borrowAprPct

const fmtPct = (v: number): string => `${v.toFixed(2)}%`
const fmtTok = (v: number): string =>
  v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toFixed(2)

/** Linear-interpolate the rate at an arbitrary size from the sampled grid. */
function rateAtSize(points: DepthGridPoint[], side: 'borrow' | 'supply', size: number): number | null {
  if (points.length === 0) return null
  if (size <= points[0].size) return rateOf(points[0], side)
  const last = points[points.length - 1]
  if (size >= last.size) return rateOf(last, side)
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (size <= b.size) {
      const t = (size - a.size) / (b.size - a.size || 1)
      return rateOf(a, side) + t * (rateOf(b, side) - rateOf(a, side))
    }
  }
  return rateOf(last, side)
}

// SVG geometry
const W = 320
const H = 116
const PAD_L = 6
const PAD_R = 6
const PAD_T = 10
const PAD_B = 18
const PLOT_W = W - PAD_L - PAD_R
const PLOT_H = H - PAD_T - PAD_B

interface Hover {
  vbX: number // viewBox x of the cursor (clamped to plot)
  size: number
  rate: number
  pxLeft: number // pixel offset within the svg box (for the HTML tooltip)
}

export function DepthChart({
  marketUid,
  side = 'borrow',
  markerAmount = 0,
  symbol,
  price,
  onPick,
}: Props) {
  const { data, isLoading } = useMarketDepth([marketUid], side)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hover, setHover] = useState<Hover | null>(null)

  const grid: DepthGrid | undefined = useMemo(() => {
    const item = data?.find((d) => d.marketUid === marketUid)
    return side === 'supply' ? item?.supply : item?.borrow
  }, [data, marketUid, side])

  const geom = useMemo(() => {
    if (!grid || grid.points.length < 2) return null
    const pts = grid.points
    const maxX = Math.max(...pts.map((p) => p.size)) || 1
    const rates = pts.map((p) => rateOf(p, side))
    let minY = Math.min(...rates)
    let maxY = Math.max(...rates)
    if (maxY - minY < 1e-6) maxY = minY + 1
    const padY = (maxY - minY) * 0.08
    minY = Math.max(0, minY - padY)
    maxY = maxY + padY
    const sx = (v: number) => PAD_L + (v / maxX) * PLOT_W
    const sy = (r: number) => PAD_T + PLOT_H - ((r - minY) / (maxY - minY)) * PLOT_H
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.size).toFixed(1)},${sy(rateOf(p, side)).toFixed(1)}`).join(' ')
    const area = `${line} L${sx(maxX).toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} L${sx(0).toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} Z`
    const curRate = rateOf(pts[0], side)
    const clampMarker = Math.min(Math.max(markerAmount, 0), maxX)
    const markerRate = markerAmount > 0 ? rateAtSize(pts, side, clampMarker) : null
    return { pts, maxX, minY, maxY, sx, sy, line, area, curRate, clampMarker, markerRate }
  }, [grid, side, markerAmount])

  if (!marketUid) return null

  const accent = side === 'supply' ? 'text-success' : 'text-error'
  const label = side === 'supply' ? 'Supply depth' : 'Borrow depth'

  // Map a cursor clientX to a point on the plot (clamped to the plot area).
  // Shared by hover (crosshair/tooltip) and click-to-pick.
  const pointFromClientX = (clientX: number) => {
    const svg = svgRef.current
    if (!svg || !geom) return null
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0) return null
    const rawVbX = ((clientX - rect.left) / rect.width) * W
    const vbX = Math.min(PAD_L + PLOT_W, Math.max(PAD_L, rawVbX))
    const size = ((vbX - PAD_L) / PLOT_W) * geom.maxX
    return { vbX, size, rectWidth: rect.width }
  }

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const p = pointFromClientX(e.clientX)
    if (!p || !geom) return
    const rate = rateAtSize(geom.pts, side, p.size)
    if (rate == null) return
    setHover({ vbX: p.vbX, size: p.size, rate, pxLeft: (p.vbX / W) * p.rectWidth })
  }

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onPick) return
    const p = pointFromClientX(e.clientX)
    if (p) onPick(p.size)
  }

  return (
    <div className="rounded-lg border border-base-300 bg-base-200/40 px-2.5 py-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-base-content/50 mb-1">
        <span>
          {label}
          {symbol ? ` · ${symbol}` : ''}
        </span>
        {geom && (
          <span className="normal-case tracking-normal font-mono text-base-content/70">
            {fmtPct(geom.curRate)}
            {geom.markerRate != null && (
              <>
                {' '}
                <span className="text-base-content/40">→</span>{' '}
                <span className={accent}>{fmtPct(geom.markerRate)}</span>
              </>
            )}
          </span>
        )}
      </div>

      {isLoading && !geom ? (
        <div className="h-[80px] flex items-center justify-center text-[11px] text-base-content/40">
          <span className="loading loading-spinner loading-xs mr-1.5" /> loading depth…
        </div>
      ) : !geom ? (
        <div className="h-[80px] flex items-center justify-center text-[11px] text-base-content/40">
          no rate curve for this market
        </div>
      ) : (
        <>
          <div className="relative">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-auto block cursor-crosshair"
              role={onPick ? 'button' : 'img'}
              aria-label={onPick ? `${label} curve — click to set amount` : `${label} curve`}
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
              onClick={onClick}
            >
              {/* baseline gridline (min rate) */}
              <line
                x1={PAD_L}
                y1={PAD_T + PLOT_H}
                x2={W - PAD_R}
                y2={PAD_T + PLOT_H}
                className="text-base-content/15"
                stroke="currentColor"
                strokeWidth={1}
              />
              {/* area + line */}
              <path d={geom.area} className={accent} fill="currentColor" fillOpacity={0.12} stroke="none" />
              <path d={geom.line} className={accent} fill="none" stroke="currentColor" strokeWidth={1.8} />
              {/* "you are here" at size 0 */}
              <circle cx={geom.sx(0)} cy={geom.sy(geom.curRate)} r={3} className="text-base-content/70" fill="currentColor" />
              {/* live marker at the entered amount */}
              {geom.markerRate != null && (
                <g>
                  <line
                    x1={geom.sx(geom.clampMarker)}
                    y1={PAD_T}
                    x2={geom.sx(geom.clampMarker)}
                    y2={PAD_T + PLOT_H}
                    className={accent}
                    stroke="currentColor"
                    strokeWidth={1.2}
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={geom.sx(geom.clampMarker)}
                    cy={geom.sy(geom.markerRate)}
                    r={3.2}
                    className={accent}
                    fill="currentColor"
                  />
                </g>
              )}
              {/* hover crosshair */}
              {hover && (
                <g className="text-base-content/60">
                  <line
                    x1={hover.vbX}
                    y1={PAD_T}
                    x2={hover.vbX}
                    y2={PAD_T + PLOT_H}
                    stroke="currentColor"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                  />
                  <circle cx={hover.vbX} cy={geom.sy(hover.rate)} r={3} className={accent} fill="currentColor" />
                </g>
              )}
            </svg>

            {/* hover tooltip */}
            {hover && (
              <div
                className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-base-300 bg-base-100 px-2 py-1 text-[10px] font-mono shadow-lg"
                style={{ left: `${hover.pxLeft}px` }}
              >
                <span className={accent}>{fmtPct(hover.rate)}</span>
                <span className="text-base-content/40"> @ </span>
                <span className="text-base-content/80">
                  {fmtTok(hover.size)}
                  {symbol ? ` ${symbol}` : ''}
                </span>
                {price ? <span className="text-base-content/40"> (${formatUsd(hover.size * price)})</span> : null}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-[9px] font-mono text-base-content/40 -mt-1">
            <span>0</span>
            <span>
              {fmtTok(geom.maxX)}
              {price ? ` ($${formatUsd(geom.maxX * price)})` : ''} avail.
            </span>
          </div>
        </>
      )}
    </div>
  )
}
