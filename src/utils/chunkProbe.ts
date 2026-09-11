/**
 * Find out WHICH file in a chunk's import graph the browser cannot load, why —
 * and, where the cause is the browser's own cache, repair it.
 *
 * A failed dynamic import rejects with one message naming the top-level chunk,
 * whatever actually failed: the chunk itself or any of the shared chunks it
 * statically imports; a 404; a response with the wrong MIME type; a request a
 * content blocker dropped. From outside, the server is usually fine by the
 * time anyone looks. The answer exists only in the browser that failed.
 *
 * The failure that turned out to be behind "we get this after every update":
 * a chunk requested moments before it was published came back as the SPA
 * fallback — `index.html`, status 200 — and, because the request PATH matched
 * the `/assets/*` rule, with `Cache-Control: immutable, max-age=1y`. The
 * browser then held an HTML page in place of that script for a year. Every
 * import of it failed, every reload reused it, clearing cookies did nothing.
 *
 * So each file is examined three ways, in this order:
 *
 *  1. `cache: 'only-if-cached'` — what this browser currently HOLDS for the
 *     URL. A cached non-script response is the poisoning above.
 *  2. `cache: 'reload'` on the SAME URL — what the server serves now, and, as
 *     a side effect, the repair: the response replaces the cached entry.
 *  3. `<link rel="modulepreload">` — whether the browser will load it AS A
 *     SCRIPT: the pipeline `import()` uses, subject to the same blockers, MIME
 *     checks and `nosniff`, without executing it (a `<script>` probe would,
 *     and executing a second copy of a shared chunk is not safe). Tagged with
 *     a query string so it is a fresh module-map entry — the failure being
 *     diagnosed is memoised under the original URL.
 */

export type ChunkVerdict =
  /** Served and loadable as a script. */
  | 'ok'
  /**
   * The browser's cache held a non-script response for this URL — replaced
   * now with what the server serves. A reload will load it.
   */
  | 'poisoned'
  /** The server has no such file (4xx/5xx). */
  | 'missing'
  /**
   * The server answered the script URL with an HTML page: the SPA fallback,
   * meaning the file is not published (yet). Usually clears within a minute.
   */
  | 'unpublished'
  /** The request itself failed — blocked, filtered or offline. */
  | 'blocked'
  /** Served as script, but the browser refused to load it (MIME, nosniff, CSP). */
  | 'refused'
  /** No answer inside the time allowed. */
  | 'timeout'

export interface ChunkProbe {
  /** File name only — the origin and folder are the same for every entry. */
  file: string
  verdict: ChunkVerdict
  status?: number
  contentType?: string
}

const MAX_FILES = 40
const MAX_DEPTH = 3
const PROBE_TIMEOUT_MS = 8_000

const isScriptType = (contentType: string | null | undefined) =>
  /javascript|ecmascript/i.test(contentType ?? '')

/**
 * The static imports of a built chunk, resolved against its own URL.
 *
 * Matches what Rollup emits — `from"./x.js"` and the side-effect form
 * `import"./x.js"` — and deliberately NOT `import("./x.js")`: a dynamic import
 * is not needed to evaluate the module, so it cannot be why this one failed.
 */
export function parseStaticImports(source: string, baseUrl: string): string[] {
  const out = new Set<string>()
  const pattern = /(?:\bfrom|\bimport)\s*["']([^"']+\.js)["']/g
  for (const match of source.matchAll(pattern)) {
    try {
      out.add(new URL(match[1], baseUrl).href)
    } catch {
      /* not a URL — leave it */
    }
  }
  return [...out]
}

function withProbeTag(url: string): string {
  const u = new URL(url)
  u.searchParams.set('probe', String(Date.now()))
  return u.href
}

/** Whether the browser will load the URL as a module script (see above). */
function loadsAsScript(url: string): Promise<'ok' | 'refused' | 'timeout'> {
  return new Promise((resolve) => {
    const link = document.createElement('link')
    link.rel = 'modulepreload'
    link.crossOrigin = ''
    const done = (verdict: 'ok' | 'refused' | 'timeout') => {
      window.clearTimeout(timer)
      link.remove()
      resolve(verdict)
    }
    const timer = window.setTimeout(() => done('timeout'), PROBE_TIMEOUT_MS)
    link.addEventListener('load', () => done('ok'))
    link.addEventListener('error', () => done('refused'))
    link.href = withProbeTag(url)
    document.head.appendChild(link)
  })
}

/** Whether the browser's HTTP cache holds a non-script response for the URL. */
async function cacheIsPoisoned(url: string): Promise<boolean> {
  try {
    // `only-if-cached` needs `same-origin` mode; 504 means "nothing cached".
    const cached = await fetch(url, { cache: 'only-if-cached', mode: 'same-origin' })
    return cached.status !== 504 && !isScriptType(cached.headers.get('content-type'))
  } catch {
    // Not supported here, or nothing cached — either way nothing to repair.
    return false
  }
}

async function probeOne(url: string): Promise<{ probe: ChunkProbe; source?: string }> {
  const file = url.split('/').pop() ?? url
  const poisoned = await cacheIsPoisoned(url)

  // Same URL, no tag: this is the request that REPLACES the cached entry.
  let response: Response
  try {
    response = await fetch(url, { cache: 'reload' })
  } catch {
    return { probe: { file, verdict: 'blocked' } }
  }
  const status = response.status
  const contentType = response.headers.get('content-type') ?? undefined
  if (!response.ok) return { probe: { file, verdict: 'missing', status, contentType } }
  if (!isScriptType(contentType)) {
    return { probe: { file, verdict: 'unpublished', status, contentType } }
  }

  const source = await response.text()
  if (poisoned) return { probe: { file, verdict: 'poisoned', status, contentType }, source }
  const verdict = await loadsAsScript(url)
  return { probe: { file, verdict, status, contentType }, source }
}

/**
 * Probe a chunk and the shared chunks it statically imports, repairing any
 * poisoned cache entries on the way.
 *
 * Returns every file examined, failures first, so a caller can show the one
 * that matters and a reader can see the rest were fine.
 */
export async function probeChunkGraph(topUrl: string): Promise<ChunkProbe[]> {
  const results: ChunkProbe[] = []
  const seen = new Set<string>([topUrl])
  let frontier = [topUrl]

  for (let depth = 0; depth <= MAX_DEPTH && frontier.length; depth++) {
    const next: string[] = []
    // Level by level and in parallel within a level: the answer is usually in
    // the first two, and a serial walk of forty files is too slow to wait for.
    const settled = await Promise.all(frontier.map(probeOne))
    for (const { probe, source } of settled) {
      results.push(probe)
      if (!source || depth === MAX_DEPTH) continue
      for (const dep of parseStaticImports(source, topUrl)) {
        if (seen.has(dep) || seen.size >= MAX_FILES) continue
        seen.add(dep)
        next.push(dep)
      }
    }
    frontier = next
  }

  const rank = (p: ChunkProbe) => (p.verdict === 'ok' ? 1 : 0)
  return results.sort((a, b) => rank(a) - rank(b))
}

/** Whether a reload can help, given what the probe found. */
export function reloadCanHelp(probes: ChunkProbe[]): boolean {
  // A request this browser drops, or a script it refuses, fails the same way
  // after every reload. Everything else is either repaired or still arriving.
  return !probes.some((p) => p.verdict === 'blocked' || p.verdict === 'refused')
}

/** One line per finding, for a "copy details" button or a bug report. */
export function describeProbes(probes: ChunkProbe[]): string {
  const bad = probes.filter((p) => p.verdict !== 'ok')
  if (!bad.length) return `All ${probes.length} files load — the failure was transient.`
  const why: Record<Exclude<ChunkVerdict, 'ok'>, string> = {
    poisoned:
      'the browser had cached a non-script response in its place (now replaced with the real file)',
    missing: 'the server does not have it',
    unpublished: 'the server answered with an HTML page instead — the file is not published yet',
    blocked: 'the request never reached a server (blocked, filtered or offline)',
    refused: 'served, but the browser refused to load it as a script',
    timeout: 'no answer',
  }
  return bad
    .map(
      (p) =>
        `${p.file}: ${why[p.verdict as Exclude<ChunkVerdict, 'ok'>]}` +
        (p.status ? ` (HTTP ${p.status}${p.contentType ? `, ${p.contentType}` : ''})` : '')
    )
    .join('\n')
}
