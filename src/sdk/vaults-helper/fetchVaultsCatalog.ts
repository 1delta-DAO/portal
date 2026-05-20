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
  /** Provider-keyed map exactly as the backend returns it. */
  raw?: VaultsCatalogResponse
  /** Flattened list normalized to the {@link VaultEntry} shape. */
  vaults?: VaultEntry[]
  error?: string
}

const ENDPOINT = `${BACKEND_BASE_URL}/v1/data/vaults`

export async function fetchVaultsCatalog(
  params: FetchVaultsCatalogParams
): Promise<FetchVaultsCatalogResult> {
  try {
    const providers = params.providers && params.providers.length > 0
      ? params.providers
      : VAULT_PROVIDERS

    const qs = new URLSearchParams()
    qs.set('chainId', params.chainId)
    qs.set('providers', providers.join(','))

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

    const raw: VaultsCatalogResponse = json.data ?? {}
    const vaults = flattenCatalog(raw)
    return { success: true, raw, vaults }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' }
  }
}

/**
 * Normalize a provider-keyed catalog into a flat `VaultEntry[]` so tables,
 * filters and search can treat every provider uniformly. Provider-specific
 * fields (curators, protocolVersion, etc.) survive in `extras`.
 */
function flattenCatalog(raw: VaultsCatalogResponse): VaultEntry[] {
  const out: VaultEntry[] = []
  for (const provider of VAULT_PROVIDERS) {
    const bag = raw[provider]
    if (!bag) continue
    for (const value of Object.values(bag)) {
      const entry = normalizeVault(provider, value)
      if (entry) out.push(entry)
    }
  }
  return out
}

function normalizeVault(provider: VaultProvider, v: RawVault): VaultEntry | null {
  const address = (v.address ?? '').toString()
  const underlying = (v.underlying ?? '').toString()
  if (!address || !underlying) return null

  return {
    provider,
    address,
    underlying,
    symbol: (v.symbol ?? '').toString(),
    name: (v.name ?? v.symbol ?? '').toString(),
    decimals: typeof v.decimals === 'number' ? v.decimals : 18,
    totalAssets: v.totalAssets != null ? String(v.totalAssets) : '0',
    totalSupply: v.totalSupply != null ? String(v.totalSupply) : '0',
    totalAssetsUsd: typeof v.totalAssetsUsd === 'number' ? v.totalAssetsUsd : undefined,
    liquidity: v.liquidity != null ? String(v.liquidity) : undefined,
    liquidityFormatted:
      typeof v.liquidityFormatted === 'number' ? v.liquidityFormatted : undefined,
    liquidityUsd: typeof v.liquidityUsd === 'number' ? v.liquidityUsd : undefined,
    underlyingPriceUsd:
      typeof v.underlyingPriceUsd === 'number' ? v.underlyingPriceUsd : undefined,
    supplyRate: toNumber(v.supplyRate),
    fee: toNumber(v.fee),
    curator: deriveCurator(provider, v),
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
  switch (provider) {
    case 'morpho': {
      const first = v.curators?.[0]
      if (!first) return undefined
      return typeof first === 'string' ? first : first.name
    }
    case 'gearbox':
      return v.curatorName
    case 'silo':
      return v.protocolVersion ? `Silo ${v.protocolVersion}` : 'Silo'
    case 'fluid':
      return 'Fluid'
    case 'euler-earn':
      return 'Euler'
    default:
      return undefined
  }
}
