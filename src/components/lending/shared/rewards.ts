/**
 * Reward provenance helpers, shared by the badge and by the pool mappers.
 *
 * Kept separate from `RewardBadge.tsx` so data-layer callers (`usePoolData`,
 * the earn-tab mappers) don't pull a React component into their import graph.
 */

export interface RewardEntry {
  asset?: string
  symbol?: string | null
  decimals?: number | null
  logoURI?: string | null
  depositRate?: number | string | null
  variableBorrowRate?: number | string | null
  stableBorrowRate?: number | string | null
  kind?: string | null
  claim?: string | null
  source?: string | null
  sourceId?: string | null
  sourceLabel?: string | null
  link?: string | null
  endsAt?: number | string | null
  startsAt?: number | string | null
  dailyRewardsUsd?: number | string | null
  refs?: Record<string, unknown> | null
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** APR this entry pays on the given side. */
export function rewardApr(r: RewardEntry, side: 'deposit' | 'borrow'): number {
  return side === 'deposit'
    ? num(r.depositRate)
    : num(r.variableBorrowRate) + num(r.stableBorrowRate)
}

/** Entries paying anything on this side, largest first. */
export function rewardsForSide(rewards: unknown, side: 'deposit' | 'borrow'): RewardEntry[] {
  if (!Array.isArray(rewards)) return []
  return (rewards as RewardEntry[])
    .filter((r) => Math.abs(rewardApr(r, side)) > 0.005)
    .sort((a, b) => rewardApr(b, side) - rewardApr(a, side))
}

/**
 * Total across a side. Points programs are EXCLUDED — they have no priceable
 * value, so folding them into a headline APR overstates the yield.
 */
export function totalRewardApr(rewards: unknown, side: 'deposit' | 'borrow'): number {
  return rewardsForSide(rewards, side)
    .filter((r) => r.kind !== 'points')
    .reduce((s, r) => s + rewardApr(r, side), 0)
}

/** `true` when any entry on this side is an unpriceable points program. */
export function hasPointsProgram(rewards: unknown, side: 'deposit' | 'borrow'): boolean {
  return rewardsForSide(rewards, side).some((r) => r.kind === 'points')
}
