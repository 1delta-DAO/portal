import { useEffect, useMemo, useState, type CSSProperties } from 'react'

type Props = {
  src?: string | null
  alt?: string
  size?: number
  fallbackText?: string
  className?: string
  width?: number
  height?: number
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function fallbackColor(seed: string): { bg: string; fg: string } {
  if (!seed) return { bg: 'hsl(0 0% 30%)', fg: 'hsl(0 0% 80%)' }
  const h = hashString(seed.toLowerCase())
  const hue = h % 360
  const sat = 10 + ((h >>> 8) % 8)
  const lum = 28 + ((h >>> 16) % 8)
  return { bg: `hsl(${hue} ${sat}% ${lum}%)`, fg: 'hsl(0 0% 82%)' }
}

export function Logo({ src, alt = '', size, fallbackText, className = '', width, height }: Props) {
  const [error, setError] = useState(false)

  useEffect(() => {
    setError(false)
  }, [src])

  const dimension =
    size != null
      ? { width: size, height: size }
      : width != null || height != null
        ? { width, height }
        : undefined

  const seed = (fallbackText || alt || '').trim()
  const colors = useMemo(() => fallbackColor(seed), [seed])

  if (!src || error) {
    const initials =
      seed.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '?'
    const fallbackStyle: CSSProperties = {
      ...dimension,
      backgroundColor: colors.bg,
      color: colors.fg,
    }
    return (
      <div
        className={
          'inline-flex items-center justify-center font-semibold leading-none select-none ' +
          className
        }
        style={fallbackStyle}
        aria-label={alt}
        title={alt}
      >
        <span style={{ fontSize: '0.55em', letterSpacing: '0.02em' }}>{initials}</span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setError(true)}
      style={dimension}
      className={className}
    />
  )
}
