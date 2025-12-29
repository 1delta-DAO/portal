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
  position: {
    aggregator: string
    tradeAmountIn: string
    tradeAmountOut: string
    tradeAmountInUSD: number
    tradeAmountOutUSD: number
  }
  tx: Tx
}

