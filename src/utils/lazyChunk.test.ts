import { describe, expect, it, vi } from 'vitest'
import { isChunkLoadError, isChunkUnreachable, lazyChunk, parseChunkUrl } from './lazyChunk'

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

  it('does not claim an error is unreachable until it has been proven', () => {
    expect(
      isChunkUnreachable(new Error('Failed to fetch dynamically imported module: /a.js'))
    ).toBe(false)
  })
})
