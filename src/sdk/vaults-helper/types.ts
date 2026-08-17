/**
 * Shared types for the /v1/data/vaults and /v1/actions/vaults endpoints.
 *
 * Every provider exposes the same load-bearing fields by contract.
 * Provider-specific extras (curators, fee, supplyRate, etc.) are typed loosely
 * so the UI can pick them up without each new field being a compile error.
 */

export type VaultProvider =
  | 'fluid'
  | 'gearbox'
  | 'morpho'
  | 'lista'
  | 'silo'
  | 'euler-earn'
  | 'aave-earn'
  | 'lst'
  | 'savings'
  | 'lagoon'
  | 'upshift'
  | 'hypercore'
  | 'gmx'

export const VAULT_PROVIDERS: VaultProvider[] = [
  'fluid',
  'gearbox',
  'morpho',
  'lista',
  'silo',
  'euler-earn',
  'aave-earn',
  'lst',
  'savings',
  'lagoon',
  'upshift',
  'hypercore',
  'gmx',
]

/**
 * Calldata-builder families. Each maps to a distinct worker route + parameter
 * style (see {@link resolveVaultRoute}). Providers collapse onto a family:
 *
 * Deposits for every family except GMX/Hypercore go through the single
 * auto-resolving `/deposit` entry point (it reads protocol + interface from the
 * share token); the per-family routes below apply to *withdrawals*:
 *
 * - `erc4626`   — morpho / fluid / silo / euler-earn / gearbox, via the generic
 *                 `/withdraw` Composer endpoint (instant exit).
 * - `savings`   — sUSDe / sUSDS / sDAI … via `/savings` (ERC-4626 + cooldown).
 * - `lst`       — liquid-staking tokens via `/lst` (request → claim queues).
 * - `gmx`       — GM/GLV via `/gmx` for *all* verbs (async orders,
 *                 execution-fee `value`; not an `asset()`-based share token).
 * - `lagoon`    — ERC-7540 async withdrawals, routed through `/lst?kind=lagoon`.
 * - `hypercore` — HyperLiquid multi-leg, via `/deposit|withdraw?interface=hypercore`.
 */
export type VaultFamily = 'erc4626' | 'savings' | 'lst' | 'gmx' | 'lagoon' | 'hypercore'

export function vaultFamily(provider: VaultProvider): VaultFamily {
  switch (provider) {
    case 'lst':
      return 'lst'
    case 'savings':
      return 'savings'
    case 'gmx':
      return 'gmx'
    case 'lagoon':
      return 'lagoon'
    case 'hypercore':
      return 'hypercore'
    default:
      // morpho, fluid, silo, euler-earn, aave-earn, gearbox
      return 'erc4626'
  }
}

/**
 * How a family's withdrawal works:
 * - `direct` — a single synchronous call returns the underlying immediately
 *   (erc4626, savings, hypercore).
 * - `async`  — withdrawal is a request that matures off-chain; the user later
 *   claims (or cancels) it. Tracked via `/v1/data/vaults/withdrawals`
 *   (lst, gmx, lagoon).
 */
export function withdrawalStyle(family: VaultFamily): 'direct' | 'async' {
  return family === 'lst' || family === 'gmx' || family === 'lagoon' ? 'async' : 'direct'
}

/**
 * Savings withdrawal modes that are two-step request → claim rather than an
 * instant redeem. The backend savings row carries its `withdrawalMode`
 * (passed through in `extras`):
 *
 * - `fixed-cooldown`  — StakedUSDeV2-style escrow + `unstake` (sUSDe, savUSD,
 *   savETH, strUSD, sNUSD).
 * - `request-based`   — bespoke request/claim (3Jane sUSD3 cooldown, the
 *   Strata tranches' cooldown escrows, Apyx's UnlockToken, Maple cycles).
 * - `queued` / `fee-or-queued` — withdrawal queues (Native wNLP; the free
 *   queued leg is what `request-withdraw` builds).
 *
 * `instant` and `instant-capped` (Spark, 3Jane USD3) stay direct.
 */
const ASYNC_SAVINGS_MODES = new Set(['fixed-cooldown', 'request-based', 'queued', 'fee-or-queued'])

/**
 * Per-vault withdrawal asyncness. The family-level `withdrawalStyle` is right
 * for every family except `savings`, which is a mixed bag: sUSDS exits
 * instantly while sUSDe needs a 7-day cooldown + claim. The matured requests
 * of async savings vaults surface in `/v1/data/vaults/withdrawals` next to
 * the lst/gmx/lagoon ones and are claimed through `/savings?action=claim`.
 *
 * The mode lives in the row's `providerMeta`, NOT at its root — verified
 * against the live catalog, where every savings row carries it.
 */
export function isAsyncVaultWithdraw(entry: Pick<VaultEntry, 'provider' | 'extras'>): boolean {
  const family = vaultFamily(entry.provider)
  if (withdrawalStyle(family) === 'async') return true
  if (family !== 'savings') return false
  return ASYNC_SAVINGS_MODES.has(savingsWithdrawalMode(entry) ?? '')
}

/** The savings row's `withdrawalMode`, or undefined for other providers. */
export function savingsWithdrawalMode(entry: Pick<VaultEntry, 'extras'>): string | undefined {
  const meta = entry.extras?.providerMeta as { withdrawalMode?: unknown } | undefined
  const mode = meta?.withdrawalMode ?? entry.extras?.withdrawalMode
  return typeof mode === 'string' ? mode : undefined
}

/**
 * The route family to use for a vault's **withdrawal**.
 *
 * Everything but `savings` is fixed by its provider. Savings is split, because
 * the `/savings` route only speaks `request-withdraw|claim|deposit|cancel`:
 *
 * - cooldown / request-based / queued vaults → `savings`, whose
 *   `request-withdraw` opens the request in SHARE units.
 * - instant (and instant-capped) vaults → `erc4626`, i.e. the generic
 *   `/withdraw` endpoint, which auto-resolves the 4626 surface, takes
 *   UNDERLYING units and supports withdraw-all. Sending these to `/savings`
 *   would fail for every vault the calldata registry doesn't carry (sUSDS,
 *   sDAI, stUSD, …) — it only lists the non-instant ones plus a few pinned
 *   for address resolution.
 */
export function withdrawFamily(entry: Pick<VaultEntry, 'provider' | 'extras'>): VaultFamily {
  const family = vaultFamily(entry.provider)
  if (family !== 'savings') return family
  return isAsyncVaultWithdraw(entry) ? 'savings' : 'erc4626'
}

/** The savings row's cooldown in seconds, when it publishes one. */
export function savingsWithdrawalCooldownSeconds(
  entry: Pick<VaultEntry, 'extras'>
): number | undefined {
  const meta = entry.extras?.providerMeta as { withdrawalCooldownSeconds?: unknown } | undefined
  const raw = meta?.withdrawalCooldownSeconds
  const n = typeof raw === 'string' ? Number(raw) : raw
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined
}

/** The verbs the action endpoints accept. */
export type VaultActionVerb = 'deposit' | 'withdraw' | 'request-withdraw' | 'claim' | 'cancel'

/**
 * Resolved worker route for a (family, verb) pair.
 *
 * - `segment`     — path after `/v1/actions/vaults/`. For generic families it's
 *   the verb itself (`deposit`/`withdraw`); for dedicated families it's the
 *   family name and the verb travels in the `action` query param.
 * - `baseQuery`   — fixed query params the route always needs (`interface`,
 *   `kind`).
 * - `idStyle`     — `generic` identifies the vault by `vault` + `underlying`;
 *   `share` identifies it by `shareToken` alone.
 * - `actionInQuery` — whether the verb is sent as `?action=` (dedicated
 *   families) rather than baked into the path.
 */
export interface VaultRoute {
  segment: string
  baseQuery: Record<string, string>
  idStyle: 'generic' | 'share'
  actionInQuery: boolean
}

export function resolveVaultRoute(family: VaultFamily, verb: VaultActionVerb): VaultRoute {
  const isDeposit = verb === 'deposit'

  // GMX is USD-denominated / multi-leg, not an `asset()`-based share token, so
  // it keeps its dedicated route for every verb (the auto path would return
  // UNRESOLVED_UNDERLYING).
  if (family === 'gmx') {
    return { segment: 'gmx', baseQuery: {}, idStyle: 'share', actionInQuery: true }
  }

  // Hypercore is HyperLiquid multi-leg: routed through the generic
  // deposit/withdraw endpoints with an explicit interface.
  if (family === 'hypercore') {
    return {
      segment: isDeposit ? 'deposit' : 'withdraw',
      baseQuery: { interface: 'hypercore' },
      idStyle: 'generic',
      actionInQuery: false,
    }
  }

  // Deposits: `/deposit` is the single auto-resolving entry point. It resolves
  // protocol + interface from the share token, covering ERC-4626 (savings,
  // morpho, fluid, euler-earn, silo, gearbox), LST mints, and ERC-7540/7575.
  // The `/lst` & `/savings` routes survive only as back-compat aliases.
  if (isDeposit) {
    return { segment: 'deposit', baseQuery: {}, idStyle: 'generic', actionInQuery: false }
  }

  // Withdrawals keep their family-specific flows (bespoke exit queues).
  switch (family) {
    case 'lst':
      return { segment: 'lst', baseQuery: {}, idStyle: 'share', actionInQuery: true }
    case 'savings':
      return { segment: 'savings', baseQuery: {}, idStyle: 'share', actionInQuery: true }
    case 'lagoon':
      // ERC-7540 async reachable via the lst route with kind=lagoon.
      return {
        segment: 'lst',
        baseQuery: { kind: 'lagoon' },
        idStyle: 'share',
        actionInQuery: true,
      }
    case 'erc4626':
    default:
      return {
        segment: 'withdraw',
        baseQuery: {},
        idStyle: 'generic',
        actionInQuery: false,
      }
  }
}

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
  /**
   * `totalAssets` already divided by underlying decimals (backend-provided).
   * Some providers (e.g. GMX) only populate this + USD, leaving the raw
   * `totalAssets`/`totalSupply` null — prefer this for native-unit display.
   */
  totalAssetsFormatted?: number
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
  /** Price per share, denominated in the underlying (e.g. 1.0146). */
  sharePrice?: number
  /** Price per share in USD (e.g. 1.0144). */
  sharePriceUsd?: number
  /**
   * All-in supply APR as a *percent* (e.g. 5.2 means 5.2%) — base lending yield
   * + incentive rewards (the backend's `totalRate`). Fluid/Gearbox/Silo
   * populate this; Morpho usually fills it in via its own API. A `0` here means
   * the rate is unknown/unpopulated (historically every Euler Earn vault,
   * though many now report real rates) — UI should treat 0 as "unknown".
   */
  supplyRate?: number
  /**
   * Base lending yield as a *percent* — the underlying-denominated "real yield"
   * before incentives (the backend's `depositRate`). Absent when a provider
   * doesn't split its rate out; callers should fall back to {@link supplyRate}.
   */
  baseRate?: number
  /**
   * Incentive/rewards APR as a *percent* — the token-incentive slice on top of
   * {@link baseRate} (the backend's `rewardsRate`). `supplyRate ≈ baseRate +
   * rewardsRate`. Break this out so users don't mistake incentives for real
   * yield.
   */
  rewardsRate?: number
  /** Vault management fee, percent. */
  fee?: number
  /** Curator label (provider-specific shape — see `extras` for raw). */
  curator?: string
  /**
   * Resolved vault icon — the backend's `vaultInfo.logoURI` (branded share-token
   * logo → underlying asset logo → curator logo). Use this to render the vault.
   */
  logoURI?: string
  /** Share-token asset class (e.g. `USDC`), from `vaultInfo.assetGroup`. */
  assetGroup?: string
  /** NAV behaviour — `yield-bearing` vs `volatile` (`vaultInfo.yieldProfile`). */
  yieldProfile?: string
  /** Underlying denomination — `stable` vs `volatile` (`vaultInfo.denomination`). */
  denomination?: string
  /**
   * Delegation requirement for LST mints (validator/group/pool selection).
   * Absent ⇒ pooled deposit, no picker. See {@link VaultDelegation}.
   */
  delegation?: VaultDelegation
  /** Untyped passthrough of the provider's full row. */
  extras: Record<string, unknown>
}

/**
 * LST delegation descriptor (from `providerMeta.delegation`). When present the
 * deposit may/must carry a delegation choice echoed back under `optionKey`.
 *
 * - `source: 'endpoint'` — selectable set comes from
 *   `/v1/data/vaults/validators`; render a picker.
 * - `source: 'offchain'` — the id is a free-form value (e.g. Solv `poolId`);
 *   render a text input.
 * - `required` — whether a choice is mandatory. `default === 'auto'` means the
 *   server resolves it when omitted (picker is then optional/advanced).
 */
export interface VaultDelegation {
  required: boolean
  kind: 'validator' | 'validatorGroup' | 'node' | 'pool' | 'vault'
  /** Query param the chosen id is echoed back under (e.g. `validatorGroup`). */
  optionKey: string
  default?: string | null
  source: 'endpoint' | 'offchain'
}

/** One selectable delegation target from `/v1/data/vaults/validators`. */
export interface VaultValidatorItem {
  id: string
  status: string
  /** Whether this option can currently be chosen (gates the row). */
  selectable: boolean
  /** The API's suggested default — preselect this one. */
  recommended: boolean
  /** Remaining capacity ("room"), raw in underlying units. */
  receivableVotes?: string
}

export interface VaultValidatorsResponse {
  items: VaultValidatorItem[]
}

/**
 * Paginated catalog page from `/v1/data/vaults`. The backend returns the
 * vaults as a flat `items[]` array (one row per vault, every provider mixed
 * together) plus pagination cursors, not a provider-keyed map.
 */
export interface VaultsCatalogResponse {
  start?: number
  count?: number
  items?: RawVault[]
}

/**
 * Loose shape for one vault row in `data.items[]`. The load-bearing scalars
 * sit at the top level; rates / TVL / liquidity / underlying / provider-meta
 * are nested objects. Anything not listed flows through into
 * `VaultEntry.extras` via the catch-all.
 */
export interface RawVault {
  chainId?: string
  provider?: string
  /** Vault contract address (the share token). */
  vaultAddress?: string
  underlying?: string
  symbol?: string
  name?: string
  displayName?: string
  curatorName?: string
  decimals?: number
  assetDecimals?: number | null
  timelock?: number
  /** Price per share — raw integer, underlying-denominated, and USD strings. */
  sharePriceRaw?: string
  sharePrice?: string | number
  sharePriceUsd?: string | number
  shareAsset?: string | null
  rates?: {
    depositRate?: number
    rewardsRate?: number
    /** Depositor's all-in APR (deposit + rewards), percent. */
    totalRate?: number
    fee?: number
  } | null
  tvl?: {
    totalAssets?: string | number
    totalSupply?: string | number
    totalAssetsFormatted?: number
    totalAssetsUsd?: number
  } | null
  liquidity?: {
    liquidity?: string | number
    liquidityFormatted?: number
    liquidityUsd?: number
  } | null
  underlyingInfo?: {
    asset?: {
      symbol?: string
      name?: string
      decimals?: number
      logoURI?: string
      [key: string]: unknown
    } | null
    prices?: {
      priceUsd?: number
      priceTs?: string
    } | null
  } | null
  /**
   * The vault's own identity bundle — icon + name + classification — mirroring
   * `underlyingInfo.asset` (the token). Present on every provider; some fields
   * are null where they don't apply (e.g. HyperCore has no resolvable icon).
   */
  vaultInfo?: {
    address?: string
    symbol?: string | null
    name?: string | null
    logoURI?: string | null
    assetGroup?: string | null
    yieldProfile?: string | null
    denomination?: string | null
  } | null
  providerMeta?: {
    curators?: Array<{ name?: string } | string> | null
    curatorName?: string
    protocolVersion?: string
    delegation?: VaultDelegation | null
    [key: string]: unknown
  } | null
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

/**
 * A pending/claimable withdrawal request from `/v1/data/vaults/withdrawals`.
 * The reader normalises every protocol's queue to this uniform shape; the
 * protocol-native reference fields (requestId, tokenId, …) are passed straight
 * back into the `claim` / `cancel` action builders.
 */
export interface VaultWithdrawalRequest {
  /** Share-token address of the vault the request belongs to. */
  lst: string
  /** Protocol brand (e.g. "StellaSwap", "Lido"). */
  brand?: string
  symbol?: string
  /** Underlying-denominated amount being unbonded/redeemed. */
  amountUnderlying?: string
  status: 'pending' | 'claimable' | (string & {})
  /** Unix seconds (or ISO string) when a pending request becomes claimable. */
  readyAt?: number | string
  // ── protocol-native reference fields (pass back verbatim to claim/cancel) ──
  requestId?: string | number
  requestIds?: string
  hints?: string
  amounts?: string
  tokenId?: string | number
  id?: string | number
  shares?: string
  assets?: string
  controller?: string
  user?: string
  recipient?: string
  outputAsset?: string
  /**
   * The escrow contract this request actually sits on, when the protocol runs
   * more than one. Strata gives each market both an `UnstakeCooldown` and an
   * `ERC20Cooldown`, and `finalize` only settles requests on the contract it
   * is called against — so this must be passed back with the claim or it
   * silently does nothing.
   */
  withdrawQueue?: string
  /** The token the escrow books this request under, when the claim call takes
   *  it as an argument (Strata's `finalize(claimToken, user)`). */
  claimToken?: string
  [key: string]: unknown
}

export interface VaultWithdrawalsResponse {
  chainId?: string
  account?: string
  count?: number
  requests: VaultWithdrawalRequest[]
}
