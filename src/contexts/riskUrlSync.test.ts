import { describe, expect, it } from 'vitest'
import { riskSyncStep, type RiskSyncMemory } from './riskUrlSync'

/**
 * These cases are the bug reports, in order.
 *
 *  - "the dropdown snaps back to whatever `?riskTolerance=` says" — a stale
 *    param replayed over a fresh selection.
 *  - "it still resets on the Lending and Looping tabs" — those two strip their
 *    optimizer hand-off params, and a strip built from a snapshot older than
 *    the risk write puts the PREVIOUS value back in the URL.
 *
 * Both are decided here, so neither needs a browser to pin down.
 */

const DEFAULT = 4

/** Numeric-only parser — the real one also takes low/medium/high. */
const parse = (raw: string | null | undefined) => {
  if (raw == null || raw.trim() === '') return null
  const n = parseInt(raw, 10)
  return Number.isNaN(n) ? null : Math.min(Math.max(n, 1), 5)
}

const step = (current: string | null, maxRiskScore: number, memory: RiskSyncMemory) =>
  riskSyncStep({ current, maxRiskScore, defaultMaxRisk: DEFAULT, memory, parse })

const FRESH: RiskSyncMemory = { seen: undefined, pending: undefined }

describe('riskSyncStep', () => {
  it('mirrors a non-default score into the URL', () => {
    const { effect, memory } = step(null, 2, FRESH)
    expect(effect).toEqual({ kind: 'write', value: '2' })
    expect(memory).toEqual({ seen: '2', pending: '2' })
  })

  it('keeps the default value out of the URL', () => {
    expect(step(null, DEFAULT, FRESH).effect).toEqual({ kind: 'idle' })
  })

  it('goes idle once our own write lands', () => {
    const written = step(null, 2, FRESH).memory
    const { effect, memory } = step('2', 2, written)
    expect(effect).toEqual({ kind: 'idle' })
    expect(memory.pending).toBeUndefined()
  })

  it('adopts an externally supplied value (shared link, back/forward)', () => {
    const settled: RiskSyncMemory = { seen: '2', pending: undefined }
    expect(step('5', 2, settled).effect).toEqual({ kind: 'adopt', score: 5 })
  })

  it('does not replay an unchanged param over a fresh selection', () => {
    // The original bug: state moved to 5, the URL still reads 2 because our
    // write has not been issued yet. The stale 2 must not come back.
    const settled: RiskSyncMemory = { seen: '2', pending: undefined }
    expect(step('2', 5, settled).effect).toEqual({ kind: 'write', value: '5' })
  })

  it('re-asserts when another writer clobbers our in-flight write', () => {
    // User picks 5 → we write it. Before it lands, the Lending tab strips its
    // deep-link params from an older snapshot, putting 2 back in the URL.
    const inFlight = step('2', 5, { seen: '2', pending: undefined }).memory
    expect(inFlight.pending).toBe('5')

    const { effect, memory } = step('2', 5, inFlight)
    expect(effect).toEqual({ kind: 'write', value: '5' })
    expect(memory.pending).toBe('5')
  })

  it('re-asserts when another writer drops the param entirely', () => {
    // Path-based navigation (tab / chain / lender switch) drops the whole query.
    const inFlight = step(null, 5, { seen: null, pending: undefined }).memory
    const { effect } = step(null, 5, inFlight)
    expect(effect).toEqual({ kind: 'write', value: '5' })
  })

  it('deletes the param when the score returns to the default', () => {
    const settled: RiskSyncMemory = { seen: '2', pending: undefined }
    const { effect, memory } = step('2', DEFAULT, settled)
    expect(effect).toEqual({ kind: 'write', value: null })
    expect(memory).toEqual({ seen: null, pending: null })
    // …and that deletion counts as landed once the param is gone.
    expect(step(null, DEFAULT, memory).effect).toEqual({ kind: 'idle' })
  })

  it('ignores an unparseable param instead of adopting it', () => {
    const settled: RiskSyncMemory = { seen: '2', pending: undefined }
    expect(step('banana', 2, settled).effect).toEqual({ kind: 'write', value: '2' })
  })

  it('settles rather than looping when the URL already matches state', () => {
    const settled: RiskSyncMemory = { seen: '5', pending: undefined }
    expect(step('5', 5, settled).effect).toEqual({ kind: 'idle' })
  })
})
