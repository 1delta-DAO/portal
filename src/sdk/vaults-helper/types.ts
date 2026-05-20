/**
 * Shared types for the /v1/data/vaults and /v1/actions/vaults endpoints.
 *
 * The five providers wired today (fluid, gearbox, morpho, silo, euler-earn)
 * all expose the same load-bearing fields by contract. Provider-specific
 * extras (curators, fee, supplyRate, etc.) are typed loosely so the UI can
 * pick them up without each new field being a compile error.
 */

export type VaultProvider = 'fluid' | 'gearbox' | 'morpho' | 'silo' | 'euler-earn'

export const VAULT_PROVIDERS: VaultProvider[] = [
  'fluid',
  'gearbox',
  'morpho',
  'silo',
  'euler-earn',
]

/**
 * Minimal subset of vault fields the UI relies on. Every provider's value
 * objects under `data[provider]` are guaranteed by the backend to contain
 * these fields. Provider-specific extras live in `extras`.
 */
export interface VaultEntry {
  provider: VaultProvider
  /** Vault contract address (the share token). */
  address: string
  /** Underlying ERC-20 the vault accepts. */
  underlying: string
  symbol: string
  name: string
  decimals: number
  /** Underlying-denominated TVL (raw, in underlying units). */
  totalAssets: string
  /** Share-token total supply (raw, in vault share units). */
  totalSupply: string
  /** USD TVL when the backend has a price for the underlying. */
  totalAssetsUsd?: number
  /**
   * Withdrawable liquidity in raw underlying units, when the backend exposes
   * it (Silo / Morpho today). Equivalent to "instantly-redeemable cash."
   */
  liquidity?: string
  /** `liquidity` already divided by underlying decimals (backend-provided). */
  liquidityFormatted?: number
  /** USD value of `liquidity`, when the backend has a price. */
  liquidityUsd?: number
  /** Underlying USD price (when known). */
  underlyingPriceUsd?: number
  /**
   * Supply APR as a *percent* (e.g. 5.2 means 5.2%). Fluid/Gearbox/Silo
   * populate this; Morpho usually fills it in via its own API; Euler-Earn
   * currently always returns 0. UI should treat 0 as "unknown" for euler-earn.
   */
  supplyRate?: number
  /** Vault management fee, percent. */
  fee?: number
  /** Curator label (provider-specific shape — see `extras` for raw). */
  curator?: string
  /** Untyped passthrough of the provider's full row. */
  extras: Record<string, unknown>
}

/** Raw provider-keyed catalog from `/v1/data/vaults`. */
export interface VaultsCatalogResponse {
  fluid?: Record<string, RawVault>
  gearbox?: Record<string, RawVault>
  morpho?: Record<string, RawVault>
  silo?: Record<string, RawVault>
  'euler-earn'?: Record<string, RawVault>
}

/**
 * Loose shape for one provider's vault row. The fields listed are the ones
 * the guide guarantees; anything else flows through into `VaultEntry.extras`.
 */
export interface RawVault {
  address?: string
  underlying?: string
  symbol?: string
  name?: string
  decimals?: number
  totalAssets?: string | number
  totalSupply?: string | number
  totalAssetsUsd?: number
  liquidity?: string | number
  liquidityFormatted?: number
  liquidityUsd?: number
  underlyingPriceUsd?: number
  supplyRate?: number | string
  fee?: number | string
  // Morpho / Silo / Gearbox-specific surface area used in filters
  curators?: Array<{ name?: string } | string> | null
  curatorName?: string
  protocolVersion?: string
  // Catch-all
  [key: string]: unknown
}

/** A single user position row from `/v1/data/vaults/user`. */
export interface UserVaultItem {
  vault: string
  underlying: string
  symbol: string
  name: string
  decimals: number
  sharesRaw: string
  shares: string
  assetsRaw: string
  assets: string
  priceUSD: number
  balanceUSD: number
  /** Provider key when the worker tags it; not always populated. */
  provider?: VaultProvider
}

export interface UserVaultsResponse {
  items: UserVaultItem[]
}
