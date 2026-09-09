/**
 * Surviving a deploy that lands while the app is open.
 *
 * The tab panels are code-split, so the HTML this tab loaded names chunks by
 * content hash (`assets/earn-N3DnCI3N.js`). A deploy replaces those files with
 * new hashes and the old ones stop existing, so the moment the user opens a tab
 * whose chunk was never fetched, the import 404s:
 *
 *     Failed to fetch dynamically imported module: …/assets/earn-N3DnCI3N.js
 *
 * Nothing is wrong with the build; the tab is simply holding an index.html that
 * no longer describes the server. Only fresh HTML can fix it, and the app has
 * to ask for it, because:
 *
 *  - React's `lazy` CACHES THE REJECTED PROMISE. Once a chunk fails, every
 *    later render of that component re-throws the same rejection, so an error
 *    boundary's "try again" can never clear it — which is why this failure
 *    reads as permanent rather than as a one-off.
 *  - A user cannot be expected to know that a hard reload is the remedy for a
 *    message about a module URL.
 *
 * So: retry once (a chunk fetch can fail on a flaky connection too), then
 * reload the page, once, guarded against a loop.
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
 * Whether an error is a failed module fetch rather than a bug in the module.
 *
 * The wording differs per engine and none of it is standardised, so this
 * matches on all of the current phrasings rather than on one.
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

/**
 * Reload for fresh HTML, unless this tab already did so recently.
 *
 * Returns whether the reload was started — the caller stops doing anything
 * else when it was, because the page is on its way out.
 */
function reloadForNewDeployment(): boolean {
  // Offline is a different problem with the same symptom, and reloading an
  // offline tab replaces a recoverable error with the browser's offline page.
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
 * Wrap a `lazy()` importer so a chunk that has been deployed away recovers.
 *
 * Use it for every `React.lazy` in the app:
 *
 *     const EarnTab = lazy(lazyChunk(() => import('./tabs/earn').then(…)))
 *
 * The importer is still only called when the component first renders, so a
 * code-split tab that is never opened is still never downloaded.
 */
export function lazyChunk<T>(load: () => Promise<T>): () => Promise<T> {
  return async () => {
    try {
      return await load()
    } catch (error) {
      if (!isChunkLoadError(error)) throw error

      // One retry, for the case this is a dropped request rather than a
      // vanished file — cheap, and it saves a reload on a flaky connection.
      try {
        return await load()
      } catch {
        /* fall through to the reload */
      }

      // Never resolves: the reload is already in flight and resolving here
      // would render a component from HTML that is about to be replaced.
      if (reloadForNewDeployment()) return new Promise<T>(() => {})
      throw error
    }
  }
}

/**
 * Catch the chunk failures `lazyChunk` cannot see.
 *
 * Vite fires `vite:preloadError` when a `modulepreload` it emitted fails —
 * which happens before any component renders, so no `lazy` importer is
 * involved and no error boundary is reached. Calling `preventDefault()` stops
 * Vite from re-throwing, but only when we have actually started a reload;
 * otherwise the error must stay visible.
 */
export function installChunkErrorReload(): void {
  window.addEventListener('vite:preloadError', ((event: Event) => {
    if (reloadForNewDeployment()) event.preventDefault()
  }) as EventListener)
}
