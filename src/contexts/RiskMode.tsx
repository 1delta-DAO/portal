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
import { riskSyncStep } from './riskUrlSync'

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
/**
 * Show everything by default.
 *
 * At 4 the earn listing lost 46 % of chain 1 — `riskScore` is
 * `GREATEST(chain, lender, propagated_token)`, so every isolated market
 * inherits its collateral's score and the whole Morpho Blue / Euler V2 half of
 * the book (including a $2.7B USDC market) sat above the ceiling. The selector
 * still offers "Low only" and "Up to medium" for anyone who wants the guard.
 */
const DEFAULT_MAX_RISK = 5

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
    const fromUrl = parseRiskTolerance(new URLSearchParams(window.location.search).get(URL_PARAM))
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
  // The value of our own most recent write that has NOT yet been observed back
  // in the URL. `undefined` means nothing is outstanding (`null` is a real
  // value — it means "param deleted").
  //
  // While a write is outstanding, ANY other value showing up in the URL came
  // from a different writer, not from the user: some other component replaced
  // the query string from a snapshot taken before our write. Adopting it is how
  // the selector snapped back to its previous value on the tabs that write the
  // URL themselves (Lending and Looping strip their optimizer hand-off params;
  // the Unified tab writes nothing, which is why it looked fixed and they did
  // not). Re-assert instead — a click is newer than any value already in the URL.
  const pendingWriteRef = useRef<string | null | undefined>(undefined)

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
    [persist]
  )

  // Keep state and the `riskTolerance` URL param in sync, both directions:
  //  - a *newly seen* URL value (shared link, back/forward, manual edit) drives
  //    state;
  //  - state is otherwise mirrored back into the URL so links stay shareable.
  //    Path-based navigation elsewhere drops the query string, so this effect
  //    re-adds it after each navigation. The default value is kept out of the
  //    URL to avoid noise.
  //
  // Which reading wins is decided by `riskSyncStep` — a pure step, unit-tested
  // in riskUrlSync.test.ts, because this is the part that keeps regressing. Two
  // rules there, both from bug reports: the URL→state branch fires only when
  // the raw param actually CHANGED (it used to fire on every run, replaying the
  // stale param over a selection the user had just made), and it stands down
  // entirely while a write of ours is still in flight (another writer's replace
  // is the one carrying stale data at that point, not us).
  useEffect(() => {
    const { effect, memory } = riskSyncStep({
      current: searchParams.get(URL_PARAM),
      maxRiskScore,
      defaultMaxRisk: DEFAULT_MAX_RISK,
      memory: { seen: seenUrlRef.current, pending: pendingWriteRef.current },
      parse: parseRiskTolerance,
    })
    seenUrlRef.current = memory.seen
    pendingWriteRef.current = memory.pending

    if (effect.kind === 'adopt') {
      setMaxRiskScoreState(effect.score)
      persist(effect.score)
      return
    }
    if (effect.kind === 'write') {
      const { value } = effect
      // Functional form on purpose: it receives the params as they are AT WRITE
      // TIME. Building from the `searchParams` snapshot this effect closed over
      // would resurrect whatever another writer removed in between — the same
      // stale-snapshot clobber this file defends against from the other side.
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value == null) next.delete(URL_PARAM)
          else next.set(URL_PARAM, value)
          return next
        },
        { replace: true }
      )
    }
  }, [searchParams, maxRiskScore, persist, setSearchParams])

  const value = useMemo<RiskModeState>(
    () => ({ maxRiskScore, setMaxRiskScore }),
    [maxRiskScore, setMaxRiskScore]
  )

  return <RiskModeContext.Provider value={value}>{children}</RiskModeContext.Provider>
}

export function useRiskMode() {
  return useContext(RiskModeContext)
}
