import { BACKEND_BASE_URL } from '../../config/backend'
import {
  VAULT_PROVIDERS,
  type RawVault,
  type VaultEntry,
  type VaultProvider,
  type VaultsCatalogResponse,
} from './types'

export interface FetchVaultsCatalogParams {
  chainId: string
  /** Defaults to every supported provider. */
  providers?: VaultProvider[]
}

export interface FetchVaultsCatalogResult {
  success: boolean
  /** Raw catalog page(s) exactly as the backend returns them. */
  raw?: VaultsCatalogResponse
  /** Flattened list normalized to the {@link VaultEntry} shape. */
  vaults?: VaultEntry[]
  error?: string
}

const ENDPOINT = `${BACKEND_BASE_URL}/v1/data/vaults`

/** Backend caps `count` at 1000; we page until a short page is returned. */
const PAGE_SIZE = 1000

export async function fetchVaultsCatalog(
  params: FetchVaultsCatalogParams
): Promise<FetchVaultsCatalogResult> {
  try {
    const providers = params.providers && params.providers.length > 0
      ? params.providers
      : VAULT_PROVIDERS

    const items: RawVault[] = []
    let start = 0

    // The endpoint paginates (default 100, max 1000). Walk the cursor so the
    // catalog never silently truncates when a chain has more vaults than a page.
    for (;;) {
      const qs = new URLSearchParams()
      qs.set('chainId', params.chainId)
      qs.set('providers', providers.join(','))
      qs.set('start', String(start))
      qs.set('count', String(PAGE_SIZE))

      const res = await fetch(`${ENDPOINT}?${qs}`)
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return {
          success: false,
          error: `HTTP ${res.status}: ${text || res.statusText}`,
        }
      }

      const json = await res.json()
      if (!json.success) {
        return {
          success: false,
          error: json.error?.message ?? 'Vaults catalog returned success: false',
        }
      }

      const page: VaultsCatalogResponse = json.data ?? {}
      const pageItems = Array.isArray(page.items) ? page.items : []
      items.push(...pageItems)

      if (pageItems.length < PAGE_SIZE) break
      start += PAGE_SIZE
    }

    const raw: VaultsCatalogResponse = { start: 0, count: items.length, items }
    const vaults = flattenCatalog(raw)
    return { success: true, raw, vaults }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' }
  }
}

/**
 * Normalize the flat `items[]` page into a `VaultEntry[]` so tables, filters
 * and search can treat every provider uniformly. The full raw row survives in
 * `extras` for provider-specific UI needs.
 */
function flattenCatalog(raw: VaultsCatalogResponse): VaultEntry[] {
  const out: VaultEntry[] = []
  for (const value of raw.items ?? []) {
    const entry = normalizeVault(value)
    if (entry) out.push(entry)
  }
  return out
}

function normalizeVault(v: RawVault): VaultEntry | null {
  const address = (v.vaultAddress ?? '').toString()
  const underlying = (v.underlying ?? '').toString()
  if (!address || !underlying) return null

  const provider = (v.provider ?? '').toString() as VaultProvider
  const rates = v.rates ?? {}
  const tvl = v.tvl ?? {}
  const liq = v.liquidity ?? {}
  const price = v.underlyingInfo?.prices ?? {}
  // Prefer the dedicated `vaultInfo` bundle (icon + name + classification),
  // falling back to the loose top-level fields for older backends.
  const info = v.vaultInfo ?? {}

  return {
    provider,
    address,
    underlying,
    symbol: (info.symbol ?? v.symbol ?? '').toString(),
    name: (info.name ?? v.displayName ?? v.name ?? v.symbol ?? '').toString(),
    decimals: typeof v.decimals === 'number' ? v.decimals : 18,
    totalAssets: tvl.totalAssets != null ? String(tvl.totalAssets) : '0',
    totalAssetsFormatted: toNumber(tvl.totalAssetsFormatted),
    totalSupply: tvl.totalSupply != null ? String(tvl.totalSupply) : '0',
    totalAssetsUsd: toNumber(tvl.totalAssetsUsd),
    liquidity: liq.liquidity != null ? String(liq.liquidity) : undefined,
    liquidityFormatted: toNumber(liq.liquidityFormatted),
    liquidityUsd: toNumber(liq.liquidityUsd),
    underlyingPriceUsd: toNumber(price.priceUsd),
    sharePrice: toNumber(v.sharePrice),
    sharePriceUsd: toNumber(v.sharePriceUsd),
    // `totalRate` is the depositor's all-in APR (deposit + rewards).
    supplyRate: toNumber(rates.totalRate),
    fee: toNumber(rates.fee),
    curator: deriveCurator(provider, v),
    // Resolved icon — vaultInfo first, then the underlying asset's logo.
    logoURI:
      info.logoURI ?? v.underlyingInfo?.asset?.logoURI ?? undefined,
    assetGroup: info.assetGroup ?? undefined,
    yieldProfile: info.yieldProfile ?? undefined,
    denomination: info.denomination ?? undefined,
    delegation: v.providerMeta?.delegation ?? undefined,
    extras: v,
  }
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function deriveCurator(provider: VaultProvider, v: RawVault): string | undefined {
  // The backend now exposes the curator name at the top level for every
  // provider; prefer it, then fall back to providerMeta / per-provider labels.
  if (v.curatorName) return v.curatorName

  const meta = v.providerMeta ?? {}
  switch (provider) {
    case 'morpho': {
      const first = meta.curators?.[0]
      if (first) return typeof first === 'string' ? first : first.name
      return undefined
    }
    case 'silo':
      return meta.protocolVersion ? `Silo ${meta.protocolVersion}` : 'Silo'
    case 'fluid':
      return 'Fluid'
    case 'euler-earn':
      return 'Euler'
    default:
      return undefined
  }
}
