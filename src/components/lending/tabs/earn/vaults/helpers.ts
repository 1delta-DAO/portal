import { formatUnits } from 'viem'
import type { VaultEntry, VaultProvider } from '../../../../../sdk/vaults-helper'

export type VaultSortKey =
  | 'name'
  | 'provider'
  | 'supplyRate'
  | 'totalAssetsUsd'
  | 'totalAssets'
  | 'liquidityUsd'

export const PROVIDER_LABELS: Record<VaultProvider, string> = {
  fluid: 'Fluid',
  gearbox: 'Gearbox',
  morpho: 'Morpho',
  lista: 'Lista',
  silo: 'Silo',
  'euler-earn': 'Euler Earn',
  lst: 'Liquid Staking',
  savings: 'Savings',
  lagoon: 'Lagoon',
  upshift: 'Upshift',
  hypercore: 'HyperCore',
  gmx: 'GMX',
}

export const PROVIDER_LOGOS: Partial<Record<VaultProvider, string>> = {
  // Reuse the lender registry logos that the rest of the app already serves.
  // Empty entries fall back to `Logo`'s initials swatch.
  fluid: 'https://raw.githubusercontent.com/1delta-DAO/asset-list-config/main/lender-info/fluid/logo.svg',
  morpho: 'https://raw.githubusercontent.com/1delta-DAO/asset-list-config/main/lender-info/morpho-blue/logo.svg',
  silo: 'https://raw.githubusercontent.com/1delta-DAO/asset-list-config/main/lender-info/silo/logo.svg',
  gearbox: 'https://raw.githubusercontent.com/1delta-DAO/asset-list-config/main/lender-info/gearbox-v3/logo.svg',
}

/** APR helper — Euler Earn always returns 0 from /v1/data/vaults today. */
export function isSupplyRateMeaningful(entry: VaultEntry): boolean {
  if (entry.provider === 'euler-earn') return false
  // Meaningful when the backend exposed any positive rate — base or all-in.
  return (entry.baseRate ?? 0) > 0 || (entry.supplyRate ?? 0) > 0
}

/**
 * Base lending yield — the underlying-denominated "real yield" before
 * incentives (the backend's `depositRate`). This is the headline APR: token
 * incentives can inflate `totalRate` to wildly misleading values (e.g. a vault
 * earning ~9% really can report a 132% "total"), so we never lead with it.
 * Falls back to the all-in `supplyRate` for providers that don't split it out.
 */
export function baseApr(entry: VaultEntry): number {
  return typeof entry.baseRate === 'number' ? entry.baseRate : entry.supplyRate ?? 0
}

/** All-in APR (base lending yield + incentives) — the backend's `totalRate`. */
export function totalApr(entry: VaultEntry): number {
  if (typeof entry.supplyRate === 'number') return entry.supplyRate
  return baseApr(entry) + rewardsApr(entry)
}

/** Incentive/rewards APR layered on top of {@link baseApr}. */
export function rewardsApr(entry: VaultEntry): number {
  if (typeof entry.rewardsRate === 'number') return entry.rewardsRate
  // Derive from the gap when a provider gives a total but no explicit split.
  const gap = (entry.supplyRate ?? 0) - baseApr(entry)
  return gap > 0 ? gap : 0
}

/**
 * The headline APR string — the *real* (base) supply yield, excluding
 * incentives. Returns "—" when no rate is exposed.
 */
export function formatSupplyRate(entry: VaultEntry): string {
  if (!isSupplyRateMeaningful(entry)) return '—'
  return `${baseApr(entry).toFixed(2)}%`
}

/**
 * True when incentives add a non-trivial slice on top of the base yield, so the
 * UI should surface the rewards/total as a secondary, de-emphasized figure.
 */
export function hasRewardsApr(entry: VaultEntry): boolean {
  return isSupplyRateMeaningful(entry) && rewardsApr(entry) > 0.01
}

/**
 * True when the vault has any positive TVL signal — filters out
 * freshly-deployed empties. Checks raw `totalSupply` first, then the
 * backend-formatted / USD figures so providers that only populate those
 * (e.g. GMX, which leaves raw `totalSupply`/`totalAssets` null) aren't dropped.
 */
export function hasTvl(entry: VaultEntry): boolean {
  if ((entry.totalAssetsFormatted ?? 0) > 0) return true
  if ((entry.totalAssetsUsd ?? 0) > 0) return true
  try {
    return BigInt(entry.totalSupply) > 0n
  } catch {
    return parseFloat(entry.totalSupply) > 0
  }
}

/**
 * Decode the catalog's raw `totalAssets` (underlying units, BigInt-able) into
 * a human-readable number. Falls back gracefully when the value isn't a clean
 * integer string (some providers occasionally emit a decimal already-formatted
 * number — `parseFloat` covers that case).
 */
export function humanAssets(rawAssets: string, decimals: number): number {
  if (!rawAssets) return 0
  try {
    return Number(formatUnits(BigInt(rawAssets), decimals))
  } catch {
    const n = parseFloat(rawAssets)
    return Number.isFinite(n) ? n : 0
  }
}

/**
 * TVL in native underlying units. Prefers the backend-formatted figure (the
 * only one some providers like GMX populate), then decodes the raw integer
 * `totalAssets` against the underlying decimals.
 */
export function tvlNative(entry: VaultEntry, underlyingDecimals: number): number {
  if (typeof entry.totalAssetsFormatted === 'number' && entry.totalAssetsFormatted > 0) {
    return entry.totalAssetsFormatted
  }
  return humanAssets(entry.totalAssets, underlyingDecimals)
}

/**
 * USD TVL with a derived fallback for providers (notably Euler Earn) that
 * don't always populate `totalAssetsUsd`. When both an underlying price and
 * assets are present we can reconstruct it locally — otherwise return 0
 * and let the caller decide how to render "unknown".
 */
export function tvlUsd(entry: VaultEntry, underlyingDecimals: number): number {
  if (typeof entry.totalAssetsUsd === 'number' && entry.totalAssetsUsd > 0) {
    return entry.totalAssetsUsd
  }
  const price = entry.underlyingPriceUsd ?? 0
  if (price <= 0) return 0
  return tvlNative(entry, underlyingDecimals) * price
}

/**
 * Human-readable withdrawable liquidity. Prefers the backend-provided
 * `liquidityFormatted` (already decimals-adjusted), falls back to decoding
 * raw `liquidity` against underlying decimals. Returns 0 when the field
 * isn't exposed by this provider.
 */
export function liquidityNative(entry: VaultEntry, underlyingDecimals: number): number {
  if (typeof entry.liquidityFormatted === 'number') return entry.liquidityFormatted
  if (entry.liquidity) return humanAssets(entry.liquidity, underlyingDecimals)
  return 0
}

/** USD value of liquidity, with the same derived fallback as {@link tvlUsd}. */
export function liquidityUsd(entry: VaultEntry, underlyingDecimals: number): number {
  if (typeof entry.liquidityUsd === 'number' && entry.liquidityUsd > 0) {
    return entry.liquidityUsd
  }
  const price = entry.underlyingPriceUsd ?? 0
  if (price <= 0) return 0
  return liquidityNative(entry, underlyingDecimals) * price
}

/** True when the backend exposed a liquidity figure for this entry. */
export function hasLiquidity(entry: VaultEntry): boolean {
  return (
    typeof entry.liquidityFormatted === 'number' ||
    typeof entry.liquidity === 'string' ||
    typeof entry.liquidityUsd === 'number'
  )
}

export function compareVaults(a: VaultEntry, b: VaultEntry, key: VaultSortKey): number {
  switch (key) {
    case 'name':
      return (a.name ?? '').localeCompare(b.name ?? '')
    case 'provider':
      return a.provider.localeCompare(b.provider)
    case 'supplyRate':
      // Rank by the real (base) yield, not the incentive-inflated total.
      return baseApr(a) - baseApr(b)
    case 'totalAssetsUsd':
      return (a.totalAssetsUsd ?? 0) - (b.totalAssetsUsd ?? 0)
    case 'totalAssets': {
      // Compare in human units so vaults across different decimals (USDC 6 vs.
      // WETH 18) don't sort as if the smaller-decimal vault is microscopic.
      const an = tvlNative(a, a.decimals)
      const bn = tvlNative(b, b.decimals)
      return an - bn
    }
    case 'liquidityUsd':
      return liquidityUsd(a, a.decimals) - liquidityUsd(b, b.decimals)
  }
}
