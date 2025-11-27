import { PoolData, UserConfig, ConfigEntry } from '@1delta/margin-fetcher'

export function resolveConfigEntry(pool: PoolData, userConfig: UserConfig): ConfigEntry {
  const cfg = pool.config || {}

  // user-selected category takes precedence
  const catFromUser = userConfig.selectedMode ?? undefined
  if (catFromUser != null && cfg[catFromUser]) {
    return cfg[catFromUser]
  }

  // otherwise, try the pool's eMode category
  const catFromEmode = pool.eMode?.category
  if (catFromEmode != null && cfg[catFromEmode]) {
    return cfg[catFromEmode]
  }

  // fallback: category 0 if present
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
