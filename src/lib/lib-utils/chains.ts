import { evmChainWagmi } from '../../wagmi'

const chainNameMap = new Map<string, string>()

for (const chain of evmChainWagmi) {
  chainNameMap.set(String(chain.id), chain.name)
}
// Non-EVM: not a wagmi chain, but a valid cross-chain DESTINATION.
chainNameMap.set('solana', 'Solana')

export function getChainName(chainId?: string): string {
  if (!chainId) return ''
  return chainNameMap.get(chainId) ?? `Chain ${chainId}`
}

export function getChainShortName(chainId?: string): string {
  return getChainName(chainId)
}
