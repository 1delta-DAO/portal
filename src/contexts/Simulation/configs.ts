import { UserConfig, ConfigEntry } from '@1delta/margin-fetcher'
import { PoolDataItem } from '../../hooks/lending/usePoolData'

export function resolveConfigEntry(pool: PoolDataItem, userConfig: UserConfig): ConfigEntry {
  const cfg = pool.config || {}

  // user-selected category takes precedence
  const catFromUser = userConfig.selectedMode ?? undefined
  if (catFromUser != null && cfg[catFromUser]) {
    return cfg[catFromUser]
  }

  // fallback: category 0 if present (default/disabled mode)
  if (cfg[0]) return cfg[0]

  // final fallback: first config entry or zeros
  const firstKey = Object.keys(cfg)[0]
  if (firstKey != null) {
    return cfg[Number(firstKey)]
  }

  // completely defensive: zero factors
  return {
    category: 0,
    borrowCollateralFactor: 0,
    collateralFactor: 0,
    borrowFactor: 0,
    collateralDisabled: false,
    debtDisabled: false,
  }
}
