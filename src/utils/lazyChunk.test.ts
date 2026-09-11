import { describe, expect, it, vi } from 'vitest'
import {
  chunkDiagnosis,
  isChunkLoadError,
  lazyChunk,
  parseChunkUrl,
  reloadDelayForAttempt,
} from './lazyChunk'

describe('isChunkLoadError — every engine words it differently', () => {
  it.each([
    // Chrome / Edge — the one in the report.
    'Failed to fetch dynamically imported module: https://app.portal.1delta.io/assets/earn-N3DnCI3N.js',
    // Firefox.
    'error loading dynamically imported module: https://example.com/assets/earn-abc.js',
    // Safari.
    'Importing a module script failed.',
    // Webpack-era wording, still emitted by some tooling in the stack.
    'Loading chunk 42 failed.',
    // A host that answers a missing asset with the SPA fallback HTML instead of
    // a 404 — the import then fails on the MIME type, same root cause.
    "Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of 'text/html'. 'text/html' is not a valid JavaScript MIME type.",
  ])('recognises %s', (message) => {
    expect(isChunkLoadError(new Error(message))).toBe(true)
  })

  it('does not claim an ordinary runtime error', () => {
    // Misclassifying here would reload the page on a real bug, hiding it and
    // throwing away whatever the user had typed.
    expect(isChunkLoadError(new Error("Cannot read properties of undefined (reading 'map')"))).toBe(
      false
    )
    expect(isChunkLoadError(undefined)).toBe(false)
  })
})

describe('parseChunkUrl — what the retry is allowed to import', () => {
  const origin = 'https://app.portal.1delta.io'

  it("lifts the chunk URL out of the engine's message", () => {
    expect(
      parseChunkUrl(
        'Failed to fetch dynamically imported module: https://app.portal.1delta.io/assets/trading-C0R142va.js',
        origin
      )
    ).toBe('https://app.portal.1delta.io/assets/trading-C0R142va.js')
  })

  it('refuses a URL from another origin', () => {
    // The value decides what gets `import()`ed. An error message is a string
    // from the platform, and a string is never allowed to point the app at
    // someone else's script.
    expect(
      parseChunkUrl(
        'Failed to fetch dynamically imported module: https://evil.example/x.js',
        origin
      )
    ).toBeUndefined()
  })

  it('returns nothing when the message carries no URL', () => {
    expect(parseChunkUrl('Importing a module script failed.', origin)).toBeUndefined()
  })
})

describe('lazyChunk', () => {
  it('hands back the named export as the default', async () => {
    const load = vi.fn(async () => ({ EarnTab: 'Tab', other: 'x' }))
    await expect(lazyChunk(load, 'EarnTab')()).resolves.toEqual({ default: 'Tab' })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('rethrows a non-chunk error immediately — no retry, no reload', async () => {
    // A component that throws on import is a bug to surface, not a bad download
    // to recover from.
    const load = vi
      .fn<() => Promise<{ EarnTab: string }>>()
      .mockRejectedValue(new TypeError('boom'))
    await expect(lazyChunk(load, 'EarnTab')()).rejects.toThrow('boom')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('treats an import that resolved with nothing as a failed download', async () => {
    // Vite's preload helper resolves with `undefined` when the app cancels
    // `vite:preloadError`, which this app does. Read naively that becomes
    // "Cannot read properties of undefined (reading 'LendingDashboard')" — a
    // crash report blaming the app for a file that did not arrive.
    const load = vi.fn(async () => undefined as unknown as { LendingDashboard: string })
    await expect(lazyChunk(load, 'LendingDashboard')()).rejects.toThrow(
      /dynamically imported module/i
    )
  })

  it('does not retry the same specifier', async () => {
    // The browser memoises a failed module URL for the life of the page, so a
    // second import of it is answered from the module map without a request.
    // Re-asking would only add latency before the reload that actually helps.
    const load = vi
      .fn<() => Promise<{ Tab: string }>>()
      .mockRejectedValue(new Error('Importing a module script failed.'))
    await expect(lazyChunk(load, 'Tab')()).rejects.toThrow()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('carries no diagnosis until the recovery has established one', () => {
    // The error boundary keys its wording off this; an unproven guess there is
    // how a user gets told to reload for something a reload cannot fix.
    expect(
      chunkDiagnosis(new Error('Failed to fetch dynamically imported module: /a.js'))
    ).toBeUndefined()
  })
})

describe('reloadDelayForAttempt — riding out a publish window', () => {
  it('reloads at once the first time, then waits longer each time', () => {
    // The first failure is usually a blip a fresh module map fixes; if it is
    // not, the files are still being published and hammering does not help.
    const delays = [0, 1, 2, 3].map(reloadDelayForAttempt)
    expect(delays[0]).toBe(0)
    for (let i = 1; i < delays.length; i++) expect(delays[i]!).toBeGreaterThan(delays[i - 1]!)
  })

  it('eventually stops and leaves it to the user', () => {
    // A page that reloads forever is worse than the error it is hiding.
    expect(reloadDelayForAttempt(4)).toBeUndefined()
  })

  it('covers about a minute in total', () => {
    // The window observed after publishes. Shorter and the last attempt lands
    // inside it; much longer and a genuinely broken deploy hides for too long.
    const total = [0, 1, 2, 3].reduce((sum, n) => sum + (reloadDelayForAttempt(n) ?? 0), 0)
    expect(total).toBeGreaterThanOrEqual(60_000)
    expect(total).toBeLessThanOrEqual(120_000)
  })
})
