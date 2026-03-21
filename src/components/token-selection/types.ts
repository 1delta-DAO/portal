import type { RawCurrency } from '../../types/currency'

export interface TokenRowData {
  addr: string
  token: RawCurrency
  usdValue: number
  price: number
  balanceAmount: number
  category: number
  isRelevant: boolean
}
