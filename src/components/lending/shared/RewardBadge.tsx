import { useState } from 'react'
import { RewardEntry, rewardApr, rewardsForSide, totalRewardApr, hasPointsProgram } from './rewards'

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function daysLeft(endsAt: unknown): number | null {
  const end = num(endsAt)
  if (!end) return null
  const d = (end * 1000 - Date.now()) / 86_400_000
  return d > 0 ? d : 0
}

function tokenLabel(r: RewardEntry): string {
  if (r.kind === 'points') return 'points'
  if (r.symbol) return r.symbol
  const a = r.asset ?? ''
  return /^0x[0-9a-fA-F]{40}$/.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}

/** How the reward is realized, phrased as a user-facing consequence. */
function claimNote(claim?: string | null): string | null {
  switch (claim) {
    case 'merkl':
      return 'Claimed on Merkl (off-chain distribution) — you must claim it.'
    case 'accrual':
      return 'Accrues on-chain and is claimed from the protocol.'
    case 'manual':
      return 'Distributed manually by the protocol.'
    default:
      return null
  }
}

/**
 * A single reward program: APR + token, expanding to the source (with a deep
 * link to the exact program) and the end date.
 *
 * The end date matters as much as the rate — "5.8% until Dec 31" is a different
 * product from a standing 5.8% — so it is shown inline once a program is inside
 * its final month rather than hidden in the detail panel.
 */
function RewardLine({ reward, side }: { reward: RewardEntry; side: 'deposit' | 'borrow' }) {
  const apr = rewardApr(reward, side)
  const days = daysLeft(reward.endsAt)
  const note = claimNote(reward.claim)
  const label = reward.sourceLabel ?? reward.sourceId ?? reward.source ?? null

  return (
    <div className="flex flex-col gap-0.5 py-1">
      <div className="flex items-center gap-1.5">
        {reward.logoURI ? (
          <img
            src={reward.logoURI}
            alt=""
            className="h-3.5 w-3.5 rounded-full"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : null}
        <span className="font-medium">
          {side === 'borrow' ? '−' : '+'}
          {Math.abs(apr).toFixed(2)}%
        </span>
        <span className="opacity-80">{tokenLabel(reward)}</span>
        {reward.kind === 'points' ? (
          <span className="badge badge-xs border-0 bg-base-300/60">not priceable</span>
        ) : null}
      </div>
      {label ? (
        <div className="pl-5 text-[11px] opacity-70">
          via{' '}
          {reward.link ? (
            <a
              href={reward.link}
              target="_blank"
              rel="noopener noreferrer"
              className="link link-hover underline decoration-dotted"
              onClick={(e) => e.stopPropagation()}
            >
              {label} ↗
            </a>
          ) : (
            label
          )}
        </div>
      ) : null}
      {days !== null ? (
        <div className="pl-5 text-[11px] opacity-70">
          {days < 1
            ? 'ends today'
            : `ends in ${Math.round(days)}d (${new Date(
                num(reward.endsAt) * 1000
              ).toLocaleDateString()})`}
        </div>
      ) : null}
      {note ? <div className="pl-5 text-[11px] opacity-50">{note}</div> : null}
    </div>
  )
}

/**
 * Reward pill for a market row. Click to expand the per-program breakdown.
 *
 * Replaces a `title=` tooltip that could only show a summed APR and a list of
 * mechanism tags ('merkle'), which told a user neither which token they were
 * being paid nor which program was paying it.
 */
export function RewardBadge({
  rewards,
  side,
  className = '',
}: {
  rewards: unknown
  side: 'deposit' | 'borrow'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const entries = rewardsForSide(rewards, side)
  if (!entries.length) return null

  const total = totalRewardApr(rewards, side)
  const points = hasPointsProgram(rewards, side)
  // A points-only program has no APR to show, but suppressing the badge would
  // hide the incentive entirely.
  if (Math.abs(total) <= 0.005 && !points) return null

  const tone = side === 'borrow' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
  const sign = side === 'borrow' ? '−' : '+'

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        className={`badge badge-xs cursor-pointer whitespace-nowrap border-0 ${tone}`}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        title={
          side === 'borrow'
            ? 'Borrow reward — lowers your net borrow cost. Click for the program details.'
            : 'Supply reward. Click for the program details.'
        }
      >
        {Math.abs(total) > 0.005 ? `${sign}${Math.abs(total).toFixed(1)}% ` : ''}
        rwd
        {points ? ' +pts' : ''}
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
            }}
          />
          <div
            className="absolute right-0 z-50 mt-1 w-64 rounded-lg border border-base-300 bg-base-100 p-2 text-left text-xs shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 font-semibold opacity-70">
              {side === 'borrow' ? 'Borrow rewards' : 'Supply rewards'}
            </div>
            <div className="divide-y divide-base-300/60">
              {entries.map((r, i) => (
                <RewardLine
                  key={`${r.asset ?? 'x'}-${r.sourceId ?? r.source ?? i}`}
                  reward={r}
                  side={side}
                />
              ))}
            </div>
            {points ? (
              <div className="mt-1 border-t border-base-300/60 pt-1 text-[11px] opacity-60">
                Points programs are excluded from the headline APR — they have no priceable value.
              </div>
            ) : null}
            <div className="mt-1 text-[11px] opacity-50">
              Rewards are transient and are not used in health-factor or liquidation math.
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
