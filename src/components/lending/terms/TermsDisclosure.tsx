import React, { useCallback, useMemo, useState } from 'react'
import { criticalFindings } from './severity'
import type { AnyTermSheet, TermSide } from './types'

/**
 * The **commit**-depth surface — the step the flow was missing entirely.
 *
 * Before this existed, `ActionExecuteBlock` went straight from the action
 * button to the wallet. A user could borrow on a time-liquidated market and
 * nothing in the flow said that a missed payment past a window as short as
 * five minutes forfeits their ENTIRE collateral — while the health-factor bar
 * on screen stayed green, because that market has no price trigger at all.
 *
 * ## Rules this component follows deliberately
 *
 * 1. **Fires only on `critical`.** Never on `warn`. Disclosure fatigue is the
 *    real failure mode: a gate that fires often becomes a click-through and
 *    trains the reflex it exists to prevent. If it fires on a plain Aave USDC
 *    deposit, it is broken.
 * 2. **One explicit action**, not a checkbox per item, and never a pre-checked
 *    box — that is a dark pattern and it also teaches users to skim.
 * 3. **Acknowledgement is keyed on `profileId`**, so it re-arms when the terms
 *    themselves change rather than staying accepted forever.
 * 4. The proceed button is **not auto-focused**, so a keyboard user cannot
 *    dismiss it by reflex.
 */

const STORAGE_PREFIX = '1delta.terms.ack.'

function ackKey(marketUid: string, side: TermSide, profileId: string): string {
  // profileId in the key is what makes the gate re-arm on a terms change.
  return `${STORAGE_PREFIX}${marketUid}|${side}|${profileId}`
}

function readAck(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    // Private mode / storage disabled: fail toward SHOWING the disclosure.
    return false
  }
}

function writeAck(key: string) {
  try {
    localStorage.setItem(key, '1')
  } catch {
    /* non-fatal — the gate simply shows again next time */
  }
}

export interface TermsAcknowledgement {
  /** Does the flow need to stop and disclose before signing? */
  required: boolean
  /** Has the user already acknowledged these exact terms? */
  acknowledged: boolean
  /** True when the action may proceed to the wallet. */
  cleared: boolean
  acknowledge: () => void
  findings: ReturnType<typeof criticalFindings>
}

/**
 * Gate state for one (market, side). Returns `cleared: true` when there is
 * nothing critical to disclose — which is the overwhelmingly common case, and
 * is exactly why the gate stays credible when it does fire.
 */
export function useTermsAcknowledgement(
  sheet: AnyTermSheet | undefined,
  side: TermSide
): TermsAcknowledgement {
  const items = useMemo(() => criticalFindings(sheet, side), [sheet, side])
  const key =
    sheet?.marketUid && items.length > 0
      ? ackKey(sheet.marketUid, side, sheet.profileId)
      : undefined

  const [acknowledged, setAcknowledged] = useState<boolean>(() => (key ? readAck(key) : false))

  const acknowledge = useCallback(() => {
    if (key) writeAck(key)
    setAcknowledged(true)
  }, [key])

  const required = items.length > 0
  return {
    required,
    acknowledged,
    cleared: !required || acknowledged,
    acknowledge,
    findings: items,
  }
}

export const TermsDisclosure: React.FC<{
  ack: TermsAcknowledgement
  side: TermSide
  /** Verb for the copy — "borrow", "deposit", … */
  actionLabel?: string
}> = ({ ack, side, actionLabel }) => {
  if (!ack.required || ack.acknowledged) return null

  const verb = actionLabel ?? (side === 'borrow' ? 'borrow' : 'deposit')

  return (
    <div
      className="rounded-lg border border-error/40 bg-error/5 px-2.5 py-2 space-y-2 text-[11px]"
      role="region"
      aria-label="Terms that need review before continuing"
    >
      <div className="font-medium text-error flex items-center gap-1.5">
        <span aria-hidden>⚠</span>
        <span>Review before you {verb}</span>
      </div>

      <ul className="space-y-1.5 text-base-content/80">
        {ack.findings.map((f) => (
          <li key={f.id} className="flex gap-1.5">
            <span aria-hidden className="text-error shrink-0">
              •
            </span>
            <span>{f.message}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={ack.acknowledge}
        className="btn btn-sm btn-outline btn-error w-full"
      >
        I understand — continue
      </button>
    </div>
  )
}
