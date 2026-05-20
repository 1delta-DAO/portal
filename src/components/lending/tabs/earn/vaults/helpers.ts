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
  silo: 'Silo',
  'euler-earn': 'Euler Earn',
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
  return typeof entry.supplyRate === 'number' && entry.supplyRate > 0
}

export function formatSupplyRate(entry: VaultEntry): string {
  if (!isSupplyRateMeaningful(entry)) return '—'
  return `${(entry.supplyRate ?? 0).toFixed(2)}%`
}

/** True when `BigInt(totalSupply) > 0n` — filters out freshly-deployed empties. */
export function hasTvl(entry: VaultEntry): boolean {
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
 * USD TVL with a derived fallback for providers (notably Euler Earn) that
 * don't always populate `totalAssetsUsd`. When both an underlying price and
 * raw assets are present we can reconstruct it locally — otherwise return 0
 * and let the caller decide how to render "unknown".
 */
export function tvlUsd(entry: VaultEntry, underlyingDecimals: number): number {
  if (typeof entry.totalAssetsUsd === 'number' && entry.totalAssetsUsd > 0) {
    return entry.totalAssetsUsd
  }
  const price = entry.underlyingPriceUsd ?? 0
  if (price <= 0) return 0
  return humanAssets(entry.totalAssets, underlyingDecimals) * price
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
      return (a.supplyRate ?? 0) - (b.supplyRate ?? 0)
    case 'totalAssetsUsd':
      return (a.totalAssetsUsd ?? 0) - (b.totalAssetsUsd ?? 0)
    case 'totalAssets': {
      // Compare in human units so vaults across different decimals (USDC 6 vs.
      // WETH 18) don't sort as if the smaller-decimal vault is microscopic.
      const an = humanAssets(a.totalAssets, a.decimals)
      const bn = humanAssets(b.totalAssets, b.decimals)
      return an - bn
    }
    case 'liquidityUsd':
      return liquidityUsd(a, a.decimals) - liquidityUsd(b, b.decimals)
  }
}
