import React from 'react'
import { PopoverShell } from '../../common/PortalPopover'
import { abbreviateUsd } from '../../../utils/format'
import type { EarnRisk } from '../../../sdk/earn-helper/types'

/**
 * Everything wrong with a venue that `risk.score` does NOT say, behind one icon.
 *
 * The score rates a venue's chain, lender and asset in the abstract. These are
 * a different axis: losses that have ALREADY happened, an exit that doesn't
 * work, a rating computed from a stale snapshot. A vault can score 2/low on all
 * three and still have lost every dollar in it — so they render alongside the
 * score, never folded into it.
 *
 * Rendered as a single severity-toned icon rather than a row of worded pills.
 * At four possible findings the pills wrapped the Risk column onto three lines
 * and turned a scan-in-one-glance table into a wall of red text; the details
 * belong in the popover, where there is room to say WHY each one matters.
 *
 * THE DOLLAR RULE: a defaulted market never drops below 100% utilization, so
 * its rate pins at the IRM ceiling (~297,996% APY) and its book inflates
 * exponentially on a debt nobody will repay. When `badDebt.nominal` is set the
 * amount is accrued book value, not capital — one market reports $3.7B against
 * a protocol holding $1.76M on that chain. In that case show the RATIO, which
 * is scale-invariant, and never the dollars.
 */

const fmtPct = (r: number): string => `${(r * 100).toFixed(r < 0.1 ? 1 : 0)}%`

type Severity = 'error' | 'warning'

interface Finding {
  key: string
  severity: Severity
  /** Short headline — what it is. */
  label: string
  /** The figure, where there is one. */
  value?: string
  /** Why it matters, in a sentence. */
  detail: string
}

/** The findings on a row, worst first. Empty when there is nothing to say. */
export function riskFindings(risk?: EarnRisk): Finding[] {
  if (!risk) return []
  const { badDebt, lostAssets, stale, illiquid, vault, governance } = risk
  const out: Finding[] = []

  if (lostAssets != null) {
    const total = lostAssets.pct != null && lostAssets.pct >= 0.999
    out.push({
      key: 'lostAssets',
      severity: 'error',
      label: total ? 'Total loss' : 'Lost assets',
      value: lostAssets.pct != null ? fmtPct(lostAssets.pct) : undefined,
      detail:
        `${lostAssets.pct != null ? fmtPct(lostAssets.pct) : 'Part'} of this vault's reported ` +
        `value is not backed by any position` +
        (lostAssets.usd != null ? ` (${abbreviateUsd(lostAssets.usd)})` : '') +
        '. The share price does NOT fall when this happens, so the quoted TVL and price ' +
        'still look normal.',
    })
  }

  // Dust in a near-empty market is recorded upstream but is not a finding.
  if (badDebt && badDebt.material !== false && (badDebt.ratio ?? 0) > 0) {
    out.push({
      key: 'badDebt',
      severity: 'error',
      label: 'Bad debt',
      value: fmtPct(badDebt.ratio!),
      detail:
        (badDebt.attributed
          ? "This vault's share of bad debt in the markets it supplies: "
          : 'Bad debt in this market: ') +
        fmtPct(badDebt.ratio!) +
        ' of size' +
        // Only quote a figure that means something — see THE DOLLAR RULE.
        (!badDebt.nominal && badDebt.usd ? ` (${abbreviateUsd(badDebt.usd)})` : '') +
        (badDebt.nominal
          ? '. The dollar amount is NOT shown: this market is pinned at full utilization, so ' +
            'its interest compounds at the rate-model ceiling and the book value is accrued ' +
            'interest, not deposits.'
          : '.'),
    })
  }

  if (illiquid) {
    out.push({
      key: 'illiquid',
      severity: 'error',
      label: 'Illiquid',
      detail:
        'Claims a same-block exit but reports zero liquidity — enterable, not exitable. A ' +
        'cooldown vault is illiquid by design and is never flagged here.',
    })
  }

  // The vault's OWN rating (curator, markets, liquidity, integrity). Only worth
  // a line when it disagrees with a clean bill of health, and only when it adds
  // something the loss findings above haven't already said.
  if (vault?.level === 'red' || vault?.level === 'yellow') {
    const explained = vault.integrityFlag && (lostAssets != null || badDebt != null)
    if (!explained) {
      out.push({
        key: 'vault',
        severity: vault.level === 'red' ? 'error' : 'warning',
        label: 'Vault rating',
        value: vault.level,
        detail:
          `The vault's own rating (curator, markets, liquidity, integrity) is ${vault.level}` +
          (vault.score != null ? ` at ${vault.score}` : '') +
          (vault.integrityFlag ? ` — flagged: ${vault.integrityFlag.replace(/[-+]/g, ' ')}` : '') +
          '. This is separate from the venue score next to it.',
      })
    }
  }

  // Governance is a finding only when it is HIGH: every position has governance,
  // so listing the sound ones would bury the rest. One ladder for both grains —
  // a vault's own timelock (or the markets it lends into) and a market's admin
  // are the same question asked twice: who can change this, and how fast.
  if (governance != null && governance.score >= 4) {
    const noTimelock = governance.grain === 'vault' && governance.timelockSecs === 0
    out.push({
      key: 'governance',
      severity: governance.score >= 5 ? 'error' : 'warning',
      label: noTimelock ? 'No timelock' : 'Governance',
      value:
        governance.grain === 'vault' && governance.timelockSecs
          ? `${Math.round(governance.timelockSecs / 3600)}h`
          : (governance.tier ?? undefined),
      detail: noTimelock
        ? 'No notice period: the curator can change this vault — caps, markets, allocator — ' +
          'in a single transaction, with no window to withdraw first.'
        : governance.grain === 'vault'
          ? (governance.timelockSecs != null
              ? `Only ${Math.round(governance.timelockSecs / 3600)}h notice before the curator ` +
                'can change this vault. '
              : 'The markets this vault lends into are weakly governed. ') +
            'Parameters can change under you.'
          : `Weak market governance${
              governance.ownerKind ? ` (${governance.ownerKind.toLowerCase()})` : ''
            }${
              governance.delaySecs
                ? `, ${Math.round(governance.delaySecs / 3600)}h delay`
                : ', no enforced delay'
            }. Parameters can change under you.`,
    })
  }

  if (stale != null) {
    out.push({
      key: 'stale',
      severity: 'warning',
      label: 'Stale rating',
      value: stale.ageDays != null ? `${Math.round(stale.ageDays)}d` : undefined,
      detail: `This rating was computed from a snapshot ${
        stale.ageDays != null ? `${Math.round(stale.ageDays)} days` : 'a long time'
      } old — the rate, TVL and liquidity shown describe the vault as it was, not as it is.`,
    })
  }

  return out
}

const TRIGGER_TONE: Record<Severity, string> = {
  error: 'bg-error/15 text-error',
  warning: 'bg-warning/15 text-warning',
}

const DOT_TONE: Record<Severity, string> = {
  error: 'bg-error',
  warning: 'bg-warning',
}

function WarningIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

/** One-line summary for the hover title, so the popover is never the only way in. */
const summarize = (findings: Finding[]): string =>
  findings.map((f) => (f.value ? `${f.label} ${f.value}` : f.label)).join(' · ')

export const RiskFindings: React.FC<{ risk?: EarnRisk; className?: string }> = ({
  risk,
  className = '',
}) => {
  const findings = riskFindings(risk)
  if (findings.length === 0) return null

  const severity: Severity = findings.some((f) => f.severity === 'error') ? 'error' : 'warning'

  return (
    <PopoverShell
      widthClassName="w-72"
      widthPx={288}
      // Secondary control in a selectable row: opening the details must not
      // also toggle the row's selection out from under the popover.
      stopPropagation
      ariaLabel={`${findings.length} risk finding${findings.length > 1 ? 's' : ''}`}
      triggerTitle={`${summarize(findings)} — click for details`}
      triggerClassName={`inline-flex items-center align-middle ${className}`}
      trigger={
        <span
          className={`badge badge-xs border-0 gap-0.5 px-1 font-medium tabular-nums group-hover:opacity-75 transition-opacity ${TRIGGER_TONE[severity]}`}
        >
          <WarningIcon className="w-3 h-3" />
          {/* The count only earns its space when there is more than one. */}
          {findings.length > 1 && findings.length}
        </span>
      }
      header={
        <>
          <WarningIcon
            className={`w-4 h-4 shrink-0 ${severity === 'error' ? 'text-error' : 'text-warning'}`}
          />
          <span className="font-semibold text-sm truncate">
            {findings.length === 1 ? '1 risk finding' : `${findings.length} risk findings`}
          </span>
        </>
      }
    >
      {findings.map((f) => (
        <div key={f.key} className="flex items-start gap-1.5">
          <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${DOT_TONE[f.severity]}`} />
          <div className="min-w-0">
            <div className="font-medium">
              {f.label}
              {f.value && <span className="ml-1 tabular-nums opacity-70">{f.value}</span>}
            </div>
            <div className="text-base-content/60 leading-snug">{f.detail}</div>
          </div>
        </div>
      ))}
    </PopoverShell>
  )
}
