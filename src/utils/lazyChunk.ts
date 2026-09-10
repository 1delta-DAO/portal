/**
 * Recovering from "Failed to fetch dynamically imported module".
 *
 * The tab panels are code-split, so the HTML a tab loaded names chunks by
 * content hash (`assets/unified-DZ1o3XA6.js`). When one of those imports fails,
 * React's `lazy` CACHES THE REJECTED PROMISE: every later render of that
 * component re-throws the same rejection, so the tab stays broken until the
 * page is reloaded. That is what turns a single failed request into a fault
 * that looks permanent.
 *
 * Three different things produce that one error message, and the remedies are
 * not interchangeable:
 *
 *  1. **The file is not there yet.** The window right after a deploy: the HTML
 *     is new, names new chunks, and an edge has not finished serving them. This
 *     is the one that shows up "after every single update", and it is why the
 *     retries below are SPACED — re-asking the same edge in the same
 *     millisecond just fails again, while waiting a second or two succeeds.
 *  2. **The file is gone.** A deploy replaced the chunks while this tab was
 *     open, so the HTML it holds names files that no longer exist. Only fresh
 *     HTML fixes that → reload.
 *  3. **The request never left, or came back damaged.** A content blocker, a
 *     shield, a filter, a dead connection — or a truncated response cached
 *     under `immutable` for a year, which a plain reload will not bypass.
 *
 * Telling 1 and 2 apart matters, because reloading for a case-1 failure throws
 * the user's work away and lands on the same error. So this checks whether the
 * DOCUMENT is actually out of date (`documentIsStale`) instead of assuming it,
 * and reloads only then.
 */

/** How long to wait before each retry. Spaced, to ride out a deploy window. */
const RETRY_DELAYS_MS = [400, 1200, 3000]

/** Timestamp of the last reload this module triggered, per tab. */
const RELOAD_KEY = 'chunkReloadAt'

/** A second automatic reload is not allowed within this window. */
const RELOAD_COOLDOWN_MS = 30_000

/** Loop guard that works when storage does not — see `reloadForNewDeployment`. */
let reloadedThisPage = false

/**
 * The most recent error Vite handed to `vite:preloadError`, and when.
 *
 * `installChunkErrorReload` cancels that event, which makes Vite's preload
 * helper RESOLVE WITH `undefined` instead of throwing (see `readModule`). The
 * real cause would be lost otherwise, and with it the chunk URL the retry needs.
 */
let lastPreloadError: { error: unknown; at: number } | undefined

/** What the recovery attempts concluded. Read by the error boundary. */
export type ChunkDiagnosis =
  /** The deployment moved on; this document is out of date. */
  | 'stale'
  /** The file could not be fetched at all — blocked, filtered or offline. */
  | 'unreachable'
  /** The app is current and the file is simply not being served right now. */
  | 'unavailable'

const DIAGNOSIS = Symbol.for('1delta.chunkDiagnosis')

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

/** What the recovery attempts concluded about a chunk error, if anything. */
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

/** Same file, new cache key — defeats a damaged `immutable` cache entry. */
function cacheBusted(url: string): string {
  const u = new URL(url)
  u.searchParams.set('reload', String(Date.now()))
  return u.href
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The entry script this page is running, e.g. `index-C18Z1r3Y.js`. */
function currentEntryFile(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"]'))
  for (const script of scripts) {
    const file = script.src.split('/').pop()
    if (file?.startsWith('index-')) return file
  }
  return undefined
}

/**
 * Whether the server has moved on from the HTML this page is running.
 *
 * The whole point of asking: a deploy that lands while a tab is open and a
 * chunk that is briefly unavailable RIGHT AFTER a deploy produce the same
 * error, and a reload fixes only the first. Reloading for the second discards
 * whatever the user was doing and arrives at the same failure — which is
 * exactly the loop this app was showing after every update.
 */
async function documentIsStale(): Promise<boolean> {
  const entry = currentEntryFile()
  if (!entry || typeof window === 'undefined') return false
  try {
    const res = await fetch(`${window.location.origin}/?_=${Date.now()}`, { cache: 'reload' })
    if (!res.ok) return false
    const html = await res.text()
    // The freshly served HTML no longer names the script this page is running,
    // so this page is a generation behind.
    return !html.includes(entry)
  } catch {
    return false
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
  // In-memory first, so the guard still holds where storage is blocked (a
  // privacy-hardened browser, a shield, private mode). It is safe on its own
  // because the caller has already established that the document is stale, and
  // after the reload it will not be.
  if (reloadedThisPage) return false
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (Number.isFinite(last) && last > 0 && Date.now() - last < RELOAD_COOLDOWN_MS) return false
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    /* no storage: the in-memory guard above carries it */
  }
  reloadedThisPage = true
  window.location.reload()
  return true
}

/**
 * Wrap a `lazy()` importer so a chunk that fails to download recovers.
 *
 *     const EarnTab = lazy(lazyChunk(() => import('./tabs/earn'), 'EarnTab'))
 *
 * The export name is passed rather than mapped by the caller (`.then(m => ({
 * default: m.EarnTab }))`) because the retry needs it: recovering a damaged
 * cache entry means importing the chunk from a different URL, and this has to
 * know which export to hand back from it.
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
    return { default: module[exportName] }
  }

  return async () => {
    try {
      return await readModule()
    } catch (error) {
      if (!isChunkLoadError(error)) throw error

      const message = error instanceof Error ? error.message : String(error)
      const url =
        typeof window === 'undefined' ? undefined : parseChunkUrl(message, window.location.origin)

      for (const delay of RETRY_DELAYS_MS) {
        await sleep(delay)
        try {
          return await readModule()
        } catch {
          /* keep trying */
        }
        // A fresh cache key, in case the copy this browser holds is the broken
        // part. Skipped when the message named no URL of ours.
        // A raw import of a fresh URL: a different cache key, and — the reason
        // this matters more than it looks — a different entry in the browser's
        // MODULE MAP, which remembers a failed load for the life of the page
        // and rejects a repeat import of the same specifier without retrying it.
        if (url) {
          try {
            const module = (await import(/* @vite-ignore */ cacheBusted(url))) as M | undefined
            if (module != null) return { default: module[exportName] }
          } catch {
            /* keep trying */
          }
        }
      }

      // Out of retries. Now it is worth asking what kind of failure this is,
      // because only one of the three is fixed by reloading.
      if (await documentIsStale()) {
        diagnose(error, 'stale')
        // Never resolves: the reload is in flight, and resolving here would
        // render a component from HTML that is about to be replaced.
        if (reloadForNewDeployment()) return new Promise<{ default: M[K] }>(() => {})
        throw error
      }

      // The app is current, so a reload lands on this same error. Say which of
      // the two remaining cases it is instead of spending the user's state on
      // a reload that cannot help.
      diagnose(error, url && (await isFetchable(url)) === false ? 'unreachable' : 'unavailable')
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

/** Whether the browser can fetch a URL at all — false means blocked or offline. */
async function isFetchable(url: string): Promise<boolean> {
  try {
    await fetch(url, { cache: 'reload' })
    return true
  } catch {
    return false
  }
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
 * Catch the chunk failures `lazyChunk` cannot see.
 *
 * Vite fires `vite:preloadError` when a `modulepreload` it emitted fails —
 * before any component renders, so no importer is involved and no error
 * boundary is reached. `preventDefault()` stops Vite re-throwing, but only when
 * a reload was actually started; otherwise the error must stay visible.
 */
export function installChunkErrorReload(): void {
  window.addEventListener('vite:preloadError', ((event: Event & { payload?: unknown }) => {
    // Keep the cause: cancelling the event below is what loses it.
    lastPreloadError = { error: event.payload, at: Date.now() }
    // Synchronously, because Vite reads `defaultPrevented` the moment this
    // returns. Swallowing it is right either way: a failed PRELOAD is not a
    // failed import — the module has not been asked for yet, and when it is,
    // `lazyChunk` runs the whole recovery. All that is left to decide is
    // whether this document is a generation behind, which needs the network.
    event.preventDefault()
    void documentIsStale().then((stale) => {
      if (stale) reloadForNewDeployment()
    })
  }) as EventListener)
}
