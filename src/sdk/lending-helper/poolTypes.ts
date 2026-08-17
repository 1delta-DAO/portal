/**
 * Response types for `GET /v1/data/lending/pools` — the shape of a lending
 * market as the backend serves it.
 *
 * This is the core data model of the app: `PoolEntry` is what every market
 * table row, action panel and risk badge is built from. It lives here, next to
 * the other SDK response types, rather than inside the hook that happens to
 * fetch it — read this file to learn the domain, read
 * `hooks/lending/useFlattenedPools.ts` to learn how it is fetched.
 *
 * Note the string-typed numerics: the API serialises amounts and rates as
 * strings to avoid float precision loss. Parse at the point of use.
 */

import type { FluidSmartInfo } from './fluidSmart'

export interface PoolExposure {
  debts: string[] | null
  label: string
  configId: string
  collaterals: string[] | null
}

export interface PoolAssetInfo {
  chainId: string
  address: string
  symbol: string
  name: string
  decimals: number
  logoURI: string
  assetGroup: string
  currencyId: string
  props?: Record<string, unknown>
}

export interface PoolPriceInfo {
  priceUsd: number
  priceTs: string
  priceUsd24h: number
  priceTs24h: string
  priceChange24h: number
}

export interface PoolOraclePrice {
  oraclePrice: number | null
  oraclePriceUsd: number | null
}

export interface PoolUnderlyingInfo {
  asset: PoolAssetInfo
  prices: PoolPriceInfo
  oraclePrice: PoolOraclePrice
}

/** Oracle risk band, ordered low→high. */
export type OracleBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

/**
 * One oracle feed classification for a market, from the risk-data pipeline.
 * Distinct from `risk.breakdown[oracle]` (price-staleness): this describes
 * whether the feed prices the *intended* asset/numeraire. `score` is 0–100.
 */
export interface PoolOracleFeed {
  /** Priced asset symbol (the reported numerator). */
  asset: string | null
  /** Oracle / feed / adapter address (lowercased). */
  oracle: string | null
  /** Oracle type: `chainlink`, `redstone`, `composite`, `constant`, … */
  provider: string | null
  /** Decoded reported pair, e.g. "ETH / USD"; null/"UNKNOWN" when undecoded. */
  priceDescription: string | null
  /** What the feed *should* report, "<asset> / <numeraire>". null for Morpho. */
  intendedPair: string | null
  /** Does the source price the intended asset? null = unverifiable. */
  correctOracle: boolean | null
  /** Denominated in the right numeraire? null = unknown (always null for Morpho). */
  denominatorMatch: boolean | null
  /** Hardcoded/constant price feed. */
  fixedRate: boolean
  /** Risk score 0–100. */
  score: number
  band: OracleBand
  /** e.g. `wrong-asset`, `cross-numeraire`, `undecoded-source`, `fixed-rate`. */
  flags: string[]
}

/**
 * Top-level oracle classification for a market. A market can have several
 * feeds (Compound comets price each asset; Fluid prices each side), so `feeds`
 * is an array; `worstScore`/`worstBand` summarize the riskiest feed. `null`
 * when the market has no oracle classification.
 */
export interface PoolOracleInfo {
  feeds: PoolOracleFeed[]
  worstScore: number
  worstBand: OracleBand
}

export interface LenderInfo {
  key: string
  name: string
  logoURI: string
}

export interface PoolFlags {
  isActive?: boolean
  isFrozen?: boolean
  hasStable?: boolean
  borrowingEnabled?: boolean
  collateralActive?: boolean
  depositsEnabled?: boolean
  /**
   * Brokered (Lista) markets: variable borrowing isn't offered through the
   * 1delta composer — borrowers pick a fixed term from `terms[]`. The raw
   * `variableBorrowRate` is 0 here and should not be ranked. See BROKERED_MARKETS.md.
   */
  variableBorrowDisabled?: boolean
}

/**
 * One fixed-term option from a brokered market's rate card. `apr` is a percent
 * (e.g. 3.85 = 3.85%), same unit as the pool's other rates. See BROKERED_MARKETS.md §2.
 */
export interface PoolTerm {
  /** Broker term identifier — passed to the borrow builder as `termId`. */
  termId: number
  /** How long the position is locked at the fixed rate. */
  durationDays: number
  /** Annualised fixed borrow rate, percent. */
  apr: number
}

/**
 * One action the API declares a market row supports (`MarketCapability`).
 *
 * The contract, from the server side: the array is COMPLETE over the actions it
 * models, so for those actions absent ⇒ not offered, and a client must not
 * offer them. Actions outside that set are simply not modelled yet.
 *
 * Nothing about the mechanism is here on purpose — `refinance` is a flash-loan
 * composer bundle on a Lista brokered market and the protocol's own DebtManager
 * on Exactly, and a caller cannot tell which. That is what makes the button
 * lender-agnostic.
 */
export interface MarketCapability {
  /**
   * `refinance` — move this market's debt into a different term.
   * `set-mode`  — switch the ACCOUNT's active risk mode (Aave e-mode).
   */
  action: 'refinance' | 'set-mode'
  /** Which parameter it changes. */
  parameter: 'term' | 'mode'
  /**
   * What the change applies to. `account`-scoped entries are declared on every
   * row of the lender because they are true of all of them — read one off any
   * row rather than per market.
   */
  scope: 'position' | 'account'
  /** The endpoint that builds it. */
  endpoint: string
  /** Params needed beyond `marketUid` / `operator` / `amount`. */
  requires?: string[]
  /**
   * Which field on the row holds the allowed values — `terms` is the published
   * rate card, `config` the risk-config map (its KEYS are the mode ids).
   */
  domainField?: 'terms' | 'config'
}

/** Does the API declare this row supports `action`? */
export function hasCapability(
  pool: { capabilities?: MarketCapability[] } | null | undefined,
  action: MarketCapability['action']
): boolean {
  return !!pool?.capabilities?.some((c) => c.action === action)
}

export interface PoolEntry {
  chainId: string
  marketUid: string
  name: string
  lenderKey: string
  lenderInfo?: LenderInfo
  flags?: PoolFlags
  underlyingAddress: string
  depositRate: string
  variableBorrowRate: string
  stableBorrowRate: string
  intrinsicYield: string | null
  totalDeposits: string
  totalDebt: string
  totalLiquidity: string
  totalDepositsUsd: string
  totalDebtUsd: string
  totalLiquidityUsd: string
  borrowLiquidity: string
  withdrawLiquidity: string
  depositable: string
  utilization: string
  configIds: string[]
  exposures: PoolExposure[]
  rewards: unknown | null
  underlyingInfo: PoolUnderlyingInfo
  risk: PoolRisk | null
  /**
   * Oracle feed-correctness classification (top-level, sibling of `risk`).
   * `null`/absent ⇒ no oracle data for this market. See {@link PoolOracleInfo}.
   */
  oracleInfo: PoolOracleInfo | null
  /**
   * Brokered (Lista) rate card — termId/durationDays/apr serialized as strings.
   * `null`/absent ⇒ not brokered; `[]` ⇒ the broker pruned the menu (treat as
   * inactive). See BROKERED_MARKETS.md §2-3.
   */
  terms?: Array<{
    termId: number | string
    durationDays: number | string
    apr: number | string
  }> | null
  /** Mirror of `flags.variableBorrowDisabled`, surfaced top-level by `/pools`. */
  variableBorrowDisabled?: boolean
  /**
   * THIS ROW'S ASSET IS NOT INDEPENDENTLY HOLDABLE — it is one leg of a
   * pool-rebalanced basket (a Fluid smart side today; Lista SmartLP and GMX
   * GM/GLV are the same shape) whose ratio the POOL, not the user, sets.
   *
   * A sibling of `fluid` rather than a field inside it, on purpose: branch on
   * this once instead of learning each protocol. Absent/false ⇒ ordinary
   * single-asset market. See `fluidSmart.ts`.
   */
  autoBalanced?: boolean
  /**
   * Fluid smart-vault descriptor (T2/T3/T4 only) — the basket rate, the leg
   * order, and the share↔token conversion. Null on every other market. Read it
   * through `fluidSmart.ts`, never by parsing the lender name.
   */
  fluid?: FluidSmartInfo | null
}

export interface PoolOwnerShare {
  /** Owner address, or the literal "others" for the tail bucket */
  owner: string
  /** Fraction of the pool held by this owner, 0–1 */
  share: number
}

export interface PoolRiskBreakdown {
  category: string
  score: number | null
  label: string
  curatorValidated?: boolean
  curatorIds?: string[] | null
  /** Oracle risk: human-readable description */
  description?: string | null
  /** Oracle risk: whether the oracle has a static base price */
  staticBase?: boolean | null
  /** Oracle risk: base asset symbol or address */
  baseAsset?: string | null
  /** Concentration risk: per-owner share of the pool (shares are fractions 0–1) */
  ownerDistribution?: PoolOwnerShare[] | null
  /** Governance risk: coarse tier label (low/medium/high/unknown) */
  tier?: string | null
  /** Governance risk: who can upgrade/re-parametrize the market
   *  (EOA, SAFE, TIMELOCK, GOVERNANCE, IMMUTABLE, FINALIZED, CUSTOM, UNKNOWN). */
  ownerKind?: string | null
  /** Governance risk: multisig signer threshold / owner count when ownerKind is SAFE. */
  signerThreshold?: number | null
  signerCount?: number | null
}

export interface PoolRisk {
  score: number
  label: string
  breakdown: PoolRiskBreakdown[]
}

export interface PoolsApiResponse {
  success: boolean
  data: {
    start: number
    count: number
    items: PoolEntry[]
  }
  error?: { code: string; message: string }
}

/**
 * Optional server-side filters supported by `/v1/data/lending/pools`. All
 * fields are passed straight through to the backend; see the OpenAPI spec for
 * semantics. Numeric rates (`minYield`, `maxYield`, `minUtil`, `maxUtil`) are
 * decimals (0–1), not percentages.
 */
export interface PoolsFilters {
  lender?: string
  underlyings?: string[]
  assetGroups?: string[]
  /** Include fixed-rate / order-book earn markets (Morpho Midnight), hidden by
   *  default because their yield lives in an order book, not a pool rate. */
  includeFixedTerm?: boolean
  minYield?: number
  maxYield?: number
  minUtil?: number
  maxUtil?: number
  minTvlUsd?: number
  maxTvlUsd?: number
  minDeposits?: number
  maxDeposits?: number
  minDebt?: number
  maxDebt?: number
  minDebtUsd?: number
  maxDebtUsd?: number
  minLiquidity?: number
  maxLiquidity?: number
  minLiquidityUsd?: number
  maxLiquidityUsd?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc' | 'ASC' | 'DESC'
}
