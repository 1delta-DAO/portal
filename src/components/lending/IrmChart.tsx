import React, { useRef, useState, useCallback, useEffect } from 'react'

const PAD = { top: 18, right: 14, bottom: 36, left: 46 }

// Resolved at render time from the active DaisyUI theme so the curves
// re-color on theme switch instead of staying neon green/orange.
const DEPOSIT_COLOR = 'var(--color-success)'
const BORROW_COLOR  = 'var(--color-warning)'

export interface IrmPoint {
  utilization: number
  borrowRate: number
  depositRate: number
}

function scaleX(u: number, w: number) {
  return PAD.left + u * (w - PAD.left - PAD.right)
}

function scaleY(rate: number, maxRate: number, h: number) {
  return PAD.top + (1 - rate / maxRate) * (h - PAD.top - PAD.bottom)
}

function buildPath(points: IrmPoint[], key: 'borrowRate' | 'depositRate', maxRate: number, w: number, h: number) {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${scaleX(p.utilization ?? 0, w).toFixed(1)},${scaleY(p[key] ?? 0, maxRate, h).toFixed(1)}`)
    .join(' ')
}

function nearestPoint(points: IrmPoint[], u: number): IrmPoint {
  let best = points[0]
  let bestDist = Infinity
  for (const p of points) {
    const d = Math.abs(p.utilization - u)
    if (d < bestDist) { bestDist = d; best = p }
  }
  return best
}

interface IrmCurveChartProps {
  points: IrmPoint[]
  currentUtilization?: number
}

export const IrmCurveChart: React.FC<IrmCurveChartProps> = ({ points, currentUtilization }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(340)
  const [hovered, setHovered] = useState<IrmPoint | null>(null)
  const height = Math.round(width * 0.55)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setWidth(Math.floor(w))
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const maxRate = Math.max(1, Math.ceil(Math.max(...points.map((p) => p.borrowRate ?? 0)) * 1.08))
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => maxRate * t)
  const xTicks = [0, 0.25, 0.5, 0.75, 1]

  const resolveU = useCallback((clientX: number): number => {
    const rect = svgRef.current!.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left - PAD.left) / (width - PAD.left - PAD.right)))
  }, [width])

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    setHovered(nearestPoint(points, resolveU(e.clientX)))
  }, [points, resolveU])

  const handleTouchMove = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    e.preventDefault()
    const touch = e.touches[0]
    if (touch) setHovered(nearestPoint(points, resolveU(touch.clientX)))
  }, [points, resolveU])

  return (
    <div ref={containerRef} className="relative w-full select-none touch-none">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHovered(null)}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => setHovered(null)}
        style={{ overflow: 'visible', display: 'block' }}
      >
        {/* Axis border */}
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={height - PAD.bottom}
          stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} />
        <line x1={PAD.left} x2={width - PAD.right} y1={height - PAD.bottom} y2={height - PAD.bottom}
          stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} />

        {/* Grid */}
        {yTicks.map((v) => (
          <line key={v}
            x1={PAD.left} x2={width - PAD.right}
            y1={scaleY(v, maxRate, height)} y2={scaleY(v, maxRate, height)}
            stroke="currentColor" strokeOpacity={0.07} strokeWidth={1}
          />
        ))}

        {/* Current utilization marker */}
        {currentUtilization !== undefined && (
          <line
            x1={scaleX(currentUtilization, width)} x2={scaleX(currentUtilization, width)}
            y1={PAD.top} y2={height - PAD.bottom}
            stroke="currentColor" strokeOpacity={0.35} strokeWidth={1} strokeDasharray="4 3"
          />
        )}

        {/* Deposit curve */}
        <path
          d={buildPath(points, 'depositRate', maxRate, width, height)}
          fill="none" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"
          style={{ stroke: DEPOSIT_COLOR }}
        />

        {/* Borrow curve */}
        <path
          d={buildPath(points, 'borrowRate', maxRate, width, height)}
          fill="none" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"
          style={{ stroke: BORROW_COLOR }}
        />

        {/* Y-axis labels */}
        {yTicks.map((v) => (
          <text key={v}
            x={PAD.left - 6} y={scaleY(v, maxRate, height) + 4}
            textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.45}
          >
            {v.toFixed(0)}%
          </text>
        ))}

        {/* X-axis labels */}
        {xTicks.map((u) => (
          <text key={u}
            x={scaleX(u, width)} y={height - PAD.bottom + 16}
            textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.45}
          >
            {(u * 100).toFixed(0)}%
          </text>
        ))}

        {/* Crosshair + dots */}
        {hovered && (
          <>
            <line
              x1={scaleX(hovered.utilization, width)} x2={scaleX(hovered.utilization, width)}
              y1={PAD.top} y2={height - PAD.bottom}
              stroke="currentColor" strokeOpacity={0.2} strokeWidth={1}
            />
            <circle cx={scaleX(hovered.utilization, width)} cy={scaleY(hovered.depositRate, maxRate, height)}
              r={4} style={{ fill: DEPOSIT_COLOR }} />
            <circle cx={scaleX(hovered.utilization, width)} cy={scaleY(hovered.borrowRate, maxRate, height)}
              r={4} style={{ fill: BORROW_COLOR }} />
          </>
        )}
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div
          className="absolute pointer-events-none z-10 bg-base-200 border border-base-content/15 rounded-lg px-2.5 py-2 text-xs shadow-xl"
          style={{
            top: PAD.top,
            left: hovered.utilization > 0.6
              ? scaleX(hovered.utilization, width) - 8
              : scaleX(hovered.utilization, width) + 10,
            transform: hovered.utilization > 0.6 ? 'translateX(-100%)' : undefined,
          }}
        >
          <p className="text-base-content/50 mb-1.5 tabular-nums text-[10px]">
            Utilization: <span className="text-base-content font-semibold">{(hovered.utilization * 100).toFixed(0)}%</span>
          </p>
          <div className="flex items-center gap-2 tabular-nums">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: DEPOSIT_COLOR }} />
            <span className="text-base-content/60 text-[10px]">Deposit</span>
            <span className="font-semibold ml-auto pl-3 text-[10px]" style={{ color: DEPOSIT_COLOR }}>
              {(hovered.depositRate ?? 0).toFixed(2)}%
            </span>
          </div>
          <div className="flex items-center gap-2 tabular-nums mt-0.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: BORROW_COLOR }} />
            <span className="text-base-content/60 text-[10px]">Borrow</span>
            <span className="font-semibold ml-auto pl-3 text-[10px]" style={{ color: BORROW_COLOR }}>
              {(hovered.borrowRate ?? 0).toFixed(2)}%
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
