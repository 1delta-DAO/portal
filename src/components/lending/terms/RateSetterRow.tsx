import React, { useEffect, useMemo, useState } from 'react'
import { pct } from './format'
import type { RateTerms } from './types'
import type { UserSetRateBook } from '../../../hooks/lending/useRateQueue'

/**
 * The rate SETTER — an editable term, inside the term sheet.
 *
 * On the Liquity family the interest rate is not published by the protocol,
 * it is *chosen by the borrower*. That makes it a term you negotiate rather
 * than a number you read, so it is edited where the other terms are read
 * rather than tucked into a separate form.
 *
 * The choice has a consequence most users will not guess: the rate decides
 * your position in the redemption queue, so the cheapest rate is also the
 * first to be redeemed. The component says so rather than presenting a bare
 * slider.
 */

export interface RateSetterState {
  /** Current value in PERCENT. */
  aprPercent: number
  /** False while the input is outside the protocol's bounds. */
  valid: boolean
  /** True once the user has moved it away from the default. */
  dirty: boolean
}

export const RateSetterRow: React.FC<{
  rate: RateTerms
  /** Controlled value in PERCENT. Defaults to `rate.userSet.default`. */
  value?: number
  onChange?: (state: RateSetterState) => void
  /** Rendered when an existing position's rate can be committed. */
  onCommit?: (aprPercent: number) => void
  committing?: boolean
  commitLabel?: string
  /** The live queue at the ticket's size. Its picks replace the sheet's. */
  queue?: UserSetRateBook
}> = ({ rate, value, onChange, onCommit, committing, commitLabel = 'Update rate', queue }) => {
  const us = rate.userSet
  const fallback = us?.default ?? rate.apr
  const [raw, setRaw] = useState<string>(() => String(value ?? fallback ?? ''))

  // Follow a controlled value, but never fight the user mid-typing.
  useEffect(() => {
    if (value != null && Number(raw) !== value) setRaw(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const picks = queue?.picks ?? us?.picks ?? []
  const parsed = Number(raw)
  const min = us?.min
  const max = us?.max
  const state = useMemo<RateSetterState>(() => {
    const finite = raw.trim() !== '' && Number.isFinite(parsed)
    const inRange =
      finite && (min == null || parsed >= min - 1e-9) && (max == null || parsed <= max + 1e-9)
    return {
      aprPercent: finite ? parsed : (fallback ?? 0),
      valid: inRange,
      dirty: finite && fallback != null && Math.abs(parsed - fallback) > 1e-9,
    }
  }, [raw, parsed, min, max, fallback])

  useEffect(() => {
    onChange?.(state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.aprPercent, state.valid, state.dirty])

  if (!us?.required) return null

  const boundsLabel =
    min != null && max != null ? `${pct(min)} – ${pct(max)}` : 'no published bounds'

  return (
    <div className="space-y-1 rounded-md border border-warning/30 bg-warning/5 px-1.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-base-content/70"
          title="This market has no algorithmic rate — the borrower sets it."
        >
          Your interest rate
        </span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min={min}
            max={max}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            aria-label="Your interest rate, in percent"
            aria-invalid={!state.valid}
            className={`input input-xs w-20 text-right font-mono tabular-nums ${
              state.valid ? '' : 'input-error'
            }`}
          />
          <span className="text-base-content/50">%</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {/* Presets bracket the trade-off rather than hiding it: the cheapest
            pick is also the first redeemed. */}
        {picks.length ? (
          picks.map((p) => (
            <PresetButton
              key={p.id}
              label={`${PICK_WORD[p.id] ?? p.id} ${pct(p.apr)}`}
              hint={[
                p.capacity != null ? `fills up to ${formatAmount(p.capacity)}` : null,
                `${formatAmount(p.debtAhead)} ahead (${Math.round(p.share * 100)} %)`,
              ]
                .filter(Boolean)
                .join(' · ')}
              onClick={() => setRaw(String(p.apr))}
            />
          ))
        ) : (
          <>
            {min != null && (
              <PresetButton label={`Min ${pct(min)}`} onClick={() => setRaw(String(min))} />
            )}
            {fallback != null && (
              <PresetButton
                label={`Default ${pct(fallback)}`}
                onClick={() => setRaw(String(fallback))}
              />
            )}
          </>
        )}
      </div>

      {queue?.levels.length ? (
        <details className="text-base-content/60">
          <summary className="cursor-pointer">See the queue</summary>
          <table className="mt-1 w-full tabular-nums">
            <thead>
              <tr className="text-base-content/40">
                <th className="text-left font-normal">Rate</th>
                <th className="text-right font-normal">Debt</th>
                <th className="text-right font-normal">Redeemed before a rate above it</th>
              </tr>
            </thead>
            <tbody>
              {queue.levels.map((l) => (
                <tr key={l.aprPct}>
                  <td>{pct(l.aprPct)}</td>
                  <td className="text-right">{formatAmount(l.assets)}</td>
                  <td className="text-right">{formatAmount(l.cumulativeAssets)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}

      {!state.valid ? (
        <div className="text-error">
          Must be within {boundsLabel} — outside this the transaction reverts.
        </div>
      ) : (
        <div className="text-base-content/50">
          Allowed {boundsLabel}. A lower rate is cheaper but puts you first in the redemption queue.
        </div>
      )}

      {us.adjustmentCostNote ? (
        <div className="text-base-content/50">{us.adjustmentCostNote}</div>
      ) : null}

      {onCommit ? (
        <button
          type="button"
          disabled={!state.valid || !state.dirty || committing}
          onClick={() => onCommit(state.aprPercent)}
          className="btn btn-xs btn-outline btn-warning w-full"
        >
          {committing ? 'Submitting…' : commitLabel}
        </button>
      ) : null}
    </div>
  )
}

const PICK_WORD: Record<string, string> = {
  cheapest: 'Cheapest',
  balanced: 'Balanced',
  protected: 'Protected',
}

const formatAmount = (x: number) =>
  x.toLocaleString('en-US', { maximumFractionDigits: x < 10 ? 2 : 0 })

const PresetButton: React.FC<{ label: string; hint?: string; onClick: () => void }> = ({
  label,
  hint,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    title={hint}
    className="rounded border border-base-300 px-1 py-px text-[9px] leading-none text-base-content/60 hover:bg-base-200"
  >
    {label}
  </button>
)
