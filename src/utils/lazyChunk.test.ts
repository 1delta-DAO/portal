import { describe, expect, it, vi } from 'vitest'
import { chunkDiagnosis, isChunkLoadError, lazyChunk, parseChunkUrl } from './lazyChunk'

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

  it('retries once, so a dropped request costs a retry and not a reload', async () => {
    const load = vi
      .fn<() => Promise<{ EarnTab: string }>>()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module: /a.js'))
      .mockResolvedValueOnce({ EarnTab: 'Tab' })
    await expect(lazyChunk(load, 'EarnTab')()).resolves.toEqual({ default: 'Tab' })
    expect(load).toHaveBeenCalledTimes(2)
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

  it('rides out a deploy window instead of failing on the first miss', async () => {
    // The case behind "we get this after every single update": the HTML is
    // current and names a chunk the CDN has not started serving yet. Retrying
    // in the same millisecond re-asks the same edge; waiting a moment works.
    vi.useFakeTimers()
    try {
      const chunkError = new Error('Failed to fetch dynamically imported module: /assets/x.js')
      const load = vi
        .fn<() => Promise<{ Tab: string }>>()
        .mockRejectedValueOnce(chunkError)
        .mockRejectedValueOnce(chunkError)
        .mockResolvedValueOnce({ Tab: 'Tab' })

      const pending = lazyChunk(load, 'Tab')()
      await vi.runAllTimersAsync()

      await expect(pending).resolves.toEqual({ default: 'Tab' })
      expect(load).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('carries no diagnosis until the recovery has established one', () => {
    // The error boundary keys its wording off this; an unproven guess there is
    // how a user gets told to reload for something a reload cannot fix.
    expect(
      chunkDiagnosis(new Error('Failed to fetch dynamically imported module: /a.js'))
    ).toBeUndefined()
  })
})
