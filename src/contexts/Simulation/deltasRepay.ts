import { BalanceData, PoolData, UserConfig } from '@1delta/margin-fetcher'
import { resolveConfigEntry } from './configs'

export const positivePart = (n: number) => (n < 0 ? 0 : n)

export function applyRepayDelta(
  balanceData: BalanceData,
  pool: PoolData,
  amountUsd: number,
  userConfig: UserConfig
): BalanceData {
  if (amountUsd <= 0) return balanceData

  const ltv = resolveConfigEntry(pool, userConfig)

  const borrowFactor = ltv.debtDisabled ? 0 : ltv.borrowFactor

  return {
    ...balanceData,
    debt: balanceData.debt - amountUsd,
    adjustedDebt: positivePart(balanceData.adjustedDebt - borrowFactor * amountUsd),
    nav: balanceData.nav + amountUsd,
  }
}
