import type { RawCurrency } from '@1delta/lib-utils'

export interface TokenRowData {
  addr: string
  token: RawCurrency
  usdValue: number
  price: number
  balanceAmount: number
  category: number
  isRelevant: boolean
}
