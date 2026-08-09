import { describe, expect, it } from 'vitest'
import { resolveBandSetterMode, validateBandInput } from './BandSetterRow'

/**
 * The two pure pieces of the band-count control.
 *
 * Both encode a bug that shipped. `resolveBandSetterMode` is where the Borrow
 * panel's hardcoded `existingPosition: true` rendered a locked control to users
 * with no loan; `validateBandInput` is the guard that stops a half-typed value
 * reaching `create_loan`, where `N` is immutable once it lands.
 */

const RANGE = { min: 4, max: 50 }
const DEFAULT_BANDS = 10

describe('resolveBandSetterMode', () => {
  it('defaults to edit — a market with no stated position is being opened', () => {
    expect(resolveBandSetterMode()).toBe('edit')
    expect(resolveBandSetterMode(undefined, false)).toBe('edit')
  })

  it('honours the deprecated existingPosition flag', () => {
    expect(resolveBandSetterMode(undefined, true)).toBe('locked')
  })

  it('lets an explicit mode win over the legacy flag', () => {
    // Migration path: a call site can adopt `mode` without every other one
    // changing in the same commit.
    expect(resolveBandSetterMode('edit', true)).toBe('edit')
    expect(resolveBandSetterMode('mirror', true)).toBe('mirror')
    expect(resolveBandSetterMode('locked', false)).toBe('locked')
  })

  it('distinguishes mirror from locked', () => {
    // Both render read-only, but they mean different things: `locked` is "this
    // can never change", `mirror` is "the control is elsewhere on screen".
    // Collapsing them would caption the loop form's term sheet with a claim
    // about immutability that is false while the loan is still being built.
    expect(resolveBandSetterMode('mirror')).not.toBe(resolveBandSetterMode('locked'))
  })
})

describe('validateBandInput', () => {
  it('accepts a whole number inside the protocol domain', () => {
    const s = validateBandInput('15', RANGE, DEFAULT_BANDS)
    expect(s).toEqual({ bands: 15, valid: true, dirty: true })
  })

  it('is not dirty at the market default', () => {
    // `dirty` is what decides whether the request sends `bands` at all — at the
    // default we let the server apply its own rather than pinning ours.
    expect(validateBandInput('10', RANGE, DEFAULT_BANDS).dirty).toBe(false)
  })

  it('rejects a fractional count — a tick count is unencodable as a fraction', () => {
    const s = validateBandInput('10.5', RANGE, DEFAULT_BANDS)
    expect(s.valid).toBe(false)
    // Falls back to the default rather than propagating 10.5 or NaN.
    expect(s.bands).toBe(DEFAULT_BANDS)
  })

  it('rejects values outside MIN_TICKS / MAX_TICKS', () => {
    expect(validateBandInput('3', RANGE, DEFAULT_BANDS).valid).toBe(false)
    expect(validateBandInput('51', RANGE, DEFAULT_BANDS).valid).toBe(false)
    expect(validateBandInput('4', RANGE, DEFAULT_BANDS).valid).toBe(true)
    expect(validateBandInput('50', RANGE, DEFAULT_BANDS).valid).toBe(true)
  })

  it('never reports 0 bands as a usable value', () => {
    // The important one. `0` is not a benign placeholder — downstream it would
    // read as a real choice, and there is no such loan.
    for (const raw of ['', '   ', 'abc', 'NaN', '1e400']) {
      const s = validateBandInput(raw, RANGE, DEFAULT_BANDS)
      expect(s.valid, `"${raw}" must not validate`).toBe(false)
      expect(s.bands).toBe(DEFAULT_BANDS)
    }
  })

  it('falls back to 0 only when the market states no default', () => {
    // Explicitly not "valid" — so a caller gated on `valid` still sends nothing.
    const s = validateBandInput('', RANGE, undefined)
    expect(s.bands).toBe(0)
    expect(s.valid).toBe(false)
  })

  it('treats a missing range as unbounded but still integer-only', () => {
    expect(validateBandInput('999', undefined, DEFAULT_BANDS).valid).toBe(true)
    expect(validateBandInput('9.9', undefined, DEFAULT_BANDS).valid).toBe(false)
  })

  it('tolerates surrounding whitespace the way an input does', () => {
    expect(validateBandInput(' 12 ', RANGE, DEFAULT_BANDS)).toEqual({
      bands: 12,
      valid: true,
      dirty: true,
    })
  })
})
