import React, { useEffect, useMemo, useState } from 'react'
import { pct } from './format'
import type { LiquidationTerms } from './types'

/**
 * The band-count SETTER — an editable position parameter.
 *
 * Sibling of {@link RateSetterRow}, and for the same reason: on LlamaLend the
 * collateral factor is not published by the protocol, it is a CONSEQUENCE of a
 * number the borrower picks. That makes it a term you negotiate rather than one
 * you read.
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
 *    changing it means closing and reopening.
 *  - **It is an integer.** `MIN_TICKS`/`MAX_TICKS` bound it to 4..50 on both
 *    generations, and a fractional value is not merely out of range, it is
 *    unencodable.
 *
 * ## Modes
 *
 * `mode` is what the caller knows about the position, NOT a styling choice:
 *
 *  - `edit`   — the loan is being CREATED, so this is a live choice that must
 *               reach the transaction. Only correct where the caller actually
 *               forwards the value (`create_loan` / deposit-and-borrow / loop).
 *  - `locked` — an existing loan. Read-only, because nothing can change it.
 *  - `mirror` — read-only echo of a value being edited elsewhere on the same
 *               screen. Distinct from `locked`: the value is not fixed, this
 *               instance just is not the control. Prevents two live inputs from
 *               fighting when the editable one is hoisted into the form body.
 *
 * ## Variants
 *
 * `row` sits inside the term sheet among the other terms. `field` is a form
 * control for the main body of a create form — used because a parameter that
 * only exists at open is a decision, and burying a decision at the bottom of a
 * collapsible card is how it gets defaulted by accident.
 */

export interface BandSetterState {
  /** Current band count. */
  bands: number
  /** False while the input is outside the protocol's bounds or non-integral. */
  valid: boolean
  /** True once the user has moved it away from the market default. */
  dirty: boolean
}

export type BandSetterMode = 'edit' | 'locked' | 'mirror'

/**
 * Resolve the effective mode, bridging the deprecated `existingPosition` flag.
 *
 * Extracted and exported because this is where the bug lived: the Borrow panel
 * passed `existingPosition: true` unconditionally, so a market with no loan
 * still rendered a locked control. The precedence (`mode` wins) is what lets
 * call sites migrate one at a time without a flag day.
 */
export function resolveBandSetterMode(
  mode?: BandSetterMode,
  existingPosition?: boolean
): BandSetterMode {
  if (mode) return mode
  return existingPosition ? 'locked' : 'edit'
}

/**
 * Validate a raw band-count input against the protocol's domain.
 *
 * Integer-only is a HARD rule, not a nicety: `N` is a tick count, so a
 * fractional value is unencodable rather than merely unusual. `bands` falls
 * back to the market default when the text is not a usable integer, so a
 * half-typed value never propagates as `NaN` or `0` — `0` would read as a
 * legitimate (and catastrophic) choice downstream.
 */
export function validateBandInput(
  raw: string,
  range: { min: number; max: number } | undefined,
  fallback: number | undefined
): BandSetterState {
  const parsed = Number(raw)
  const finite = raw.trim() !== '' && Number.isFinite(parsed)
  const integral = finite && Number.isInteger(parsed)
  const inRange = integral && (range == null || (parsed >= range.min && parsed <= range.max))
  return {
    bands: integral ? parsed : (fallback ?? 0),
    valid: !!inRange,
    dirty: integral && fallback != null && parsed !== fallback,
  }
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
   * What the caller knows about the position. Defaults to `edit`.
   *
   * `existingPosition` is the deprecated spelling of `mode="locked"`; it is
   * still honoured so the older call sites keep working.
   */
  mode?: BandSetterMode
  /** @deprecated Pass `mode="locked"`. */
  existingPosition?: boolean
  variant?: 'row' | 'field'
}> = ({ liquidation, value, onChange, mode, existingPosition, variant = 'row' }) => {
  const op = liquidation.openParameter
  const range = op && 'min' in op.domain ? op.domain : undefined
  const fallback = op?.default

  const effectiveMode = resolveBandSetterMode(mode, existingPosition)
  const readOnly = effectiveMode !== 'edit'

  const [raw, setRaw] = useState<string>(() => String(value ?? fallback ?? ''))

  // Follow a controlled value, but never fight the user mid-typing.
  useEffect(() => {
    if (value != null && Number(raw) !== value) setRaw(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const state = useMemo<BandSetterState>(
    () => validateBandInput(raw, range, fallback),
    [raw, range, fallback]
  )

  useEffect(() => {
    onChange?.(state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.bands, state.valid, state.dirty])

  // Only render for markets that actually expose the knob, and only for the
  // factor dimension — a rate-dimension parameter belongs to the rate setter.
  if (op?.kind !== 'llamalend-bands' || op.dimension !== 'collateralFactor') return null

  // The LTV the chosen N implies. The curve now spans the whole 4..50 domain
  // (it is derived analytically rather than sampled), so this resolves for
  // every value the control offers. It is still absent on markets whose
  // geometry could not be read, hence the null checks — but it must NEVER fall
  // back to the market's headline collateral factor, which is the value at the
  // DEFAULT band count and would misreport any other choice.
  const curve = liquidation.bandLtv
  const ltvAt = (n: number) => curve?.[String(n)]
  const currentLtv = state.valid ? ltvAt(state.bands) : undefined

  const lockNote =
    effectiveMode === 'locked'
      ? 'Fixed for the life of this loan — changing it means closing and reopening.'
      : effectiveMode === 'mirror'
        ? 'Set above, with the rest of the loan.'
        : null

  const input = (
    <input
      type="number"
      inputMode="numeric"
      step="1"
      min={range?.min}
      max={range?.max}
      value={raw}
      disabled={readOnly}
      onChange={(e) => setRaw(e.target.value)}
      aria-label="Your band count"
      aria-invalid={!state.valid}
      className={`input ${
        variant === 'field' ? 'input-sm w-20' : 'input-xs w-16'
      } text-right font-mono tabular-nums ${state.valid ? '' : 'input-error'}`}
    />
  )

  const presets = range && !readOnly && (
    <div className="flex flex-wrap items-center gap-1">
      {/* Presets bracket the trade-off rather than hiding it: the low end
          is the highest LTV AND the narrowest soft-liquidation range. */}
      <PresetButton
        label={`Min ${range.min}`}
        hint={
          ltvAt(range.min) != null
            ? `Highest LTV (${pct(ltvAt(range.min)! * 100)}), narrowest soft-liquidation range`
            : 'Highest LTV, narrowest soft-liquidation range'
        }
        onClick={() => setRaw(String(range.min))}
      />
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
      <PresetButton
        label={`Max ${range.max}`}
        hint={
          ltvAt(range.max) != null
            ? `Lowest LTV (${pct(ltvAt(range.max)! * 100)}), widest soft-liquidation range`
            : 'Lowest LTV, widest soft-liquidation range'
        }
        onClick={() => setRaw(String(range.max))}
      />
    </div>
  )

  const error = !state.valid && !readOnly && (
    <p className="text-[10px] leading-tight text-error">
      {range
        ? `Enter a whole number between ${range.min} and ${range.max}.`
        : 'Enter a whole number.'}
    </p>
  )

  // ---------------------------------------------------------------- field --
  // Prominent form control. Used at loan CREATION, where this is one of the
  // decisions being made rather than a term being reviewed.
  if (variant === 'field') {
    return (
      <div className="space-y-1.5 rounded-lg border border-warning/30 bg-warning/5 px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-xs font-medium">Band count (N)</span>
            <span className="text-[10px] leading-tight text-base-content/50">
              Sets your max LTV · fixed once the loan is open
            </span>
          </div>
          <div className="flex items-center gap-2">
            {currentLtv != null && (
              <span
                className="text-[11px] font-mono tabular-nums text-base-content/70"
                title={`Max LTV at N = ${state.bands}`}
              >
                LTV {pct(currentLtv * 100)}
              </span>
            )}
            {input}
          </div>
        </div>
        {presets}
        {lockNote ? (
          <p className="text-[10px] leading-tight text-base-content/50">{lockNote}</p>
        ) : (
          <p className="text-[10px] leading-tight text-base-content/50">
            Fewer bands raise your borrowing power but convert collateral over a narrower price
            range.
          </p>
        )}
        {error}
      </div>
    )
  }

  // ------------------------------------------------------------------ row --
  // Inside the term sheet, among the other terms.
  return (
    <div className="space-y-1 rounded-md border border-warning/30 bg-warning/5 px-1.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-base-content/70"
          title="This market has no fixed LTV — it follows from the band count you choose."
        >
          Your band count (N)
        </span>
        <div className="flex items-center gap-2">
          {currentLtv != null && (
            <span className="text-[10px] font-mono tabular-nums text-base-content/50">
              LTV {pct(currentLtv * 100)}
            </span>
          )}
          {input}
        </div>
      </div>

      {lockNote ? (
        <p className="text-[10px] leading-tight text-base-content/50">{lockNote}</p>
      ) : (
        <>
          {presets}
          <p className="text-[10px] leading-tight text-base-content/50">
            Fewer bands raise your borrowing power but convert collateral over a narrower price
            range — and the choice is fixed once the loan is open.
          </p>
          {error}
        </>
      )}
    </div>
  )
}
