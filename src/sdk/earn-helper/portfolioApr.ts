import type { EarnPosition } from './positionTypes'

/**
 * The portfolio's blended net APR, across the lending AND vault halves.
 *
 * `EarnPositionBase.apr` is already the rate on the position AS HELD — net of
 * borrow cost, so a 2x loop on a 4 % market reads ~8 % — and `netUsd` is
 * already `supplied − borrowed`. Weighting the one by the other therefore
 * gives a RETURN ON EQUITY: what the money the user actually has at risk is
 * earning, which is the number that belongs beside "Net value".
 *
 * Two rules keep it honest, and both matter more than the arithmetic:
 *
 *  1. **A position with no `apr` is EXCLUDED from both sides of the ratio**,
 *     never counted as 0 %. The field's own contract is "absent ⇒ not
 *     computable, which is not zero"; averaging a missing rate in as zero
 *     would drag the headline down by an amount that looks like a real yield
 *     decision. What is excluded is reported instead, so the caller can say
 *     the figure covers part of the book.
 *  2. **Non-positive `netUsd` is excluded too.** A position whose borrowings
 *     match or exceed its supply has no equity to earn a return ON, and
 *     dividing by it produces either an explosion or a sign flip.
 *
 * The consequence worth understanding before reading the number: because the
 * denominator is EQUITY, a levered position legitimately shows a large APR.
 * $1.5K supplied against $1.2K borrowed is $300 of equity, so a modest spread
 * on the gross reads as a big percentage on the net. That is what leverage
 * does; it is not a bug, and it is why `coveredUsd` is returned alongside.
 */
export interface PortfolioAprResult {
  /** Blended APR in PERCENT, or `undefined` when nothing was computable. */
  apr?: number
  /** Net USD the figure actually covers. */
  coveredUsd: number
  /** Net USD across every position, computable or not. */
  totalUsd: number
  /** Positions left out because they carried no `apr`. */
  excludedCount: number
}

export function portfolioNetApr(items: EarnPosition[]): PortfolioAprResult {
  let weighted = 0
  let coveredUsd = 0
  let totalUsd = 0
  let excludedCount = 0

  for (const p of items) {
    const net = Number(p.netUsd)
    if (Number.isFinite(net) && net > 0) totalUsd += net
    if (!Number.isFinite(net) || net <= 0) continue
    const apr = p.apr
    if (apr == null || !Number.isFinite(apr)) {
      excludedCount++
      continue
    }
    weighted += net * apr
    coveredUsd += net
  }

  return {
    apr: coveredUsd > 0 ? weighted / coveredUsd : undefined,
    coveredUsd,
    totalUsd,
    excludedCount,
  }
}
