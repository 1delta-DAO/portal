import { RewardEntry, rewardApr, rewardsForSide, totalRewardApr, hasPointsProgram } from './rewards'
import { PopoverShell } from '../../common/PortalPopover'

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
 *
 * The panel is rendered through {@link PopoverShell} — i.e. a portal — because
 * this badge lives in a table cell, and the market tables carry
 * `[&_td]:overflow-hidden` (fixed layout needs it to keep columns from being
 * blown open by long names) inside an `overflow-x-auto` scroller. An
 * absolutely positioned panel was being clipped by both: on most rows it
 * opened invisibly. The portal also brings the flip-above-when-there-is-no-room
 * and reposition-on-scroll behaviour the hand-rolled panel never had, which is
 * what a badge on the LAST row of a long table needs.
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
  const entries = rewardsForSide(rewards, side)
  if (!entries.length) return null

  const total = totalRewardApr(rewards, side)
  const points = hasPointsProgram(rewards, side)
  // A points-only program has no APR to show, but suppressing the badge would
  // hide the incentive entirely.
  if (Math.abs(total) <= 0.005 && !points) return null

  const tone = side === 'borrow' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
  const sign = side === 'borrow' ? '−' : '+'
  const title =
    side === 'borrow'
      ? 'Borrow reward — lowers your net borrow cost. Click for the program details.'
      : 'Supply reward. Click for the program details.'
  const heading = side === 'borrow' ? 'Borrow rewards' : 'Supply rewards'

  return (
    <PopoverShell
      // A SECONDARY control in a row: opening it must not also toggle the row
      // selection underneath the panel that just opened.
      stopPropagation
      triggerClassName={`inline-flex ${className}`}
      triggerTitle={title}
      ariaLabel={heading}
      widthClassName="w-72"
      widthPx={288}
      header={<span className="truncate text-xs font-semibold">{heading}</span>}
      trigger={
        <span
          className={`badge badge-xs whitespace-nowrap border-0 transition-opacity group-hover:opacity-75 ${tone}`}
        >
          {Math.abs(total) > 0.005 ? `${sign}${Math.abs(total).toFixed(1)}% ` : ''}
          rwd
          {points ? ' +pts' : ''}
        </span>
      }
    >
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
        <div className="border-t border-base-300/60 pt-1.5 text-[10px] text-base-content/50">
          Points programs are excluded from the headline APR — they have no priceable value.
        </div>
      ) : null}
      <div className="text-[10px] text-base-content/40">
        Rewards are transient and are not used in health-factor or liquidation math.
      </div>
    </PopoverShell>
  )
}
