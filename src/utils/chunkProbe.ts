/**
 * Find out WHICH file in a chunk's import graph the browser cannot load, and
 * why — because `import()` will not say.
 *
 * A failed dynamic import rejects with one message naming the top-level chunk,
 * whatever actually failed: the chunk itself, any of the shared chunks it
 * statically imports, a 404, a response with the wrong MIME type, or a request
 * a content blocker dropped. Those need different remedies (see `lazyChunk`),
 * and from the outside the server is usually fine — so the only place the real
 * answer exists is the browser that failed, and this is how it is asked.
 *
 * Each file is probed two ways, because they fail differently:
 *
 *  - `fetch()` says what the SERVER returned: status and content type. A
 *    request that throws never reached a server at all — blocked or offline.
 *  - `<link rel="modulepreload">` says whether the browser will load it AS A
 *    SCRIPT — the same pipeline `import()` uses, subject to the same blockers,
 *    MIME checks and `nosniff` — without executing it, which a `<script>`
 *    probe would, and executing a second copy of a shared chunk is not safe.
 *
 * Probe URLs carry a query string so they are new module-map entries: the
 * failure being diagnosed is memoised under the original URL.
 */

export type ChunkVerdict =
  /** Served and loadable as a script. */
  | 'ok'
  /** The server has no such file (4xx/5xx). */
  | 'missing'
  /** The request itself failed — blocked, filtered or offline. */
  | 'blocked'
  /** Served, but the browser refused it as a script (MIME type, nosniff, CSP). */
  | 'not-script'
  /** No answer inside the time allowed. */
  | 'timeout'

export interface ChunkProbe {
  /** File name only — the origin and folder are the same for every entry. */
  file: string
  verdict: ChunkVerdict
  status?: number
  contentType?: string
}

/** Probes deeper than this are unlikely to add anything but time. */
const MAX_FILES = 30
const MAX_DEPTH = 2
const PROBE_TIMEOUT_MS = 8_000

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
function loadsAsScript(url: string): Promise<'ok' | 'not-script' | 'timeout'> {
  return new Promise((resolve) => {
    const link = document.createElement('link')
    link.rel = 'modulepreload'
    link.crossOrigin = ''
    const done = (verdict: 'ok' | 'not-script' | 'timeout') => {
      window.clearTimeout(timer)
      link.remove()
      resolve(verdict)
    }
    const timer = window.setTimeout(() => done('timeout'), PROBE_TIMEOUT_MS)
    link.addEventListener('load', () => done('ok'))
    link.addEventListener('error', () => done('not-script'))
    link.href = withProbeTag(url)
    document.head.appendChild(link)
  })
}

async function probeOne(url: string): Promise<{ probe: ChunkProbe; source?: string }> {
  const file = url.split('/').pop() ?? url
  let response: Response
  try {
    response = await fetch(withProbeTag(url), { cache: 'reload' })
  } catch {
    return { probe: { file, verdict: 'blocked' } }
  }
  const status = response.status
  const contentType = response.headers.get('content-type') ?? undefined
  if (!response.ok) return { probe: { file, verdict: 'missing', status, contentType } }

  const source = await response.text()
  const verdict = await loadsAsScript(url)
  return { probe: { file, verdict, status, contentType }, source }
}

/**
 * Probe a chunk and the shared chunks it statically imports, two levels deep.
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
    // the first two, and a serial walk of thirty files is too slow to wait for.
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

/** One line per finding, for a "copy details" button or a bug report. */
export function describeProbes(probes: ChunkProbe[]): string {
  const bad = probes.filter((p) => p.verdict !== 'ok')
  if (!bad.length) return `All ${probes.length} files load — the failure was transient.`
  const why: Record<Exclude<ChunkVerdict, 'ok'>, string> = {
    missing: 'the server does not have it',
    blocked: 'the request never reached a server (blocked, filtered or offline)',
    'not-script': 'served, but the browser refused to load it as a script',
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
