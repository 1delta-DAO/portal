/**
 * Recovering from "Failed to fetch dynamically imported module".
 *
 * The tab panels are code-split, so the HTML a tab loaded names chunks by
 * content hash (`assets/unified-D3H-CFFz.js`), and each of those statically
 * imports a dozen shared chunks. When any file in that graph fails to load, the
 * `import()` rejects with that one message, naming only the top-level chunk.
 *
 * Two facts decide what can be done about it, and both were learned the hard
 * way in production:
 *
 *  - **The browser memoises the failure.** Per the HTML spec, a module URL
 *    whose fetch failed is recorded as failed in the document's module map for
 *    the life of the page; a later import of the same URL is answered from the
 *    map without a request. So retrying the same specifier can never succeed,
 *    and if the file that failed was a DEPENDENCY, nothing in this page can
 *    reach it again — a fresh URL for the top-level chunk still resolves the
 *    same dependency URL. Only a reload gets a fresh module map.
 *  - **The browser's HTTP cache can hold the failure too.** A chunk requested
 *    in the moment before it was published came back as the SPA fallback —
 *    `index.html`, status 200 — stamped `immutable, max-age=1y` because the
 *    request path matched the `/assets/*` header rule. From then on that URL
 *    was an HTML page as far as the browser was concerned: every import
 *    failed, every reload reused the entry, clearing cookies changed nothing.
 *    This is what "we get this after every update" was. `chunkProbe` detects
 *    and repairs it (see there); `functions/assets/[[path]].js` stops the
 *    server producing it.
 *
 * So the recovery is: probe the chunk's graph and repair any poisoned cache
 * entries; give up without reloading only if a file is blocked or refused by
 * this browser; try the top-level chunk once under a fresh URL; then reload,
 * with a growing delay across attempts so a publish window is ridden out by
 * "retrying in 20 s…" rather than by an error screen. React's `lazy` caches
 * the rejected promise, so without any of this a single failed request leaves
 * the tab broken until the user works out that a hard refresh is the fix.
 */

import { probeChunkGraph, reloadCanHelp, type ChunkProbe } from './chunkProbe'

/**
 * Wait before reload attempt N. Attempt 0 is immediate — the common case is a
 * blip that a fresh module map fixes. Beyond the last entry the page stops
 * reloading itself and asks the user.
 */
const RELOAD_DELAYS_MS = [0, 10_000, 20_000, 40_000]

/** Attempts older than this belong to a previous incident and are forgotten. */
const ATTEMPT_WINDOW_MS = 5 * 60_000

const ATTEMPTS_KEY = 'chunkReloadAttempts'

/** How the error boundary should describe a chunk failure. */
export interface ChunkDiagnosis {
  /**
   * `unreachable`: the browser cannot fetch the file at all — blocked, filtered
   * or offline — so reloading is pointless and is not attempted.
   * `unavailable`: the file is not loading right now; the page will reload
   * itself at `retryAt` if that is set, and has given up if it is not.
   */
  kind: 'unreachable' | 'unavailable'
  /** Epoch ms of the scheduled automatic reload, when one is scheduled. */
  retryAt?: number
  /** What the browser found when it examined the chunk's import graph. */
  probes?: ChunkProbe[]
}

const DIAGNOSIS = Symbol.for('1delta.chunkDiagnosis')

/**
 * The most recent error Vite handed to `vite:preloadError`, and when.
 *
 * `installChunkErrorReload` cancels that event, which makes Vite's preload
 * helper RESOLVE WITH `undefined` instead of throwing (see `readModule`). The
 * real cause would be lost otherwise, and with it the chunk URL the retry needs.
 */
let lastPreloadError: { error: unknown; at: number } | undefined

/**
 * Whether an error is a failed module fetch rather than a bug in the module.
 *
 * The wording differs per engine and none of it is standardised, so this
 * matches all of the current phrasings rather than one.
 */
export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : String(error ?? '')
  return (
    /failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message) ||
    /loading chunk \d+ failed/i.test(message) ||
    /'text\/html' is not a valid JavaScript MIME type/i.test(message)
  )
}

/** What the recovery concluded about a chunk error, if anything. */
export function chunkDiagnosis(error: unknown): ChunkDiagnosis | undefined {
  if (!error || typeof error !== 'object') return undefined
  return (error as Record<symbol, ChunkDiagnosis | undefined>)[DIAGNOSIS]
}

function diagnose(error: unknown, diagnosis: ChunkDiagnosis): void {
  if (!error || typeof error !== 'object') return
  try {
    Object.defineProperty(error, DIAGNOSIS, { value: diagnosis, configurable: true })
  } catch {
    /* frozen error object — the boundary still shows the message */
  }
}

/**
 * The chunk URL an engine put in its error message, if it is one of ours.
 *
 * Same-origin only, and exported with the origin as an argument rather than
 * read from `location`, because this decides what gets `import()`ed: a URL
 * lifted out of a string must never be able to point somewhere else.
 */
export function parseChunkUrl(message: string, origin: string): string | undefined {
  const match = message.match(/https?:\/\/[^\s"')]+/)
  if (!match) return undefined
  try {
    const url = new URL(match[0])
    return url.origin === origin ? url.href : undefined
  } catch {
    return undefined
  }
}

/** Same file, new URL — a new module-map entry and a new cache key. */
function cacheBusted(url: string): string {
  const u = new URL(url)
  u.searchParams.set('reload', String(Date.now()))
  return u.href
}

// ---------------------------------------------------------------------------
// Reload attempts — remembered ACROSS reloads, which is the whole difficulty
// ---------------------------------------------------------------------------

/**
 * The attempt counter survives the reload it counts, so it cannot live in
 * memory. `sessionStorage` is the natural home; `window.name` is the fallback
 * for browsers that block storage (a hardened profile, a shield), because it
 * is per-tab, survives same-tab navigation, and is not gated by storage
 * settings. Without a fallback, a blocked-storage browser would reload without
 * limit.
 */
const NAME_TAG = /(^|;)chunkReloadAttempts=([^;]*)/

function readRaw(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage.getItem(ATTEMPTS_KEY)
  } catch {
    return NAME_TAG.exec(window.name ?? '')?.[2] ?? null
  }
}

function writeRaw(value: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (value === null) window.sessionStorage.removeItem(ATTEMPTS_KEY)
    else window.sessionStorage.setItem(ATTEMPTS_KEY, value)
    return
  } catch {
    /* fall through to window.name */
  }
  const rest = (window.name ?? '').replace(NAME_TAG, '')
  window.name = value === null ? rest : `${rest};chunkReloadAttempts=${value}`
}

/** Reload attempts so far in the current incident. */
function readAttempts(): number {
  const raw = readRaw()
  if (!raw) return 0
  const [n, at] = raw.split(':').map(Number)
  if (!Number.isFinite(n) || !Number.isFinite(at)) return 0
  return Date.now() - at > ATTEMPT_WINDOW_MS ? 0 : n
}

function writeAttempts(n: number): void {
  writeRaw(`${n}:${Date.now()}`)
}

/**
 * Forget the incident. Called when a chunk loads, so the NEXT publish starts
 * with a full allowance of reloads rather than the remainder of the last one.
 */
function clearAttempts(): void {
  if (readRaw() !== null) writeRaw(null)
}

/**
 * Reload now, or schedule one, or give up — depending on how many times this
 * tab has already tried for this incident.
 *
 * Returns the delay of the reload it arranged, or `null` when it arranged none.
 * A `0` means the page is already going away.
 */
/** Wait before reload attempt `n`, or `undefined` once the page should stop. */
export function reloadDelayForAttempt(n: number): number | undefined {
  return RELOAD_DELAYS_MS[n]
}

function scheduleReload(error: unknown, probes?: ChunkProbe[]): number | null {
  if (typeof window === 'undefined') return null
  const n = readAttempts()
  const delay = reloadDelayForAttempt(n)
  if (delay === undefined) {
    diagnose(error, { kind: 'unavailable', probes })
    return null
  }
  writeAttempts(n + 1)
  diagnose(error, { kind: 'unavailable', retryAt: Date.now() + delay, probes })
  window.setTimeout(() => window.location.reload(), delay)
  return delay
}

// ---------------------------------------------------------------------------
// The wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap a `lazy()` importer so a chunk that fails to download recovers.
 *
 *     const EarnTab = lazy(lazyChunk(() => import('./tabs/earn'), 'EarnTab'))
 *
 * The export name is passed rather than mapped by the caller (`.then(m => ({
 * default: m.EarnTab }))`) because the retry needs it: recovering means
 * importing the chunk from a different URL, and this has to know which export
 * to hand back from it.
 *
 * While it retries, the promise stays pending — so the user sees the tab's
 * loading state, which is what is actually happening, rather than an error.
 *
 * The importer is still only called when the component first renders, so a
 * code-split tab that is never opened is still never downloaded.
 */
export function lazyChunk<M extends object, K extends keyof M>(
  load: () => Promise<M>,
  exportName: K
): () => Promise<{ default: M[K] }> {
  const pick = (module: M) => ({ default: module[exportName] })

  /**
   * Load the chunk and take the export — treating "resolved with nothing" as
   * the failure it is.
   *
   * Vite's preload helper ends in `baseModule().catch(handlePreloadError)`, and
   * `handlePreloadError` re-throws ONLY when the `vite:preloadError` event was
   * not cancelled. Since this app cancels it (so the failure is handled here
   * rather than surfacing as an unhandled window error), a failed import
   * arrives as a promise that resolves with `undefined` — which read as
   * "Cannot read properties of undefined (reading 'LendingDashboard')", an
   * error boundary blaming the app for what was a failed download.
   */
  const readModule = async (): Promise<{ default: M[K] }> => {
    const module = await load()
    if (module == null) throw swallowedPreloadError()
    return pick(module)
  }

  return async () => {
    try {
      const result = await readModule()
      clearAttempts()
      return result
    } catch (error) {
      if (!isChunkLoadError(error)) throw error

      const message = error instanceof Error ? error.message : String(error)
      const url =
        typeof window === 'undefined' ? undefined : parseChunkUrl(message, window.location.origin)

      // First, find out what actually failed — and repair what can be repaired
      // from here. The probe re-fetches every file in the chunk's graph under
      // its REAL URL with `cache: 'reload'`, which replaces a poisoned HTTP
      // cache entry (an HTML fallback cached as a script) with the file the
      // server serves now. That is the one fix a reload alone cannot perform:
      // a reload reuses an `immutable` entry without asking.
      const probes = url ? await probeChunkGraph(url).catch(() => undefined) : undefined
      if (probes && !reloadCanHelp(probes)) {
        diagnose(error, { kind: 'unreachable', probes })
        throw error
      }

      // One fresh-URL import of the top-level chunk. Works when the top-level
      // file itself was the problem (late, or a damaged copy); a dependency
      // that failed is memoised as failed for the life of this page, and only
      // the reload below gets past that.
      if (url) {
        try {
          const module = (await import(/* @vite-ignore */ cacheBusted(url))) as M | undefined
          if (module != null) {
            clearAttempts()
            return pick(module)
          }
        } catch {
          /* fall through to the reload */
        }
      }

      const delay = scheduleReload(error, probes)
      // Never resolves: the page is going away, and resolving would render a
      // component from a module map that is about to be discarded.
      if (delay === 0) return new Promise<{ default: M[K] }>(() => {})
      // Either a countdown to the next reload, or the end of the road — both
      // are the error boundary's to show.
      throw error
    }
  }
}

/**
 * The error to raise when an import resolved with nothing.
 *
 * Reuses the cause Vite reported moments ago where there is one, because it
 * names the chunk URL — which is what lets the retry above rebuild it with a
 * fresh cache key. Anything older than a few seconds belongs to a different
 * failure and is ignored.
 */
function swallowedPreloadError(): Error {
  const recent =
    lastPreloadError && Date.now() - lastPreloadError.at < 5_000
      ? lastPreloadError.error
      : undefined
  const message = recent instanceof Error ? recent.message : String(recent ?? '')
  return new Error(
    isChunkLoadError(message)
      ? message
      : 'Failed to fetch dynamically imported module (the import resolved with nothing)'
  )
}

/**
 * Download the code-split chunks a user is likely to open next, once the app is
 * idle.
 *
 * A module that is already loaded cannot be deployed away, so warming the tabs
 * shortly after boot means the common case — "I had the app open, you shipped,
 * I clicked a tab" — never reaches the network at all. It is deliberately
 * cheap-or-nothing: idle time only, skipped on a metered or slow connection,
 * and a failure here is not an error, because the real import will run its own
 * recovery when the user actually opens the tab.
 */
export function prefetchChunks(loaders: (() => Promise<unknown>)[]): () => void {
  if (typeof window === 'undefined') return () => {}

  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string }
    }
  ).connection
  if (connection?.saveData) return () => {}
  if (connection?.effectiveType && /2g/.test(connection.effectiveType)) return () => {}

  let cancelled = false
  const run = () => {
    if (cancelled) return
    for (const load of loaders) void load().catch(() => {})
  }

  // Not every engine has it (older Safari), and the DOM types insist it is
  // always there.
  const idle =
    typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback.bind(window)
      : undefined
  const handle = idle ? idle(run, { timeout: 5_000 }) : window.setTimeout(run, 3_000)

  return () => {
    cancelled = true
    if (idle) window.cancelIdleCallback?.(handle as number)
    else window.clearTimeout(handle as number)
  }
}

/**
 * Route Vite's preload failures into the recovery above.
 *
 * Vite fires `vite:preloadError` when a `modulepreload` it emitted fails.
 * Cancelling it stops Vite re-throwing, so a failed preload of a DEPENDENCY
 * falls through to the real import (which may still succeed), and a failed
 * import surfaces in `lazyChunk` as a module that resolved with nothing — which
 * `readModule` turns back into the chunk error it was, cause attached.
 */
export function installChunkErrorReload(): void {
  window.addEventListener('vite:preloadError', ((event: Event & { payload?: unknown }) => {
    lastPreloadError = { error: event.payload, at: Date.now() }
    event.preventDefault()
  }) as EventListener)
}
