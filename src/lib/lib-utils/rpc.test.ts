import { describe, it, expect } from 'vitest'
import { getRpcUrlByIndex } from './rpc'
import { BALANCE_CHAINS } from '../../components/swap/XChainSwapPanel'

// Every chain the x-chain balance scan asks for must resolve at least one
// RPC URL, or `executeRpcCallsWithRetry` throws on every attempt and the
// chain is reported "unreachable" — which is how Ink (57073) read as down
// for weeks while its RPCs were fine (no LIST_OVERRIDES entry existed).
describe('getRpcUrlByIndex', () => {
  it.each(BALANCE_CHAINS)('has an RPC list for scanned chain %s', (chainId) => {
    expect(() => getRpcUrlByIndex(chainId, 0)).not.toThrow()
    expect(getRpcUrlByIndex(chainId, 0)).toMatch(/^https:\/\//)
  })
})
