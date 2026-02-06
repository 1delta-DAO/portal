import { BalanceData, UserConfig } from '@1delta/margin-fetcher'
import { PoolDataItem } from '../../hooks/lending/usePoolData'
import { resolveConfigEntry } from './configs'

export function applyBorrowDelta(
  balanceData: BalanceData,
  pool: PoolDataItem,
  amountUsd: number,
  userConfig: UserConfig
): BalanceData {
  if (amountUsd <= 0) return balanceData

  const ltv = resolveConfigEntry(pool, userConfig)

  const borrowFactor = ltv.debtDisabled ? 0 : ltv.borrowFactor

  return {
    ...balanceData,
    debt: balanceData.debt + amountUsd,
    adjustedDebt: balanceData.adjustedDebt + borrowFactor * amountUsd,
    nav: balanceData.nav - amountUsd,
  }
}
