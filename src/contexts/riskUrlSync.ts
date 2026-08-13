/**
 * The URL ⇄ state sync rule behind {@link RiskModeProvider}, as a pure step.
 *
 * It lives outside the component because it is the part that keeps breaking:
 * the risk selector "resetting" has twice been a question of WHICH `?riskTolerance=`
 * reading is authoritative, and that question is decidable from three inputs
 * (what the URL says, what we last saw, what we last wrote) without a router,
 * a DOM, or a render.
 *
 * The rule, in order:
 *
 *  1. The URL now shows the value we wrote → our write landed. Nothing to do.
 *  2. A write of ours is still outstanding and the URL shows something else →
 *     ANOTHER writer replaced the query string, and it did so from a snapshot
 *     older than our write. Its value is stale by construction: the user's
 *     click is newer than anything already in the URL. Re-assert, never adopt.
 *  3. The URL value changed on its own (shared link, back/forward, manual edit)
 *     → adopt it into state.
 *  4. Otherwise mirror state into the URL so links stay shareable, keeping the
 *     default out of the query string to avoid noise.
 *
 * Step 2 is what the Lending and Looping tabs need: both strip their optimizer
 * hand-off params, and a strip built from a stale snapshot puts the PREVIOUS
 * risk value back in the URL, which step 3 would otherwise read as a user
 * action and adopt — snapping the selector back. The Unified tab writes no
 * query params at all, which is the only reason it looked fixed.
 */

/** What the provider must do after one URL/state observation. */
export type RiskSyncEffect =
  /** Nothing to do — URL and state agree. */
  | { kind: 'idle' }
  /** Adopt this score from the URL into state (and storage). */
  | { kind: 'adopt'; score: number }
  /** Write this raw param value; `null` means delete the param. */
  | { kind: 'write'; value: string | null }

/**
 * What the provider remembers between observations.
 *
 * `undefined` is "nothing recorded yet" for both fields; `null` is a real
 * recorded value meaning "the param is absent".
 */
export interface RiskSyncMemory {
  /** Raw param value we have already reacted to. */
  seen: string | null | undefined
  /** Raw param value we wrote that has not shown up in the URL yet. */
  pending: string | null | undefined
}

export interface RiskSyncStep {
  effect: RiskSyncEffect
  memory: RiskSyncMemory
}

export function riskSyncStep(params: {
  /** `riskTolerance` as it reads in the URL right now. */
  current: string | null
  /** The provider's current score. */
  maxRiskScore: number
  /** Score that is kept OUT of the URL. */
  defaultMaxRisk: number
  memory: RiskSyncMemory
  parse: (raw: string | null | undefined) => number | null
}): RiskSyncStep {
  const { current, maxRiskScore, defaultMaxRisk, memory, parse } = params

  // 1. Our own write landed.
  if (memory.pending !== undefined && current === memory.pending) {
    return { effect: { kind: 'idle' }, memory: { seen: current, pending: undefined } }
  }

  const urlChanged = current !== memory.seen
  const ourWriteOutstanding = memory.pending !== undefined

  // 3. An external change drives state — but only when no write of ours is in
  //    flight, because then the value belongs to another writer (step 2).
  if (urlChanged && !ourWriteOutstanding) {
    const fromUrl = parse(current)
    if (fromUrl != null && fromUrl !== maxRiskScore) {
      return {
        effect: { kind: 'adopt', score: fromUrl },
        memory: { seen: current, pending: memory.pending },
      }
    }
  }

  // 2. + 4. Mirror state back into the URL.
  const desired = maxRiskScore === defaultMaxRisk ? null : String(maxRiskScore)
  if (current !== desired) {
    return {
      effect: { kind: 'write', value: desired },
      memory: { seen: desired, pending: desired },
    }
  }

  return { effect: { kind: 'idle' }, memory: { seen: current, pending: memory.pending } }
}
