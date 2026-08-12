import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * App-wide risk ceiling. A single `maxRiskScore` (2 = low, 4 = up to medium,
 * 5 = up to high) that gates how much risk any tab is allowed to surface.
 * Lending and Looping follow it directly; Earn may override it *downwards*
 * (never above).
 *
 * The value is shareable via a `?riskTolerance=` URL param and persisted to
 * `localStorage` (globally, not per-chain). Precedence on load: URL > storage
 * > default.
 */
interface RiskModeState {
  maxRiskScore: number
  setMaxRiskScore: (value: number) => void
}

const STORAGE_KEY = 'maxRiskScore'
const URL_PARAM = 'riskTolerance'
const DEFAULT_MAX_RISK = 4

/** Parse a `riskTolerance` value (numeric 1-5, or low/medium/high) → score, or null. */
function parseRiskTolerance(raw: string | null | undefined): number | null {
  if (raw == null) return null
  const trimmed = raw.trim().toLowerCase()
  if (trimmed === '') return null
  if (trimmed === 'low') return 2
  if (trimmed === 'medium' || trimmed === 'med') return 4
  if (trimmed === 'high') return 5
  const n = parseInt(trimmed, 10)
  if (Number.isNaN(n)) return null
  return Math.min(Math.max(n, 1), 5)
}

function readStoredMaxRisk(): number {
  try {
    const parsed = parseInt(localStorage.getItem(STORAGE_KEY) ?? '', 10)
    return Number.isNaN(parsed) ? DEFAULT_MAX_RISK : parsed
  } catch {
    return DEFAULT_MAX_RISK
  }
}

/** Initial value: URL `?riskTolerance=` wins, then localStorage, then default. */
function readInitialMaxRisk(): number {
  try {
    const fromUrl = parseRiskTolerance(
      new URLSearchParams(window.location.search).get(URL_PARAM),
    )
    if (fromUrl != null) return fromUrl
  } catch {
    /* no window (SSR) — fall through */
  }
  return readStoredMaxRisk()
}

const RiskModeContext = createContext<RiskModeState>({
  maxRiskScore: DEFAULT_MAX_RISK,
  setMaxRiskScore: () => {},
})

export function RiskModeProvider({ children }: { children: ReactNode }) {
  const [maxRiskScore, setMaxRiskScoreState] = useState<number>(readInitialMaxRisk)
  const [searchParams, setSearchParams] = useSearchParams()
  // Raw `riskTolerance` string this provider has already reacted to. Anything
  // different is an *external* URL change (shared link, back/forward, manual
  // edit) and may drive state; an unchanged param is stale and must not
  // override a selection the user just made in the UI.
  const seenUrlRef = useRef<string | null | undefined>(undefined)

  const persist = useCallback((value: number) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(value))
    } catch {
      /* ignore persistence failures (private mode, quota) */
    }
  }, [])

  const setMaxRiskScore = useCallback(
    (value: number) => {
      setMaxRiskScoreState(value)
      persist(value)
    },
    [persist],
  )

  // Keep state and the `riskTolerance` URL param in sync, both directions:
  //  - a *newly seen* URL value (shared link, back/forward, manual edit) drives
  //    state;
  //  - state is otherwise mirrored back into the URL so links stay shareable.
  //    Path-based navigation elsewhere drops the query string, so this effect
  //    re-adds it after each navigation. The default value is kept out of the
  //    URL to avoid noise.
  //
  // The URL→state branch only fires when the raw param actually changed. It
  // used to fire on every run, so picking a value in the RiskSelect was undone
  // on the very next render: state moved, the param had not been rewritten
  // yet, and the stale param was replayed back over the fresh selection —
  // making the dropdown appear stuck at whatever `?riskTolerance=` said.
  useEffect(() => {
    const current = searchParams.get(URL_PARAM)
    const urlChanged = current !== seenUrlRef.current
    seenUrlRef.current = current

    if (urlChanged) {
      const fromUrl = parseRiskTolerance(current)
      if (fromUrl != null && fromUrl !== maxRiskScore) {
        setMaxRiskScoreState(fromUrl)
        persist(fromUrl)
        return
      }
    }

    const desired = maxRiskScore === DEFAULT_MAX_RISK ? null : String(maxRiskScore)
    if (current !== desired) {
      const next = new URLSearchParams(searchParams)
      if (desired == null) next.delete(URL_PARAM)
      else next.set(URL_PARAM, desired)
      seenUrlRef.current = desired
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, maxRiskScore, persist, setSearchParams])

  const value = useMemo<RiskModeState>(
    () => ({ maxRiskScore, setMaxRiskScore }),
    [maxRiskScore, setMaxRiskScore],
  )

  return <RiskModeContext.Provider value={value}>{children}</RiskModeContext.Provider>
}

export function useRiskMode() {
  return useContext(RiskModeContext)
}
