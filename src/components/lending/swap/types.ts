import { RawCurrency } from '@1delta/lib-utils'

export interface SwapQuoteResponse {
  lender: string
  quotes: SwapQuote[]
  permissionTxns: Tx[]
}

export interface Tx {
  to: string
  data: string
  value: string
}

export interface SwapQuote {
  deltas: {
    aggregator: string
    tradeInput: number
    tradeOutput: number
    deltas: {
      amount: string
      amountUSD: number
      asset: RawCurrency
      lender: string
      position: string
    }
  }
  tx: Tx
}
