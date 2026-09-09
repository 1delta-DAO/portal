import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const apiFetch = vi.fn()
vi.mock('../../sdk/http', () => ({
  apiFetch: (path: string, options?: any) => apiFetch(path, options),
}))

const getTokenFromCache = vi.fn()
const registerResolvedToken = vi.fn((_chainId: string, t: any) => t)
vi.mock('./tokenListsCache', () => ({
  getTokenFromCache: (chainId: string, address: string) =>
    getTokenFromCache(chainId, address),
  registerResolvedToken: (chainId: string, token: any) =>
    registerResolvedToken(chainId, token),
}))

const UNLISTED = '0x00000000000000000000000000000000f0f0f001'

async function freshModule() {
  vi.resetModules()
  return import('./tokenMetadataCache')
}

const onchainResponse = (over: Record<string, unknown> = {}) => ({
  chainId: '1',
  count: 1,
  items: [
    {
      address: UNLISTED,
      symbol: 'FTT',
      name: 'Fork Test Token',
      decimals: 8,
      assetGroup: null,
      verified: false,
      source: 'onchain',
      ...over,
    },
  ],
  unresolved: [],
})

beforeEach(() => {
  apiFetch.mockReset()
  getTokenFromCache.mockReset()
  registerResolvedToken.mockClear()
  getTokenFromCache.mockReturnValue(undefined)
})

afterEach(() => vi.restoreAllMocks())

describe('isTokenAddress', () => {
  it('accepts an address in any casing, rejects anything else', async () => {
    const { isTokenAddress } = await freshModule()
    expect(isTokenAddress(UNLISTED)).toBe(true)
    expect(isTokenAddress(UNLISTED.toUpperCase().replace('0X', '0x'))).toBe(true)
    expect(isTokenAddress(`  ${UNLISTED}  `)).toBe(true)
    expect(isTokenAddress('usdc')).toBe(false)
    expect(isTokenAddress('0x1234')).toBe(false)
  })
})

describe('resolveToken', () => {
  it('resolves an unlisted token and gives it NO price key', async () => {
    apiFetch.mockResolvedValue(onchainResponse())
    const { resolveToken } = await freshModule()

    const token = await resolveToken('1', UNLISTED)

    expect(token).toMatchObject({
      address: UNLISTED,
      symbol: 'FTT',
      decimals: 8,
    })
    // The invariant the whole feature rests on: a contract-supplied symbol
    // must never carry a key the price layer would join on.
    expect(token?.assetGroup).toBeUndefined()
    expect(token?.props?.unlisted).toBe(true)
    expect(registerResolvedToken).toHaveBeenCalledOnce()
  })

  it('keeps the assetGroup when the backend answers from the curated list', async () => {
    apiFetch.mockResolvedValue(
      onchainResponse({
        assetGroup: 'USDC::USD Coin',
        verified: true,
        source: 'list',
      })
    )
    const { resolveToken } = await freshModule()

    const token = await resolveToken('1', UNLISTED)
    expect(token?.assetGroup).toBe('USDC::USD Coin')
    expect(token?.props?.unlisted).toBe(false)
  })

  it('answers from the curated cache without a request', async () => {
    getTokenFromCache.mockReturnValue({
      chainId: '1',
      address: UNLISTED,
      decimals: 6,
      symbol: 'USDC',
    })
    const { resolveToken } = await freshModule()

    const token = await resolveToken('1', UNLISTED)
    expect(token?.symbol).toBe('USDC')
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('caches a MISS so a not-a-token address is asked about once', async () => {
    apiFetch.mockResolvedValue({
      chainId: '1',
      count: 0,
      items: [],
      unresolved: [UNLISTED],
    })
    const { resolveToken } = await freshModule()

    expect(await resolveToken('1', UNLISTED)).toBeNull()
    expect(await resolveToken('1', UNLISTED)).toBeNull()
    expect(apiFetch).toHaveBeenCalledOnce()
  })

  it('does NOT cache a transport failure', async () => {
    apiFetch.mockRejectedValueOnce(new Error('offline'))
    apiFetch.mockResolvedValueOnce(onchainResponse())
    const { resolveToken } = await freshModule()

    // A network error is not an answer about the token — caching it would
    // make the address permanently dead for the rest of the session.
    expect(await resolveToken('1', UNLISTED)).toBeNull()
    expect((await resolveToken('1', UNLISTED))?.symbol).toBe('FTT')
    expect(apiFetch).toHaveBeenCalledTimes(2)
  })

  it('dedupes concurrent lookups of the same address', async () => {
    apiFetch.mockResolvedValue(onchainResponse())
    const { resolveToken } = await freshModule()

    const [a, b] = await Promise.all([resolveToken('1', UNLISTED), resolveToken('1', UNLISTED)])

    expect(a).toBe(b)
    expect(apiFetch).toHaveBeenCalledOnce()
  })

  it('keys the cache per chain — the same address is a different token', async () => {
    apiFetch.mockResolvedValue(onchainResponse())
    const { resolveToken } = await freshModule()

    await resolveToken('1', UNLISTED)
    await resolveToken('8453', UNLISTED)

    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(apiFetch.mock.calls[0][1].params.chainId).toBe('1')
    expect(apiFetch.mock.calls[1][1].params.chainId).toBe('8453')
  })

  it('never requests for a malformed query', async () => {
    const { resolveToken } = await freshModule()
    expect(await resolveToken('1', 'usdc')).toBeNull()
    expect(apiFetch).not.toHaveBeenCalled()
  })
})
