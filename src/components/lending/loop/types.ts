import { RawCurrency } from '@1delta/lib-utils'

export interface LoopQuoteResponse {
  lender: string
  quotes: LoopQuote[]
  permissionTxns: Tx[]
}
export interface Tx {
  to: string
  data: string
  value: string
}

export interface LoopQuote {
  position: {
    aggregator: string
    collateralCurrency: RawCurrency
    debtCurreny: RawCurrency
    positionDebtUSD: number
    positionCollateralUSD: number
    positionDebt: number
    positionCollateral: number
    tradeAmountIn: string
    tradeAmountOut: string
    tradeAmountInUSD: number
    tradeAmountOutUSD: number
  }
  tx: Tx
}

