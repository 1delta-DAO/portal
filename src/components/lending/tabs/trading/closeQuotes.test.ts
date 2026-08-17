import { describe, expect, it } from 'vitest'
import { normalizeQuotes } from './useTradingQuotes'

/**
 * A CLOSE pays out, and the card was reading it as a loss.
 *
 * The API reports the POSITION (collateral removed, debt retired) and puts what
 * comes back to the wallet in `close`. The swap is a bigger trade than the debt
 * leg on any over-collateralised position, so pricing the swap output off the
 * debt leg understates it by the whole residual — which is what produced
 * "0.0331 USDC / $0.02" and a −27.5 % impact on a close that was simply
 * returning money.
 *
 * Live figures from the Arbitrum wstETH/USDC position that surfaced it:
 * collateral 14061785812014 (≈ $0.033049), debt 23808 (≈ $0.023806), sale
 * 33011 USDC, of which 9203 goes back to the wallet plus a 2812357163 wstETH
 * swap-sizing skim.
 */

const COLL = 14061785812014
const COLL_USD = -0.033049
const DEBT = 23808
const DEBT_USD = -0.023806
const LOAN_BACK = 9203
const COLL_BACK = 2812357163

const apiQuote = () => ({
  deltas: {
    aggregator: 'Nordstern',
    // The SWAP legs: the whole balance minus the skim, sold for the full sale.
    tradeInput: (COLL - COLL_BACK) / 1e18,
    tradeOutput: (DEBT + LOAN_BACK) / 1e6,
    deltas: [
      {
        position: 'collateral',
        amount: String(-COLL),
        amountUSD: COLL_USD,
        asset: { address: '0x5979', symbol: 'wstETH', decimals: 18 },
      },
      {
        position: 'debt',
        amount: String(-DEBT),
        amountUSD: DEBT_USD,
        asset: { address: '0xaf88', symbol: 'USDC', decimals: 6 },
      },
    ],
  },
  close: {
    debtRepaid: String(DEBT),
    residualToWallet: String(LOAN_BACK),
    collateralResidualToWallet: String(COLL_BACK),
  },
})

const close = () => normalizeQuotes('Close', [apiQuote()], [])[0]

describe('Close quote normalization', () => {
  /**
   * The headline symptom. Reading the debt leg as the swap output priced a
   * 0.033 USDC sale at $0.0238 and called the difference impact.
   */
  it('prices the swap output as the whole sale, not just the debt', () => {
    const q = close()
    // (23808 + 9203) units at the debt leg's own per-unit price.
    const perUnit = Math.abs(DEBT_USD) / DEBT
    expect(q.tradeAmountOutUSD).toBeCloseTo(perUnit * (DEBT + LOAN_BACK), 6)
    // …and it now agrees with the token amount shown beside it.
    expect(q.tradeAmountOutUSD! / q.tradeAmountOut).toBeCloseTo(perUnit * 1e6, 3)
  })

  /** The swap sold everything except the skim, so the input is priced on that. */
  it('prices the swap input as the collateral actually sold', () => {
    const q = close()
    const perUnit = Math.abs(COLL_USD) / COLL
    expect(q.tradeAmountInUSD).toBeCloseTo(perUnit * (COLL - COLL_BACK), 8)
  })

  /**
   * With both legs on the same footing the impact is a genuine swap impact —
   * cents, not tens of percent.
   */
  it('reports an impact in the range of a real swap cost', () => {
    const q = close()
    expect(Math.abs(q.priceImpactPct!)).toBeLessThan(0.15)
  })

  it('breaks out what the user receives', () => {
    const q = close()
    const loanUnit = Math.abs(DEBT_USD) / DEBT
    const collUnit = Math.abs(COLL_USD) / COLL
    expect(q.closeSplit).toBeDefined()
    expect(q.closeSplit!.debtRepaidUSD).toBeCloseTo(loanUnit * DEBT, 8)
    expect(q.closeSplit!.loanReturnedUSD).toBeCloseTo(loanUnit * LOAN_BACK, 8)
    expect(q.closeSplit!.collateralReturnedUSD).toBeCloseTo(
      collUnit * COLL_BACK,
      8,
    )
    expect(q.closeSplit!.returnedTotalUSD).toBeCloseTo(
      q.closeSplit!.loanReturnedUSD + q.closeSplit!.collateralReturnedUSD,
      8,
    )
    expect(q.closeSplit!.returnedTotalUSD).toBeGreaterThan(0)
  })

  /**
   * An older API, or a lender the correction cannot be applied to, sends no
   * `close`. The card must fall back to the previous behaviour rather than
   * render undefined figures.
   */
  it('falls back cleanly when the API sends no split', () => {
    const raw: any = apiQuote()
    delete raw.close
    const q = normalizeQuotes('Close', [raw], [])[0]
    expect(q.closeSplit).toBeUndefined()
    expect(q.tradeAmountOutUSD).toBeCloseTo(Math.abs(DEBT_USD), 8)
  })

  /** The correction is Close-only: a Loop has no residual to account for. */
  it('does not touch a Loop quote', () => {
    const q = normalizeQuotes('Loop', [apiQuote()], [])[0]
    expect(q.closeSplit).toBeUndefined()
  })
})
