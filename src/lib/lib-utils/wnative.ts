import { WRAPPED_NATIVE_INFO } from '@1delta/wnative'
import type { RawCurrency } from './types'

export function isWNative(c?: RawCurrency): boolean {
  if (!c) return false
  if (c.props?.wnative) return true
  const info = WRAPPED_NATIVE_INFO[c.chainId]
  return !!info && c.address.toLowerCase() === info.address.toLowerCase()
}

export function getWNativeAddress(chainId: string): string | undefined {
  return WRAPPED_NATIVE_INFO[chainId]?.address
}
