/**
 * Recovering from "Failed to fetch dynamically imported module".
 *
 * The tab panels are code-split, so the HTML a tab loaded names chunks by
 * content hash (`assets/trading-C0R142va.js`). When one of those imports fails,
 * React's `lazy` CACHES THE REJECTED PROMISE: every later render of that
 * component re-throws the same rejection, so the tab stays broken until the
 * page is reloaded. That is what turns a single failed request into a fault
 * that appears to happen "all the time".
 *
 * There are three reasons the request fails, they need different remedies, and
 * they are indistinguishable from the error alone:
 *
 *  1. **The file is gone.** A deploy replaced the hashed chunks while this tab
 *     was open, so the HTML it holds names files the server no longer has.
 *     Only fresh HTML fixes it → reload.
 *  2. **The browser has a bad copy.** Assets are served `immutable` for a year,
 *     so one truncated or failed response can be reused from the HTTP cache
 *     indefinitely — the file is fine on the server and broken for exactly one
 *     user, every time they load the page. A plain reload does NOT bypass the
 *     cache for subresources → re-import the same file under a cache-busting
 *     URL.
 *  3. **The request never left.** A content blocker, a shield, a corporate
 *     filter or a dead connection. Reloading achieves nothing and throws away
 *     whatever the user was doing → say so instead.
 *
 * So this asks the network which case it is (`probeChunk`) rather than
 * guessing, and only reloads when a reload can actually help.
 */

/** Timestamp of the last reload this module triggered, per tab. */
const RELOAD_KEY = 'chunkReloadAt'

/**
 * How long to wait before a second automatic reload is allowed. Long enough
 * that a genuinely broken deploy — the new HTML names a chunk that also 404s —
 * shows the error instead of reloading forever.
 */
const RELOAD_COOLDOWN_MS = 30_000

/**
 * Marks an error as "this browser could not reach the file at all", so the
 * error boundary can say that rather than blaming a deploy. `Symbol.for` so the
 * flag survives the module being loaded twice.
 */
const UNREACHABLE = Symbol.for('1delta.chunkUnreachable')

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

/** True when the recovery attempts proved the file could not be fetched. */
export function isChunkUnreachable(error: unknown): boolean {
  return (
    !!error && typeof error === 'object' && (error as Record<symbol, unknown>)[UNREACHABLE] === true
  )
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

/** Same file, new cache key — defeats a poisoned `immutable` cache entry. */
function cacheBusted(url: string): string {
  const u = new URL(url)
  u.searchParams.set('reload', String(Date.now()))
  return u.href
}

/**
 * What the network says about a chunk: gone, fine, or unreachable.
 *
 * `cache: 'reload'` so the answer is about the SERVER and not about the same
 * cache entry that may be the problem.
 */
async function probeChunk(url: string): Promise<'missing' | 'reachable' | 'unreachable'> {
  try {
    const res = await fetch(url, { cache: 'reload' })
    return res.ok ? 'reachable' : 'missing'
  } catch {
    // A blocked request and an offline one both land here — neither is fixed
    // by reloading.
    return 'unreachable'
  }
}

/**
 * Reload for fresh HTML, unless this tab already did so recently.
 *
 * Returns whether the reload was started — the caller stops doing anything
 * else when it was, because the page is on its way out.
 */
function reloadForNewDeployment(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (Number.isFinite(last) && Date.now() - last < RELOAD_COOLDOWN_MS) return false
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // No sessionStorage (private mode, blocked storage) means no loop guard,
    // and an unguarded reload loop is worse than the error it would fix.
    return false
  }
  window.location.reload()
  return true
}

/**
 * Wrap a `lazy()` importer so a chunk that fails to load recovers.
 *
 *     const EarnTab = lazy(lazyChunk(() => import('./tabs/earn'), 'EarnTab'))
 *
 * The export name is passed rather than mapped by the caller (`.then(m => ({
 * default: m.EarnTab }))`) because the retry needs it: recovering a poisoned
 * cache entry means importing the chunk from a different URL, and this has to
 * know which export to hand back from it.
 *
 * The importer is still only called when the component first renders, so a
 * code-split tab that is never opened is still never downloaded.
 */
export function lazyChunk<M extends object, K extends keyof M>(
  load: () => Promise<M>,
  exportName: K
): () => Promise<{ default: M[K] }> {
  const pick = (module: M) => ({ default: module[exportName] })

  return async () => {
    try {
      return pick(await load())
    } catch (error) {
      if (!isChunkLoadError(error)) throw error

      // 1. A dropped request. Cheap to rule out, and it saves everything below
      //    on a flaky connection.
      try {
        return pick(await load())
      } catch {
        /* keep going */
      }

      const message = error instanceof Error ? error.message : String(error)
      const url =
        typeof window === 'undefined' ? undefined : parseChunkUrl(message, window.location.origin)

      // 2. A bad copy in this browser's cache. The file is unchanged; only the
      //    cache key changes, so the module it yields is the one the HTML asked
      //    for.
      if (url) {
        try {
          return pick((await import(/* @vite-ignore */ cacheBusted(url))) as M)
        } catch {
          /* keep going */
        }
      }

      // 3. Ask what is actually wrong before reaching for a reload.
      const state = url ? await probeChunk(url) : 'missing'
      if (state === 'unreachable') {
        // Nothing this app does will fetch that file. Reloading would only
        // discard the user's work to arrive at the same error.
        try {
          Object.defineProperty(error as object, UNREACHABLE, { value: true })
        } catch {
          /* frozen error object — the boundary still shows the message */
        }
        throw error
      }

      // Never resolves: the reload is in flight, and resolving here would
      // render a component from HTML that is about to be replaced.
      if (reloadForNewDeployment()) return new Promise<{ default: M[K] }>(() => {})
      throw error
    }
  }
}

/**
 * Catch the chunk failures `lazyChunk` cannot see.
 *
 * Vite fires `vite:preloadError` when a `modulepreload` it emitted fails —
 * before any component renders, so no importer is involved and no error
 * boundary is reached. `preventDefault()` stops Vite re-throwing, but only when
 * a reload was actually started; otherwise the error must stay visible.
 */
export function installChunkErrorReload(): void {
  window.addEventListener('vite:preloadError', ((event: Event) => {
    if (reloadForNewDeployment()) event.preventDefault()
  }) as EventListener)
}
