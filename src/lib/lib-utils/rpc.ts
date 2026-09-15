import { LIST_OVERRIDES } from '@1delta/providers'

// Local RPC fallbacks for chains not yet present in the installed
// `@1delta/providers` LIST_OVERRIDES. Drop an entry here once the package ships
// the chain (Robinhood Chain / 4663 lands in a newer providers release).
const LOCAL_RPC_OVERRIDES: Record<string, string[]> = {
  // Robinhood Chain
  '4663': ['https://rpc.mainnet.chain.robinhood.com'],
  // Ink — absent from LIST_OVERRIDES through providers 0.0.68, so the
  // x-chain balance scan reported it "unreachable" on every load. Added to
  // providers' rpcOverrides.ts 2026-09-14; drop this once that ships.
  '57073': [
    'https://rpc-gel.inkonchain.com',
    'https://ink.gateway.tenderly.co',
    'https://rpc-qnd.inkonchain.com',
    'https://ink.rpc.thirdweb.com',
  ],
}

export function getRpcUrlByIndex(chainId: string, index: number): string {
  const urls = LIST_OVERRIDES[chainId] ?? LOCAL_RPC_OVERRIDES[chainId]
  if (!urls || urls.length === 0) {
    throw new Error(`No RPC URLs for chain ${chainId}`)
  }
  return urls[index % urls.length]
}
