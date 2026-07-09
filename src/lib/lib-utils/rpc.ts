import { LIST_OVERRIDES } from '@1delta/providers'

// Local RPC fallbacks for chains not yet present in the installed
// `@1delta/providers` LIST_OVERRIDES. Drop an entry here once the package ships
// the chain (Robinhood Chain / 4663 lands in a newer providers release).
const LOCAL_RPC_OVERRIDES: Record<string, string[]> = {
  // Robinhood Chain
  '4663': ['https://rpc.mainnet.chain.robinhood.com'],
}

export function getRpcUrlByIndex(chainId: string, index: number): string {
  const urls = LIST_OVERRIDES[chainId] ?? LOCAL_RPC_OVERRIDES[chainId]
  if (!urls || urls.length === 0) {
    throw new Error(`No RPC URLs for chain ${chainId}`)
  }
  return urls[index % urls.length]
}
