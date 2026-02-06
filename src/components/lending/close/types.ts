export interface CloseQuoteResponse {
  lender: string
  quotes: CloseQuote[]
  permissionTxns: Tx[]
}

export interface Tx {
  to: string
  data: string
  value: string
  info?: string
}

export interface CloseQuote {
  position: {
    aggregator: string
    tradeAmountIn: string
    tradeAmountOut: string
    tradeAmountInUSD: number
    tradeAmountOutUSD: number
  }
  tx: Tx
}
