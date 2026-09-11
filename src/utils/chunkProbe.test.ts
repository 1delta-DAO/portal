import { describe, expect, it } from 'vitest'
import { describeProbes, parseStaticImports, reloadCanHelp } from './chunkProbe'

const base = 'https://app.portal.1delta.io/assets/unified-D3H-CFFz.js'

describe('parseStaticImports — what a chunk needs before it can run', () => {
  it('reads the forms Rollup emits, resolved against the chunk', () => {
    // Real shapes from a built chunk: a named import, a side-effect import,
    // and a bare re-export.
    const src =
      'import{a as b}from"./AmountInput-Bqf8KBNA.js";import"./polyfill-x.js";export*from"./utils-C6ret39l.js";'
    expect(parseStaticImports(src, base)).toEqual([
      'https://app.portal.1delta.io/assets/AmountInput-Bqf8KBNA.js',
      'https://app.portal.1delta.io/assets/polyfill-x.js',
      'https://app.portal.1delta.io/assets/utils-C6ret39l.js',
    ])
  })

  it('ignores dynamic imports', () => {
    // `import("./x.js")` is not needed to evaluate the module, so it cannot be
    // why the module failed to load — and it would drag every tab's chunk
    // into a probe of one tab.
    const src = 'const x=()=>import("./lazy-tab.js");import"./needed.js";'
    expect(parseStaticImports(src, base).map((u) => u.split('/').pop())).toEqual(['needed.js'])
  })

  it('de-duplicates', () => {
    const src = 'import"./a.js";import{x}from"./a.js";'
    expect(parseStaticImports(src, base)).toHaveLength(1)
  })
})

describe('describeProbes — a report a person can act on', () => {
  it('leads with the file that failed and says how', () => {
    const text = describeProbes([
      { file: 'unified-D3H-CFFz.js', verdict: 'ok', status: 200 },
      {
        file: 'token-selection-C6PzR7wh.js',
        verdict: 'poisoned',
        status: 200,
        contentType: 'application/javascript',
      },
    ])
    expect(text).toContain('token-selection-C6PzR7wh.js')
    expect(text).toContain('cached a non-script response')
    expect(text).toContain('now replaced')
    expect(text).not.toContain('unified-D3H-CFFz.js')
  })

  it('says so when every file loads', () => {
    // The honest report when the probe runs after a transient failure: no
    // culprit, and no invented one.
    expect(describeProbes([{ file: 'a.js', verdict: 'ok' }])).toMatch(/transient/)
  })
})

describe('reloadCanHelp — when to stop reloading', () => {
  it('reloads for anything the server or the cache can still fix', () => {
    for (const verdict of ['ok', 'poisoned', 'missing', 'unpublished', 'timeout'] as const) {
      expect(reloadCanHelp([{ file: 'a.js', verdict }])).toBe(true)
    }
  })

  it('does not reload for a failure that lives in this browser', () => {
    // A dropped request or a refused script fails identically after a reload;
    // reloading only spends the user's state finding that out.
    for (const verdict of ['blocked', 'refused'] as const) {
      expect(reloadCanHelp([{ file: 'a.js', verdict }])).toBe(false)
    }
  })
})
