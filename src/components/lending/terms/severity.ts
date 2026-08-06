import type { AnyTermSheet, TermSide, TermTag } from './types'
import { sideInfo } from './types'

/**
 * Severity — PURE, derived only from structured term-sheet fields.
 *
 * Deliberately no hand-maintained list of "scary markets": a newly integrated
 * lender is classified correctly the moment the API sets the right fields.
 *
 * - `critical` — you can lose MORE than the amount at stake, or lose it
 *   without doing anything wrong. **This is the only tier that gates a
 *   signature.**
 * - `warn` — it costs money, or blocks you.
 * - `info` — everything else.
 *
 * Disclosure fatigue is the failure mode. If this fires on a plain Aave USDC
 * deposit it is broken: users learn to click through, and the gate then makes
 * things worse than having no gate at all.
 */
export type Severity = 'critical' | 'warn' | 'info'

export interface TermFinding {
  severity: Severity
  /** Stable slug — the join key for tests and for the acknowledgement memory. */
  id: string
  message: string
}

const ORDER: Record<Severity, number> = { critical: 0, warn: 1, info: 2 }

/**
 * Tags that always mean `critical`. Kept as a tag set rather than a field walk
 * so the digest form (which carries tags but not the full blocks) ranks
 * identically to the full sheet — the two must never disagree.
 */
const CRITICAL_TAGS = new Set<TermTag>([
  'full-collateral-seizure',
  'time-liquidation',
  'redeemable',
  'physical-delivery',
  'first-loss',
  'undercollateralized',
  'eoa-controlled',
])

const WARN_TAGS = new Set<TermTag>([
  'exit-cooldown',
  'exit-queued',
  'exit-market-sale',
  'exit-may-be-impossible',
  'socialized-loss',
  'nav-attested',
  'no-timelock',
  'oracle-flagged',
  'cap-full',
  'permissioned',
  'prepaid-interest',
  'early-exit-penalty',
])

export function severityOfTag(tag: TermTag): Severity {
  if (CRITICAL_TAGS.has(tag)) return 'critical'
  if (WARN_TAGS.has(tag)) return 'warn'
  return 'info'
}

/**
 * Fallback message per tag, used when the sheet carries no `implications[]`.
 *
 * The API only inlines its (better) prose on `?terms=full`; list endpoints
 * default to `digest`, which carries tags but no prose. Without this table a
 * digest would produce ZERO findings — and since the disclosure gate keys on
 * critical findings, the gate would silently disappear on exactly the markets
 * that need it. Tags are present in both shapes, so they are the safe base.
 */
const TAG_MESSAGE: Partial<Record<string, string>> = {
  'full-collateral-seizure':
    'On default a liquidator takes your ENTIRE collateral, not just the amount owed.',
  'time-liquidation':
    'This loan can be liquidated for being LATE, regardless of how over-collateralised it is.',
  redeemable: 'Your collateral can be redeemed at par while the position is perfectly healthy.',
  'physical-delivery': 'You can be settled in collateral rather than the asset you lent.',
  'first-loss': 'This is a junior/first-loss position — it absorbs losses before other depositors.',
  undercollateralized:
    'Borrowers here are not fully collateralised on-chain; repayment depends on off-chain credit.',
  'eoa-controlled': 'A single private key can change this market’s parameters with no delay.',
  'exit-may-be-impossible':
    'Exiting early needs a buyer on the order book, and there may be none at any price.',
  'exit-cooldown': 'Withdrawals require a waiting period.',
  'exit-queued': 'Withdrawals are queued rather than instant.',
  'exit-market-sale': 'Exiting early means selling at the prevailing market price.',
  'socialized-loss': 'Bad debt is socialised across all lenders in this market.',
  'nav-attested':
    'The share price is published by an operator; there is no on-chain solvency invariant.',
  'no-timelock': 'Parameters can be changed with no notice period.',
  'oracle-flagged': 'This market’s price oracle is flagged as risky.',
  'cap-full': 'The cap is full — new positions cannot be opened right now.',
  permissioned: 'This market is not permissionless.',
  'prepaid-interest':
    'Interest is prepaid in a separate token; running out triggers a punitive forced top-up.',
  'early-exit-penalty': 'Repaying before maturity costs a penalty.',
}

/** Tags for a side, most severe first — what `TermsChips` renders. */
export function rankedTags(sheet: AnyTermSheet, side: TermSide): TermTag[] {
  const tags = sideInfo(sheet, side)?.tags ?? []
  return [...tags].sort((a, b) => ORDER[severityOfTag(a)] - ORDER[severityOfTag(b)])
}

/**
 * Findings for a side, most severe first.
 *
 * The API already ranks `info.implications[]` with the same model server-side,
 * so this maps them back to a severity rather than re-deriving the prose —
 * one source of wording, one source of ranking. The tag set decides severity
 * because it is present in BOTH the digest and the full sheet.
 */
export function findings(sheet: AnyTermSheet, side: TermSide): TermFinding[] {
  const info = sideInfo(sheet, side)
  if (!info) return []

  const tags = rankedTags(sheet, side)
  const criticalCount = tags.filter((t) => severityOfTag(t) === 'critical').length

  // Prefer the API's own prose when the full sheet carried it — it is richer
  // and market-specific (real grace windows, real penalty rates). It is
  // already ordered most-severe-first, so the first `criticalCount` entries
  // line up with the critical tags.
  const implications = info.implications ?? []
  if (implications.length > 0) {
    return implications.map((message, i) => ({
      severity: i < criticalCount ? ('critical' as const) : ('warn' as const),
      id: `${side}-${i}`,
      message,
    }))
  }

  // Digest (or any sheet without prose): derive from tags so the severity —
  // and therefore the disclosure gate — behaves identically on both shapes.
  return tags
    .filter((t) => severityOfTag(t) !== 'info')
    .map((tag) => ({
      severity: severityOfTag(tag),
      id: `${side}-${String(tag)}`,
      message: TAG_MESSAGE[String(tag)] ?? tagFallbackMessage(tag),
    }))
}

/** Last resort for a tag this build has never seen — never an empty string. */
function tagFallbackMessage(tag: TermTag): string {
  return `This market is flagged: ${String(tag).replace(/-/g, ' ')}.`
}

/** Does this side carry anything that should gate a signature? */
export function hasCritical(sheet: AnyTermSheet | undefined, side: TermSide): boolean {
  if (!sheet) return false
  return rankedTags(sheet, side).some((t) => severityOfTag(t) === 'critical')
}

/** The `critical` findings only — what the disclosure gate shows. */
export function criticalFindings(sheet: AnyTermSheet | undefined, side: TermSide): TermFinding[] {
  if (!sheet) return []
  return findings(sheet, side).filter((f) => f.severity === 'critical')
}

/** DaisyUI text colour for a severity — one mapping, used everywhere. */
export function severityTextClass(s: Severity): string {
  switch (s) {
    case 'critical':
      return 'text-error'
    case 'warn':
      return 'text-warning'
    default:
      return 'text-base-content/60'
  }
}

/** DaisyUI badge classes for a severity. */
export function severityBadgeClass(s: Severity): string {
  switch (s) {
    case 'critical':
      return 'border-error/40 bg-error/10 text-error'
    case 'warn':
      return 'border-warning/40 bg-warning/10 text-warning'
    default:
      return 'border-base-300 bg-base-200/60 text-base-content/70'
  }
}
