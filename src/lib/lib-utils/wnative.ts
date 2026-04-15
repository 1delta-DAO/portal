import type { RawCurrency } from './types'

export function isWNative(c?: RawCurrency): boolean {
  return !!c?.props?.wnative
}
