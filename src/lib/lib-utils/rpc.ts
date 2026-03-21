import { LIST_OVERRIDES } from '@1delta/providers'

export function getRpcUrlByIndex(chainId: string, index: number): string {
  const urls = LIST_OVERRIDES[chainId]
  if (!urls || urls.length === 0) {
    throw new Error(`No RPC URLs for chain ${chainId}`)
  }
  return urls[index % urls.length]
}
