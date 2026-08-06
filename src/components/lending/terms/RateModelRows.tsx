import React from 'react'
import { IrmCurveChart } from '../shared/IrmChart'
import { useIrmData } from '../../../hooks/lending/useIrmData'
import { TermRow, TermSection } from './TermRow'
import { pct } from './format'
import type { TermSheet, TermSide } from './types'

/**
 * The rate model, inside the terms card.
 *
 * A rate is a *term*, and the curve is what that term will actually do — it is
 * the difference between "you pay 3.94%" and "you pay 3.94% now, and 20% if
 * utilization moves 6 points". The IRM chart already existed but only in the
 * separate dock, so a user reading the terms never saw it next to the number
 * it explains.
 *
 * Rendered ONLY for utilization-curve markets: a fixed-term, user-set,
 * zero-interest, prepaid or NAV-accrual rate has no curve, and drawing one
 * would imply a mechanism that is not there. That check keys off
 * `rate.kind` — not off the lender.
 */
export const RateModelRows: React.FC<{
  sheet: TermSheet
  side: TermSide
}> = ({ sheet, side }) => {
  const s = sheet[side]
  const kind = s?.rate.kind
  const curveDriven = kind === 'variable-curve'

  // Hook order must be stable, so this runs regardless and is gated below.
  const { data: irm, isLoading } = useIrmData(curveDriven ? sheet.marketUid : undefined)

  if (!s) return null

  if (!curveDriven) {
    // Say WHY there is no curve rather than omitting the section — absence
    // here is a fact about the market, not missing data.
    const why: Record<string, string> = {
      'fixed-term': 'Fixed for the term — no utilization curve.',
      'fixed-open': 'Fixed — no utilization curve.',
      'user-set': 'You choose the rate; there is no curve.',
      'zero-interest': 'No ongoing interest, so no rate curve.',
      prepaid: 'Interest is prepaid in a separate token; there is no curve.',
      'nav-accrual': 'The rate tracks an attested NAV, not utilization.',
      'variable-managed': 'Set by governance, not by a utilization curve.',
      none: 'This position earns no yield.',
    }
    const note = why[String(kind)]
    if (!note) return null
    return (
      <TermSection title="Rate model">
        <TermRow label="How the rate is set" value="No curve" note={note} />
      </TermSection>
    )
  }

  const u = sheet.utilization
  const points = irm?.points ?? []

  return (
    <TermSection title="Rate model">
      <TermRow
        label="How the rate is set"
        value="Utilization curve"
        hint="The rate moves with how much of the pool is borrowed — it is not locked."
      />
      {u ? (
        <TermRow
          label="Utilization now"
          value={pct(u.utilization * 100, 1)}
          tone={u.utilization >= 0.95 ? 'warn' : 'default'}
          note={
            u.basis !== 'market'
              ? `Measured on the ${String(u.basis).replace(/-/g, ' ')}, not this market alone.`
              : undefined
          }
        />
      ) : null}
      {u?.kinkUtilization != null ? (
        <TermRow
          label="Curve steepens at"
          value={pct(u.kinkUtilization * 100, 1)}
          hint="Past this point the rate climbs much faster."
        />
      ) : null}

      {isLoading ? (
        <div className="py-2 text-center text-base-content/40">Loading curve…</div>
      ) : points.length > 0 ? (
        <div className="pt-1">
          <IrmCurveChart
            points={points}
            currentUtilization={irm?.currentUtilization ?? u?.utilization}
          />
        </div>
      ) : (
        // The IRM service does not cover every lender; say so rather than
        // leaving a gap that reads as "flat rate".
        <div className="text-[10px] italic text-base-content/40">
          Rate curve not available for this market.
        </div>
      )}
    </TermSection>
  )
}
