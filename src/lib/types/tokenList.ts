import type { RawCurrency } from '../lib-utils'

/**
 * Token list entry structure matching frontend pattern
 */
export interface VersionedDeltaTokenList {
  name: string
  version: {
    major: number
    minor: number
    patch: number
  }
  timestamp: string
  tags: Record<string, { name: string; description: string }>
  logoURI: string
  keywords: string[]
  list: Record<string, RawCurrency>
}
