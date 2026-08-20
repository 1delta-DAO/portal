import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PoolEntry } from '../../sdk/lending-helper/poolTypes'

const apiFetch = vi.fn()
vi.mock('../../sdk/http', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

const { streamPoolsForChain, mergeChunk } = await import('./useFlattenedPools')

const PAGE_SIZE = 500

/** `count` placeholder pools — only the page length matters to the pager. */
function page(n: number): { items: PoolEntry[] } {
  return { items: Array.from({ length: n }, (_, i) => ({ marketUid: `m${i}` }) as PoolEntry) }
}

/** Drain the generator into the shape the reducer would produce. */
async function drain(): Promise<{ items: PoolEntry[]; truncated: boolean }> {
  let acc = { items: [] as PoolEntry[], truncated: false }
  for await (const chunk of streamPoolsForChain('1', undefined, 4, PAGE_SIZE, undefined, undefined)) {
    acc = mergeChunk(acc, chunk)
  }
  return acc
}

/** The `start` offset of every request issued, in call order. */
function requestedStarts(): number[] {
  return apiFetch.mock.calls.map((c) => (c[1] as { params: { start: number } }).params.start)
}

// Braces matter: `mockReset()` returns the mock, and a `beforeEach` that
// *returns* a function has handed vitest a teardown hook to call.
beforeEach(() => {
  apiFetch.mockReset()
})

describe('streamPoolsForChain', () => {
  it('stops after one request when the first page is short', async () => {
    apiFetch.mockResolvedValueOnce(page(120))

    const result = await drain()

    expect(result.items).toHaveLength(120)
    expect(result.truncated).toBe(false)
    expect(requestedStarts()).toEqual([0])
  })

  it('yields the first page before the rest are in flight', async () => {
    // The whole point of the stream: the table paints on page 1, so the first
    // chunk must be delivered while pages 2..4 are still outstanding.
    let releaseRest: () => void = () => {}
    const restLanded = new Promise<void>((r) => (releaseRest = r))
    apiFetch.mockResolvedValueOnce(page(PAGE_SIZE)).mockImplementation(async () => {
      await restLanded
      return page(10)
    })

    const gen = streamPoolsForChain('1', undefined, 4, PAGE_SIZE, undefined, undefined)
    const first = await gen.next()

    expect(first.value?.items).toHaveLength(PAGE_SIZE)
    releaseRest()
    await gen.return(undefined as never)
  })

  it('requests the remaining page budget in one parallel wave', async () => {
    // All three follow-ups must be issued before the first of them resolves —
    // otherwise this is the old serial pager wearing a generator.
    const starts: number[] = []
    let releaseRest: () => void = () => {}
    const gate = new Promise<void>((r) => (releaseRest = r))
    apiFetch.mockImplementation(async (_path: unknown, opts: { params: { start: number } }) => {
      starts.push(opts.params.start)
      if (opts.params.start > 0) await gate
      return page(PAGE_SIZE)
    })

    const pending = drain()
    // All four requests are out before any of them resolves.
    await vi.waitFor(() => expect(starts.length).toBe(4))
    expect(starts).toEqual([0, 500, 1000, 1500])
    releaseRest()
    const result = await pending

    expect(result.items).toHaveLength(2000)
    // Every page of the budget was full, so the chain is a capped slice.
    expect(result.truncated).toBe(true)
  })

  it('does not flag truncation when the last page comes back short', async () => {
    apiFetch
      .mockResolvedValueOnce(page(PAGE_SIZE))
      .mockResolvedValueOnce(page(PAGE_SIZE))
      .mockResolvedValueOnce(page(40))
      .mockResolvedValueOnce(page(0))

    const result = await drain()

    expect(result.items).toHaveLength(1040)
    expect(result.truncated).toBe(false)
  })

  it('ignores a failure on a speculative page the list never needed', async () => {
    // Page 2 ends the list, so the page-3/4 requests fired alongside it are
    // irrelevant — a rejection there must not fail a complete result.
    apiFetch
      .mockResolvedValueOnce(page(PAGE_SIZE))
      .mockResolvedValueOnce(page(30))
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'))

    const result = await drain()

    expect(result.items).toHaveLength(530)
  })

  it('propagates a failure on a page the list still needed', async () => {
    apiFetch.mockResolvedValueOnce(page(PAGE_SIZE)).mockRejectedValue(new Error('boom'))

    await expect(drain()).rejects.toThrow('boom')
  })
})
