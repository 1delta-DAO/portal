import { BalanceData, PoolData, UserConfig } from '@1delta/margin-fetcher'
import { resolveConfigEntry } from './configs'

export function applyDepositDelta(
  balanceData: BalanceData,
  pool: PoolData,
  amountUsd: number,
  userConfig: UserConfig
): BalanceData {
  if (amountUsd <= 0) return balanceData

  const ltv = resolveConfigEntry(pool, userConfig)

  // If collateral is disabled for this config, we still increase deposits/nav,
  // but don't count it as collateral.
  const collateralFactor = ltv.collateralDisabled ? 0 : ltv.collateralFactor
  const borrowColFactor = ltv.collateralDisabled ? 0 : ltv.borrowCollateralFactor

  return {
    ...balanceData,
    borrowDiscountedCollateral:
      balanceData.borrowDiscountedCollateral + borrowColFactor * amountUsd,
    collateral: balanceData.collateral + collateralFactor * amountUsd,
    deposits: balanceData.deposits + amountUsd,
    nav: balanceData.nav + amountUsd,
  }
}
