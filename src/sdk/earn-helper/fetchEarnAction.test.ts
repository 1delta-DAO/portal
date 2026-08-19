import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchEarnAction } from './fetchEarnAction'

/**
 * The envelope shape, pinned.
 *
 * This exists because of one bug: the worker puts informational fields under
 * `data` and every call under a SIBLING `actions`, and this fetcher originally
 * used `apiFetchLoose`, which returns `json.data ?? json`. That discarded the
 * whole transaction block, so every row reported "the server returned no
 * transaction" — a message that blames the backend for a client-side lookup in
 * the wrong place. A shape test is the only thing that catches it, because the
 * request succeeded and the types were satisfied.
 */

const ENVELOPE = {
  success: true,
  data: { lender: 'AAVE_V3', estimatedShares: '999' },
  actions: {
    transactions: [{ to: '0xpool', data: '0xdeposit', value: '0' }],
    permissions: [{ to: '0xusdc', data: '0xapprove', value: '0', description: 'Approve USDC' }],
    postTransactions: [{ to: '0xweth', data: '0xunwrap', value: '0' }],
    signatures: [],
  },
}

function mockFetch(body: unknown, ok = true) {
  return vi.fn(async () => ({
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers({ 'content-type': 'application/json' }),
  })) as unknown as typeof fetch
}

const params = {
  earnUid: 'AAVE_V3:1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  action: 'deposit' as const,
  operator: '0xabc',
  amount: '1000000',
}

afterEach(() => vi.restoreAllMocks())

describe('fetchEarnAction', () => {
  it('reads the calls from `actions`, not from `data`', async () => {
    vi.stubGlobal('fetch', mockFetch(ENVELOPE))
    const res = await fetchEarnAction(params)
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.result.transactions).toHaveLength(1)
    expect(res.result.transactions[0].data).toBe('0xdeposit')
    expect(res.result.permissions[0].description).toBe('Approve USDC')
    // Runs AFTER the action — dropping it silently would leave the user's
    // WETH wrapped after a close that promised native ETH.
    expect(res.result.postTransactions[0].data).toBe('0xunwrap')
  })

  it('fails when the builder returns no call at all', async () => {
    // A 200 with an empty `actions` is a builder that declined without saying
    // so. Reporting success would leave the user pressing a dead button.
    vi.stubGlobal('fetch', mockFetch({ success: true, data: {}, actions: null }))
    const res = await fetchEarnAction(params)
    expect(res.success).toBe(false)
  })

  it('surfaces the server error rather than swallowing it', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({ success: false, error: { code: 'INVALID_PARAM', message: 'Bad uid' } }, false)
    )
    const res = await fetchEarnAction(params)
    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.error).toMatch(/Bad uid|INVALID_PARAM/)
  })

  it('sends the verb in the PATH and the uid as a param', async () => {
    const spy = mockFetch(ENVELOPE)
    vi.stubGlobal('fetch', spy)
    await fetchEarnAction({ ...params, action: 'request-withdraw' })
    const url = String((spy as any).mock.calls[0][0])
    expect(url).toContain('/v1/actions/earn/request-withdraw')
    expect(url).toContain('earnUid=')
  })

  it('pairs each route with its numbers BY AGGREGATOR, not by index', async () => {
    // `data.quotes` keeps a quote that produced no calldata; `alternatives`
    // cannot. Pairing by index would hand Enso's transaction OpenOcean's
    // output here — both halves plausible, the mismatch invisible.
    vi.stubGlobal(
      'fetch',
      mockFetch({
        success: true,
        data: {
          quotes: [
            { aggregator: 'Pendle', tradeInput: 259, tradeOutput: 279.6 },
            { aggregator: 'Unbuildable', tradeInput: 259, tradeOutput: 281 },
            { aggregator: 'Enso', tradeInput: 259, tradeOutput: 277.9 },
          ],
        },
        actions: {
          transactions: [{ to: '0xc', data: '0xpendle', value: '0' }],
          alternatives: [
            { to: '0xc', data: '0xpendle', value: '0', aggregator: 'Pendle' },
            { to: '0xc', data: '0xenso', value: '0', aggregator: 'Enso' },
          ],
          permissions: [],
        },
      })
    )
    const res = await fetchEarnAction(params)
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.result.routes.map((r) => [r.aggregator, r.tradeOutput])).toEqual([
      ['Pendle', 279.6],
      ['Enso', 277.9],
    ])
    expect(res.result.routes[1].tx.data).toBe('0xenso')
  })

  it('reads the zap quote shape, where the numbers sit under `deltas`', async () => {
    // A composed pay-asset zap reports its aggregator and amounts inside
    // `deltas`; only the trade paths put them at the top level. Reading one
    // shape left every zap route named but priceless.
    vi.stubGlobal(
      'fetch',
      mockFetch({
        success: true,
        data: {
          quotes: [
            { deltas: { aggregator: 'Fly', tradeInput: 100, tradeOutput: 99.96 } },
            { deltas: { aggregator: 'Enso', tradeInput: 100, tradeOutput: 99.94 } },
          ],
        },
        actions: {
          transactions: [{ to: '0xc', data: '0xfly', value: '0' }],
          alternatives: [
            { to: '0xc', data: '0xfly', value: '0', aggregator: 'Fly' },
            { to: '0xc', data: '0xenso', value: '0', aggregator: 'Enso' },
          ],
          permissions: [],
        },
      })
    )
    const res = await fetchEarnAction(params)
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.result.routes.map((r) => [r.aggregator, r.tradeOutput])).toEqual([
      ['Fly', 99.96],
      ['Enso', 99.94],
    ])
  })

  it('offers no choice when the server built a single route', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        success: true,
        data: { quotes: [{ aggregator: 'Enso', tradeOutput: 277.9 }] },
        actions: {
          transactions: [{ to: '0xc', data: '0xenso', value: '0' }],
          alternatives: [{ to: '0xc', data: '0xenso', value: '0', aggregator: 'Enso' }],
          permissions: [],
        },
      })
    )
    const res = await fetchEarnAction(params)
    expect(res.success).toBe(true)
    if (!res.success) return
    // One route is not a choice — rendering it as one implies the others were
    // rejected rather than never quoted.
    expect(res.result.routes).toEqual([])
    expect(res.result.transactions[0].data).toBe('0xenso')
  })

  it('leaves a plain deposit with no routes at all', async () => {
    vi.stubGlobal('fetch', mockFetch(ENVELOPE))
    const res = await fetchEarnAction(params)
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.result.routes).toEqual([])
  })

  it('forwards venue-specific extras verbatim', async () => {
    // The dispatcher passes unknown params straight through, so a venue can
    // take a new input without a release here — but only if this does too.
    const spy = mockFetch(ENVELOPE)
    vi.stubGlobal('fetch', spy)
    await fetchEarnAction({
      ...params,
      extra: { debt: '999', minShares: '5' },
    })
    const url = String((spy as any).mock.calls[0][0])
    expect(url).toContain('debt=999')
    expect(url).toContain('minShares=5')
  })
})
