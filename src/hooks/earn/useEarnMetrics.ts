import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../sdk/http'

/**
 * `GET /v1/data/earn/metrics?earnUid=` — the per-row withdrawability and
 * realized-rate envelope (the origin's `routes/METRICS.md`).
 *
 * The listing row already carries a 30-day DIGEST (`exit.history`): worst hour,
 * p05, median, dry share, one point per day. This is the deeper question the
 * digest cannot answer — **at MY size, how long would I have been stuck** —
 * plus the two facts a rate column cannot show: what the venue quoted averaged
 * over time, and what a deposit actually earned.
 *
 * Fetched on demand, never with the listing: it is one row's worth of work and
 * the listing is 1,200 rows.
 */

export interface MetricsQuantiles {
  worst: number
  p01: number
  p05: number
  p10: number
  p25: number
  median: number
  p75: number
  max: number
  latest: number
}

export interface MetricsThreshold {
  /** the size asked about, USD */
  x: number
  /** share of observed time with less than `x` withdrawable */
  pInst: number
  /**
   * Per horizon in hours: share of fully-observed start instants from which the
   * market stayed below `x` for the WHOLE horizon — "I wanted out and could not
   * get out within h". **This is the headline**, not `pInst`: a market dry 23 of
   * every 24 hours that clears nightly has `pInst ≈ 0.96` and `pHorizon[24] = 0`,
   * and nobody who waited a day was stuck. `null` = no start instant in the
   * window had a fully observed horizon.
   */
  pHorizon: Record<string, number | null>
  episodes: number
  completeEpisodes: number
  censoredEpisodes: number
  meanHours: number | null
  medianHours: number | null
  /** longest dry run, censored ones included — a lower bound on the worst */
  worstHours: number | null
  pOver24h: number | null
  /** E[remaining wait | dry now], the length-biased residual */
  meanResidualWaitHours: number | null
  currentlyDry: boolean
  currentRunHours: number
}

/** M5 — the protocol's OWN withdrawal limit, where it publishes one. */
export interface MetricsFloor {
  available: boolean
  kind: 'protocol-withdraw-limit' | 'provider-instant-leg' | null
  /** locked share right now, 0..1 */
  latestLockedRatio: number | null
  lockedRatio: MetricsQuantiles | null
  /**
   * `min(idle liquidity, what the floor allows)` — the BINDING capacity. Lead
   * with this where `available` is true: the plain `capacityUsd` sees only idle
   * cash, and on several providers the instant leg's inventory is not even in
   * the balance our liquidity read looks at.
   */
  capacityUsd: MetricsQuantiles | null
  thresholds: MetricsThreshold[]
  note: string | null
}

/** M5 — what LEAVING does to the market: `u' = debt / (deposits − x)`. */
export interface MetricsImpact {
  available: boolean
  currentUtilization: number | null
  currentBorrowAprPct: number | null
  currentDepositAprPct: number | null
  points: Array<{
    x: number
    shareOfDeposits: number | null
    utilization: number | null
    borrowAprPct: number | null
    depositAprPct: number | null
    /** `x` exceeds the idle balance — it cannot complete in one block at all */
    exceedsLiquidity: boolean
  }>
  note: string | null
}

/** M6 — the same question forward, from the state the market is in now. */
export interface MetricsForwardThreshold {
  x: number
  /** π over the dry set: the long-run frequency the window is a draw from */
  pInstStationary: number
  /** from today's state: probability of staying below `x` for the whole horizon */
  pStuck: Record<string, number>
  /**
   * Expected hours until `x` could leave. `null` when the market is not dry now
   * — and `null`, never a large number, when no exit was ever observed: a pin is
   * not a queue.
   */
  expectedWaitHours: number | null
  currentlyDry: boolean
}

export interface MetricsForward {
  available: boolean
  states: number | null
  transitions: number | null
  skippedPairs: number | null
  /** enough transitions per state to be worth reading */
  adequate: boolean
  thresholds: MetricsForwardThreshold[]
  note: string | null
}

/** M6 / L4 — why the liquidity comes back, or does not. */
export interface MetricsDrift {
  available: boolean
  fit: null | {
    n: number
    horizonHours: number
    meanU: number
    intercept: number
    /** negative = mean-reverting */
    uCoef: number
    spreadCoef: number
    r2: number
    halfLifeHours: number | null
    rateResponds: boolean
  }
  /** d(borrowApr)/du at today's utilization — the structural force */
  irmSlopeAtCurrent: number | null
  /** an IRM with no ceiling: a pin here resolves by default, not by repayment */
  unbounded: boolean
  note: string | null
}

export interface MetricsContractual {
  mechanism: string
  withdrawalMode: string | null
  cooldownSeconds: number | null
  instantFeeBps: number | null
  hasInstantLeg: boolean
  hasQueuedLeg: boolean
  termDays: { min: number; max: number } | null
  instantLiquidityRatio: number | null
  note: string | null
}

export interface MetricsAdministrative {
  available: boolean
  transitions: number
  events: Array<{ at: string; changed: Record<string, unknown> }>
  current: Record<string, unknown> | null
  inactiveHours: number | null
}

export interface MetricsRewardStream {
  token: string
  symbol: string | null
  source: string | null
  sourceLabel: string | null
  observedHours: number
  /** USD paid over the window, where the venue valued it at the time */
  valueUsd: number | null
  /** fraction-of-principal integral, where it did not */
  aprIntegral: number | null
  basis: 'usd' | 'quoted-apr'
}

export interface MetricsRate {
  quoted: {
    /** time-weighted mean of the quoted rate, percent APR */
    twaPct: number | null
    meanPct: number | null
    observedHours: number
    samples: number
  }
  realized: null | {
    source: 'share_price' | 'supply_index'
    denomination: 'asset' | 'usd'
    growth: number
    aprPct: number
    apyPct: number | null
    spanDays: number
    t0: string
    t1: string
    samples: number
    /** the accumulator did not move: a rebasing share or a dead series, never
     *  a measured 0 % */
    flat: boolean
  }
  /** realized − quoted, percentage points */
  gapPp: number | null
  /**
   * M7 — the same return in DOLLARS. The only field that can put a 37 % lira row
   * and a 4 % dollar row in one column; identical to `realized` for a dollar row.
   */
  realizedUsd: null | {
    priceGrowth: number
    growth: number
    aprPct: number
    apyPct: number | null
    spanDays: number
    samples: number
  }
  /**
   * M7 — what the average deposited DOLLAR earned. Below the time-weighted figure
   * wherever the money arrived after the good part.
   */
  moneyWeighted: null | {
    growth: number
    aprPct: number
    spanDays: number
    intervals: number
    covered: number
    timeWeightedGrowth: number
  }
  /** M7 — the reward leg, integrated per stream over the hours it was published. */
  rewards: null | {
    aprPct: number | null
    basis: 'usd' | 'quoted-apr' | 'mixed' | null
    streams: MetricsRewardStream[]
    spanDays: number
    note: string
  }
  /** base + rewards: a mixed figure, reported beside its parts */
  totalAprPct: number | null
}

export interface EarnMetrics {
  ok: true
  uid: string
  kind: 'lending' | 'vault'
  provider: string | null
  chainId: string | null
  window: {
    requestedDays: number
    gapCapHours: number
    sampling: 'hourly-point-sample'
    /** every probability in here underestimates — hourly point samples */
    lowerBound: true
    sources: Record<string, number>
    /** when the row was last OBSERVED (not when the response was built) */
    asOf: string | null
    /** age of `asOf`; past the gap cap the row has left the sweep */
    staleHours: number | null
    samples: number
    valued: number
    start: string | null
    end: string | null
    observedHours: number
    /** share of the requested window actually observed — render it next to
     *  ANY number from this endpoint */
    coverage: number
    gaps: number
    longestGapHours: number
  }
  exit: {
    mechanism: string
    contractual: MetricsContractual
    capacityUsd: MetricsQuantiles | null
    capacityRatio: MetricsQuantiles | null
    thresholds: MetricsThreshold[]
    floor: MetricsFloor
    impact: MetricsImpact
    forward: MetricsForward
    drift: MetricsDrift
    administrative: MetricsAdministrative
  }
  rate: MetricsRate
}

export interface UseEarnMetricsResult {
  metrics: EarnMetrics | null
  isLoading: boolean
  error: Error | null
}

/**
 * @param earnUid the row; a lending `marketUid` works too (the server
 *   dispatches on the `vault.` prefix)
 * @param opts.enabled gate the request — the panel that shows this is
 *   collapsible, and a collapsed panel must not fetch
 * @param opts.sizes USD sizes to ask about. Omit to take the server's ladder,
 *   which is trimmed to rungs the market could ever satisfy
 */
export function useEarnMetrics(
  earnUid: string | undefined,
  opts: { enabled?: boolean; days?: number; sizes?: number[]; horizons?: number[] } = {}
): UseEarnMetricsResult {
  const { enabled = true, days = 90, sizes, horizons } = opts
  const x = sizes?.length ? sizes.join(',') : undefined
  const h = horizons?.length ? horizons.join(',') : undefined
  const { data, isLoading, error } = useQuery({
    queryKey: ['earnMetrics', earnUid ?? '', days, x ?? '', h ?? ''],
    enabled: !!earnUid && enabled,
    queryFn: () =>
      apiFetch<EarnMetrics>('/v1/data/earn/metrics', {
        params: { earnUid, days, ...(x ? { x } : {}), ...(h ? { horizons: h } : {}) },
      }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
  return { metrics: data ?? null, isLoading, error: (error as Error) ?? null }
}
