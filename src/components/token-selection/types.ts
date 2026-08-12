import type { RawCurrency } from '../../types/currency'

export interface TokenRowData {
  addr: string
  token: RawCurrency
  usdValue: number
  price: number
  balanceAmount: number
  category: number
  isRelevant: boolean
  /** Search relevance tier — see `tokenSearch.ts`. 0 when not searching. */
  matchScore: number
  /** On the chain's curated list, or imported by the user. */
  isMainOrUser: boolean
}
