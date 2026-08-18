/**
 * Types for `GET /v1/data/earn` — the unified supply-side listing.
 *
 * **Deliberately contains NO list of venues, providers or lenders.**
 *
 * The older `sdk/vaults-helper/types.ts` ships `VAULT_PROVIDERS`, a 13-entry
 * hand-copy of the SDK's `VaultProvider` union — already two behind (it is
 * missing `termmax` and `yearn`), so those vaults are invisible in this app
 * until someone notices and redeploys. Every such list is a copy of server
 * state that silently rots.
 *
 * The earn endpoint publishes its own vocabulary in `facets`, so the UI
 * enumerates what the server actually has. `venue` is an opaque string here on
 * purpose: a new lender or vault provider must appear in this app with no
 * frontend change at all.
 */

/** Opaque. `AAVE_V3` or `vault.savings` — never parsed or switched on. */
export type EarnVenue = string

/**
 * Opaque, like {@link EarnVenue}. Today the server emits `lending` and `vault`,
 * but pinning that as a union would make a third kind a compile error here
 * rather than a new row — and the whole point is that this app renders what it
 * is given. Label it with `vocabLabel(vocab, 'venueKind', kind)`.
 */
export type EarnVenueKind = string

/**
 * Opaque for the same reason as {@link EarnVenueKind}. The known values are
 * deposit / withdraw / request-withdraw / claim / cancel; a new one renders and
 * dispatches without a change here.
 */
export type EarnActionKind = string

export interface EarnAsset {
  address: string
  symbol: string
  decimals: number
  assetGroup?: string
  priceUsd?: number
}

export interface EarnShareToken {
  address: string
  symbol: string
  decimals: number
}

/**
 * Amounts arrive in whichever scales the source has. **Compare on `formatted`**
 * — `raw` is base units and is absent on the lending half, so sorting or
 * thresholding on it silently mixes scales.
 */
export interface EarnAmount {
  raw?: string
  formatted?: number
  usd?: number
}

export interface EarnRate {
  /** ALWAYS percent (`4.12` = 4.12 %). The envelope stamps `rateUnit`. */
  total: number
  base?: number
  rewards?: number
  /** The asset's own yield — what it pays in your wallet, no venue involved. */
  intrinsic?: number
  /** `base + rewards` — what THIS venue pays for taking its risk. */
  marketOwn?: number
  /**
   * The asset carries the yield and the venue adds ~nothing. Hidden by default
   * by the endpoint; `excluded.passthrough` counts what was removed.
   */
  passthrough?: boolean
  /** How the rate is set — `variable-curve`, `nav-accrual`, `fixed-term`… */
  kind: string
  /** Where it came from — `chain` | `api` | `oracle` | `realized`. */
  source: string
  asOf?: number
}

export interface EarnExit {
  /** `instant` | `instant-capped` | `fixed-cooldown` | `request-based` | … */
  mode: string
  settlement?: 'sync' | 'async'
  cooldownSecs?: number
  feeBps?: number
}

export interface EarnAvailability {
  canDeposit: boolean
  canWithdraw: boolean
  /** `cap-full` | `frozen` | `paused` | `allowlist-contract` | … */
  gating?: string
  /** Human-readable — render this on the disabled CTA. */
  reason?: string
}

/**
 * Loss of principal that has ALREADY HAPPENED.
 *
 * `usd` is the amount, but a defaulted market is pinned at 100% utilization, so
 * its interest rate sits at the IRM ceiling (~297,996% APY) and BOTH sides of
 * its book inflate exponentially on a debt nobody will repay. When `nominal` is
 * true that figure is accrued book value, not capital: one market reports $3.7B
 * against a protocol holding $1.76M on that chain.
 *
 * SO: when `nominal`, render `ratio` ("84% of book impaired") and never the
 * dollars. The ratio is scale-invariant and stays true either way.
 */
export interface EarnBadDebt {
  usd?: number
  realizedUsd?: number
  /** Bad debt over size. Always safe to render. */
  ratio?: number
  /** 1-5, higher is worse (market rows only). */
  score?: number
  level?: 'green' | 'yellow' | 'red'
  /** false = dust in a near-empty market: reported, never scored. */
  material?: boolean
  /** true = book value, not capital. Show `ratio`, suppress `usd`. */
  nominal?: boolean
  /** Vault rows: this vault's SHARE of its markets' loss, not their total. */
  attributed?: boolean
  borrowApy?: number
}

/**
 * NAV the vault reports but cannot account for in any market.
 *
 * MetaMorpho V1.1 and Euler Earn absorb a loss into `lostAssets` so that
 * `totalAssets()` and the SHARE PRICE STAY FLAT. A vault that lost everything
 * keeps advertising its old TVL at a healthy share price — nothing else in this
 * payload moves, which is exactly why it needs its own field.
 */
export interface EarnLostAssets {
  usd?: number
  /** Share of reported NAV backed by nothing. 1 = a total loss. */
  pct?: number
}

/**
 * Who can change this position, and how fast — on ONE 1-5 ladder for vaults and
 * lending markets alike, so the unified list can be ranked without branching on
 * row kind. Higher is worse; absent means UNKNOWN, never "well governed".
 *
 * `grain` says what it was measured on:
 *   'vault'  — the vault's own timelock, or the governance of the markets it
 *              lends into, whichever is worse. A zero timelock means the curator
 *              can repoint it in one transaction, with no window to withdraw.
 *   'market' — the market's admin / oracle / immutability.
 */
export interface EarnGovernance {
  score: number
  grain: 'vault' | 'market'
  /** vault: `timelock` | `market-governance` | both. */
  flag?: string
  /** vault: notice period in seconds. 0 is a finding; absent = no such param. */
  timelockSecs?: number
  ownScore?: number
  marketsScore?: number
  /** market: 'low' | 'medium' | 'high' | 'unknown'. */
  tier?: string
  ownerKind?: string
  /** market: admin | oracle | immutable — how the score was measured. */
  mode?: string
  delaySecs?: number
  signerThreshold?: number
  signerCount?: number
}

export interface EarnRisk {
  yieldProfile?: 'yield-bearing' | 'volatile'
  denomination?: 'stable' | 'volatile'
  counterparty?: string
  /** GREATEST(chain, lender, token). **Higher is worse**; the API lists <= 4. */
  score?: number
  /** Human band for `score` — 'low' | 'medium' | 'high' | … */
  label?: string
  /**
   * Claims a same-block exit but reports ZERO liquidity: enterable, not
   * exitable. Distinct from a cooldown vault, which is illiquid BY DESIGN and
   * is never flagged.
   */
  illiquid?: boolean
  /**
   * The vault's own rating (curator / markets / liquidity / integrity), kept
   * APART from `score`, which rates the venue in the abstract. A vault can sit
   * on a low-risk chain and lender and still have lost the money.
   */
  vault?: {
    level?: 'green' | 'yellow' | 'red'
    score?: number
    /** `bad-debt` | `lost-assets` | `lost-assets+bad-debt` | … */
    integrityFlag?: string
  }
  governance?: EarnGovernance
  badDebt?: EarnBadDebt
  lostAssets?: EarnLostAssets
  /**
   * The snapshot the rating was computed from is old, so the TVL / APR /
   * liquidity behind it describe the vault as it WAS. Seen at 100 days.
   */
  stale?: { ageDays?: number }
}

/**
 * What can be done to a row and what each op needs.
 *
 * This replaces the client-side routing matrix in `vaults-helper/types.ts`
 * (`vaultFamily` / `withdrawalStyle` / `isAsyncVaultWithdraw` /
 * `withdrawFamily`). Render the CTA from this array; do not re-derive it from
 * `venue` or `exit.mode`.
 */
/**
 * One asset a deposit accepts, and what THAT path needs.
 *
 * Per input, not per action: minting mETH with native ETH needs
 * `minMETHAmount`, while another path on the same vault may need nothing.
 */
export interface EarnActionInput {
  /** `'native'` or a lowercased ERC-20 address. */
  asset: string
  symbol?: string
  /** `direct` | `wrap` | `submit-wrap` | `psm-then-deposit` */
  mode?: string
  /** Option keys this path REQUIRES. */
  needs?: string[]
  optional?: string[]
}

export interface EarnCapability {
  action: EarnActionKind
  /**
   * How the action is executed. `swap` means the venue has NO mint/redeem leg
   * — the position is bought and sold as an instrument, so both directions are
   * trades and both need a price bound.
   */
  via?: 'swap' | string
  /** Extra params this action needs, e.g. `['validator']`, `['tokenId']`. */
  requires?: string[]
  acceptsPayAsset?: boolean
  acceptsReceiveAsset?: boolean
  /** Settles later — the client must poll rather than treat the tx as final. */
  async?: boolean
  feeBps?: number
  /**
   * Assets this action accepts. Present ⇒ the pay-asset picker must be LIMITED
   * to these — offering anything else builds a call the venue cannot serve.
   */
  inputs?: EarnActionInput[]
}

export interface EarnRefs {
  marketUid?: string
  borrowable?: boolean
  exposures?: unknown[]
}

export interface EarnProtocol {
  /** Venue key — `AAVE_V3`, `vault.morpho`. */
  key: string
  /** Display name — `Aave V3`, `Morpho`. */
  name: string
}

export interface EarnCurator {
  name?: string
  entity?: string
}

/**
 * A position whose unit is a POOL POSITION over several tokens.
 *
 * Mirrors `@1delta/margin-fetcher`'s `EarnBasket` verbatim — see
 * EARN_ENDPOINT_PLAN.md §4.2b. Two fields carry the whole meaning:
 *
 *  - `autoBalanced` — the composition is POOL-controlled and drifts, and the
 *    holder cannot take one leg out on its own. This is what a drift warning
 *    fires on; it is NOT implied by `legs.length > 1`.
 *  - `rowAsset` — whether this row is one LEG of the pool (Fluid emits one row
 *    per leg, so a T4 emits up to four rows for ONE vault and a naive sum
 *    counts it four times) or the position itself (Lista SmartLP, GMX GM).
 */
export interface EarnBasket {
  rowAsset: 'leg' | 'positionUnit'
  /** POOL INDEX ORDER — load-bearing; a two-input deposit form maps positionally. */
  legs: EarnBasketLeg[]
  autoBalanced: boolean
  positionUnit?: { kind: 'shares' | 'lpToken'; address?: string; decimals: number }
  /** Current split BY VALUE — a snapshot of a moving number. Never cache it. */
  weights?: number[]
  /** `fluid-dex` | `lista-smartlp` | `gmx-gm` | `curve` | `uniswap-v2` | … */
  pool?: string
  feeBps?: number
}

export interface EarnBasketLeg {
  address: string
  symbol?: string
  decimals?: number
  assetGroup?: string
  /** This leg's OWN rate, PERCENT — what the row's `rate.total` was blended from. */
  rate?: number
}

export interface EarnMarket {
  /** Opaque primary key. Pass back verbatim; never split it. */
  earnUid: string
  chainId: string
  venue: EarnVenue
  venueKind: EarnVenueKind
  /** Curator where one exists, else the protocol. One string for display. */
  brand?: string
  /**
   * The row's provenance, ready to render: `Gauntlet · Morpho · Vaults`.
   *
   * **Do not compose this from `curator` / `brand` / `venueKind` here.** That
   * is what this app used to do, and it broke when `protocol.name` became
   * version-free for grouping — Aave V2 and Aave V3 rows started reading
   * identically, and nothing client-side could catch it because the rule lives
   * on the server.
   */
  subtitle?: string
  /**
   * What the venue is BUILT ON. A MetaMorpho vault and a Euler Earn vault both
   * display as their curator, so without this nothing says which lending stack
   * the deposit lands in.
   */
  protocol?: EarnProtocol
  /** Who RUNS this instance. Absent ⇒ uncurated. */
  curator?: EarnCurator
  name?: string
  ref: string
  logoURI?: string
  asset: EarnAsset
  shareToken?: EarnShareToken
  /**
   * Present when the row's POSITION is a multi-token pool position rather than
   * a balance of `asset` — Fluid smart collateral, Lista SmartLP, GMX GM/GLV,
   * and any Curve/Uniswap LP that follows.
   *
   * `asset` stays what the user hands over. What it stops being is what they
   * end up HOLDING, and nothing else on the row says so.
   */
  basket?: EarnBasket
  rate: EarnRate
  tvl: EarnAmount
  liquidity?: EarnAmount
  /** `undefined` = uncapped, `'0'` = full. */
  depositCapacity?: string
  utilization?: number
  termSheet?: unknown
  exit: EarnExit
  availability: EarnAvailability
  risk?: EarnRisk
  capabilities: EarnCapability[]
  refs?: EarnRefs
  providerMeta?: Record<string, unknown>
}

export interface EarnFacetBucket {
  /** Send this back as the filter value. */
  key: string
  /**
   * Display label, supplied by the server. **Render `label ?? key`** — never a
   * local lookup table, and never a `switch`. A value this app has never seen
   * then renders as itself instead of as blank or a wrong guess.
   */
  label?: string
  /** One-line explanation, where the dimension has one. */
  description?: string
  count: number
}

/**
 * The server's filter vocabulary. Every dropdown in the Unified tab is built
 * from this — see the note at the top of this file.
 */
export interface EarnFacets {
  /** The protocol each row is built on — groups vaults with their own stack. */
  protocols: EarnFacetBucket[]
  /**
   * Third parties that RUN an instance — Steakhouse Financial, Gauntlet.
   *
   * Distinct from `brands`, which falls back to the protocol and therefore
   * mixes the two. Only genuinely curated rows appear here.
   */
  curators: EarnFacetBucket[]
  /**
   * Underlying assets by SYMBOL. Keyed by symbol rather than `assetGroup`,
   * which is frequently null and left the asset dropdown mostly empty.
   */
  assets: EarnFacetBucket[]
  /** Venues grouped by brand — what the filter UI should offer. */
  brands: EarnFacetBucket[]
  venues: EarnFacetBucket[]
  venueKinds: EarnFacetBucket[]
  chains: EarnFacetBucket[]
  assetGroups: EarnFacetBucket[]
  exitModes: EarnFacetBucket[]
  actions: EarnFacetBucket[]
}

export interface EarnSourceStatus {
  source: 'pools' | 'vaults'
  status: 'ok' | 'degraded' | 'failed'
  rows: number
  error?: string
}

export interface EarnResponse {
  ok: boolean
  start: number
  count: number
  total: number
  rateUnit: 'percent'
  items: EarnMarket[]
  sources: EarnSourceStatus[]
  /** Rows the endpoint removed by default — offer them back, do not hide. */
  excluded: EarnExclusions
  appliedDefaults?: EarnAppliedDefaults
  facets: EarnFacets
}

export interface EarnExclusions {
  passthrough: number
  illiquid: number
  lowTvl: number
  highRisk: number
}

/**
 * What the server filtered WITHOUT being asked.
 *
 * Echoed so a default is never invisible — an unseen filter is
 * indistinguishable from missing data, which is how a user concludes a market
 * disappeared.
 */
export interface EarnAppliedDefaults {
  minTvlUsd: number
  maxRiskScore: number
  excludePassthrough: boolean
  excludeIlliquid: boolean
}

export const EMPTY_FACETS: EarnFacets = {
  protocols: [],
  curators: [],
  assets: [],
  brands: [],
  venues: [],
  venueKinds: [],
  chains: [],
  assetGroups: [],
  exitModes: [],
  actions: [],
}

/**
 * The display vocabulary from `GET /v1/data/earn/facets`.
 *
 * `labels[dimension][key] → text`, where dimension is one of `venueKind`,
 * `exitMode`, `action`, `gating`, `rateKind`, `rateSource`. The dimension names
 * are the only strings this app hard-codes, and they name *which lookup*, not
 * *which values* — new venues, modes and gating reasons all arrive as data.
 */
export interface EarnVocabulary {
  labels: Record<string, Record<string, string>>
  descriptions: Record<string, Record<string, string>>
}

export const EMPTY_VOCABULARY: EarnVocabulary = { labels: {}, descriptions: {} }

/** Resolve a label, falling back to the raw key. See {@link EarnVocabulary}. */
export function vocabLabel(
  vocab: EarnVocabulary,
  dimension: string,
  key: string | undefined
): string {
  if (!key) return ''
  return vocab.labels?.[dimension]?.[key] ?? key
}

export function vocabDescription(
  vocab: EarnVocabulary,
  dimension: string,
  key: string | undefined
): string | undefined {
  if (!key) return undefined
  return vocab.descriptions?.[dimension]?.[key]
}
