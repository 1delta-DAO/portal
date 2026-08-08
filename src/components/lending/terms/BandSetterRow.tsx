import React, { useEffect, useMemo, useState } from 'react'
import { pct } from './format'
import type { LiquidationTerms } from './types'

/**
 * The band-count SETTER — an editable term, inside the term sheet.
 *
 * Sibling of {@link RateSetterRow}, and for the same reason: on LlamaLend the
 * collateral factor is not published by the protocol, it is a CONSEQUENCE of a
 * number the borrower picks. That makes it a term you negotiate rather than one
 * you read, so it is edited where the other terms are read.
 *
 * The trade-off is the whole point and is not guessable: fewer bands means a
 * higher LTV *and* a narrower soft-liquidation range, so the cheapest-looking
 * choice is also the one that converts your collateral soonest. Curve's own UI
 * advertises the N=4 figure (~50x) while defaulting users to N=10 (~33x).
 *
 * Two properties separate it from the rate setter:
 *
 *  - **It is immutable after open.** `_add_collateral_borrow` reuses the
 *    existing tick width, so there is no commit path for an existing loan —
 *    changing it means closing and reopening. The component therefore never
 *    renders an "update" affordance; it disables itself instead.
 *  - **It is an integer.** `MIN_TICKS`/`MAX_TICKS` bound it to 4..50 on both
 *    generations, and a fractional value is not merely out of range, it is
 *    unencodable.
 */

export interface BandSetterState {
  /** Current band count. */
  bands: number
  /** False while the input is outside the protocol's bounds or non-integral. */
  valid: boolean
  /** True once the user has moved it away from the market default. */
  dirty: boolean
}

const PresetButton: React.FC<{ label: string; hint?: string; onClick: () => void }> = ({
  label,
  hint,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    title={hint}
    className="btn btn-ghost btn-xs h-5 min-h-0 px-1.5 font-mono text-[10px]"
  >
    {label}
  </button>
)

export const BandSetterRow: React.FC<{
  liquidation: LiquidationTerms
  /** Controlled value. Defaults to the market's `openParameter.default`. */
  value?: number
  onChange?: (state: BandSetterState) => void
  /**
   * Set when editing an EXISTING position. The control goes read-only, because
   * the band count cannot be changed without closing the loan.
   */
  existingPosition?: boolean
}> = ({ liquidation, value, onChange, existingPosition }) => {
  const op = liquidation.openParameter
  const range = op && 'min' in op.domain ? op.domain : undefined
  const fallback = op?.default

  const [raw, setRaw] = useState<string>(() => String(value ?? fallback ?? ''))

  // Follow a controlled value, but never fight the user mid-typing.
  useEffect(() => {
    if (value != null && Number(raw) !== value) setRaw(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const parsed = Number(raw)
  const state = useMemo<BandSetterState>(() => {
    const finite = raw.trim() !== '' && Number.isFinite(parsed)
    // Integer-only: a fractional band count is unencodable, not just invalid.
    const integral = finite && Number.isInteger(parsed)
    const inRange = integral && (range == null || (parsed >= range.min && parsed <= range.max))
    return {
      bands: integral ? parsed : (fallback ?? 0),
      valid: !!inRange,
      dirty: integral && fallback != null && parsed !== fallback,
    }
  }, [raw, parsed, range, fallback])

  useEffect(() => {
    onChange?.(state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.bands, state.valid, state.dirty])

  // Only render for markets that actually expose the knob, and only for the
  // factor dimension — a rate-dimension parameter belongs to the rate setter.
  if (op?.kind !== 'llamalend-bands' || op.dimension !== 'collateralFactor') return null

  // The sampled curve, when the fetcher managed to compute it. Purely
  // informational: it covers 4 of 47 possible values and is absent on markets
  // with no lend liquidity, so it must never gate the control.
  const curve = liquidation.bandLtv
  const ltvAt = (n: number) => curve?.[String(n)]

  return (
    <div className="space-y-1 rounded-md border border-warning/30 bg-warning/5 px-1.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-base-content/70"
          title="This market has no fixed LTV — it follows from the band count you choose."
        >
          Your band count (N)
        </span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            inputMode="numeric"
            step="1"
            min={range?.min}
            max={range?.max}
            value={raw}
            disabled={existingPosition}
            onChange={(e) => setRaw(e.target.value)}
            aria-label="Your band count"
            aria-invalid={!state.valid}
            className={`input input-xs w-16 text-right font-mono tabular-nums ${
              state.valid ? '' : 'input-error'
            }`}
          />
        </div>
      </div>

      {existingPosition ? (
        <p className="text-[10px] leading-tight text-base-content/50">
          Fixed for the life of this loan — changing it means closing and reopening.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1">
            {/* Presets bracket the trade-off rather than hiding it: the low end
                is the highest LTV AND the narrowest soft-liquidation range. */}
            {range && (
              <PresetButton
                label={`Min ${range.min}`}
                hint={
                  ltvAt(range.min) != null
                    ? `Highest LTV (${pct(ltvAt(range.min)! * 100)}), narrowest soft-liquidation range`
                    : 'Highest LTV, narrowest soft-liquidation range'
                }
                onClick={() => setRaw(String(range.min))}
              />
            )}
            {fallback != null && (
              <PresetButton
                label={`Default ${fallback}`}
                hint={
                  ltvAt(fallback) != null
                    ? `The market's default (${pct(ltvAt(fallback)! * 100)})`
                    : "The market's default"
                }
                onClick={() => setRaw(String(fallback))}
              />
            )}
            {range && (
              <PresetButton
                label={`Max ${range.max}`}
                hint={
                  ltvAt(range.max) != null
                    ? `Lowest LTV (${pct(ltvAt(range.max)! * 100)}), widest soft-liquidation range`
                    : 'Lowest LTV, widest soft-liquidation range'
                }
                onClick={() => setRaw(String(range.max))}
              />
            )}
          </div>
          <p className="text-[10px] leading-tight text-base-content/50">
            Fewer bands raise your borrowing power but convert collateral over a narrower price
            range — and the choice is fixed once the loan is open.
          </p>
          {!state.valid && (
            <p className="text-[10px] leading-tight text-error">
              {range
                ? `Enter a whole number between ${range.min} and ${range.max}.`
                : 'Enter a whole number.'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
