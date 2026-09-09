import { describe, expect, it, vi } from 'vitest'
import { isChunkLoadError, lazyChunk } from './lazyChunk'

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

describe('lazyChunk', () => {
  it('passes a module through untouched when the import works', async () => {
    const load = vi.fn().mockResolvedValue({ default: 'Tab' })
    await expect(lazyChunk(load)()).resolves.toEqual({ default: 'Tab' })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('retries once, so a dropped request does not cost a reload', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module: /a.js'))
      .mockResolvedValueOnce({ default: 'Tab' })
    await expect(lazyChunk(load)()).resolves.toEqual({ default: 'Tab' })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('rethrows a non-chunk error immediately — no retry, no reload', async () => {
    // A component that throws on import is a bug to surface, not a stale
    // deployment to reload away.
    const load = vi.fn().mockRejectedValue(new TypeError('boom'))
    await expect(lazyChunk(load)()).rejects.toThrow('boom')
    expect(load).toHaveBeenCalledTimes(1)
  })
})
