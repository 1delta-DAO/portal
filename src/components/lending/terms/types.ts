/**
 * Term-sheet types, mirroring the API's `termSheet` field.
 *
 * Kept as a local copy rather than importing from `@1delta/margin-fetcher`
 * because the portal deliberately depends only on `chain-registry` and
 * `providers` — pulling the whole fetcher in for a type would be a large
 * bundle cost for no runtime benefit.
 *
 * ## The rule this file exists to enforce
 *
 * Every string union below is OPEN (`| (string & {})`). The API adds enum
 * members additively — a new lender introduces a new `RateKind` or
 * `SupplyExitMode` without a version bump — so a `switch` here MUST have a
 * `default` branch. When it hits one, fall back to `info.headline`, which the
 * API always populates for exactly this purpose.
 */

export type Open<T extends string> = T | (string & {})

export type TermTag = Open<
  | 'fixed-rate'
  | 'variable-rate'
  | 'user-set-rate'
  | 'zero-interest'
  | 'prepaid-interest'
  | 'nav-accrual'
  | 'has-maturity'
  | 'perpetual'
  | 'rolling-duration'
  | 'static-debt'
  | 'accruing-debt'
  | 'time-liquidation'
  | 'price-liquidation'
  | 'redeemable'
  | 'no-liquidation'
  | 'full-collateral-seizure'
  | 'early-exit-free'
  | 'early-exit-penalty'
  | 'early-exit-discount'
  | 'exit-instant'
  | 'exit-capped'
  | 'exit-cooldown'
  | 'exit-queued'
  | 'exit-market-sale'
  | 'exit-may-be-impossible'
  | 'permissioned'
  | 'capped'
  | 'cap-full'
  | 'first-loss'
  | 'socialized-loss'
  | 'physical-delivery'
  | 'undercollateralized'
  | 'nav-attested'
  | 'immutable'
  | 'no-timelock'
  | 'eoa-controlled'
  | 'points-rewards'
  | 'oracle-flagged'
  | 'no-oracle'
>

export interface TermAssetRef {
  chainId: string
  address: string
  symbol?: string
  name?: string
  decimals?: number
  assetGroup?: string
  logoURI?: string
}

export interface TermInfo {
  /** Always populated — the graceful-degradation path for unknown enums. */
  headline: string
  description: string
  /** Ordered most-important-first by the API's severity model. */
  implications?: string[]
  tags: TermTag[]
}

export interface RewardTerm {
  asset?: TermAssetRef
  kind: Open<'token' | 'points' | 'unknown'>
  apr: number
  side: 'supply' | 'borrow'
  claim: Open<'accrual' | 'merkl' | 'manual' | 'none'>
  endsAt?: number
  /** Points — not priceable, and deliberately excluded from `aprTotal`. */
  indicative?: boolean
}

export interface RateMenuEntry {
  termId: number
  durationSecs: number
  durationDays: number
  apr: number
  depositApr?: number
  available?: number
}

export interface RateTerms {
  kind: Open<
    | 'variable-curve'
    | 'variable-managed'
    | 'user-set'
    | 'fixed-term'
    | 'fixed-open'
    | 'zero-interest'
    | 'prepaid'
    | 'nav-accrual'
    | 'none'
  >
  apr: number
  components: { base: number; rewards?: number; intrinsic?: number }
  aprTotal: number
  basis: 'apr-nominal'
  compounding: Open<'per-second' | 'per-block' | 'none' | 'unknown'>
  source: Open<string>
  isLocked: boolean
  minApr?: number
  maxApr?: number
  /** `kind: 'user-set'` — the contract a rate INPUT needs (Liquity family). */
  userSet?: {
    required: boolean
    min?: number
    max?: number
    /** What the protocol applies if the caller omits a rate. Pre-fill this. */
    default?: number
    adjustable: boolean
    adjustmentCostNote?: string
    adjustmentCooldownSecs?: number
  }
  rewards?: RewardTerm[]
  menu?: RateMenuEntry[]
  quote?: { assets: number; basis: Open<'marginal' | 'average'> }
}

export interface MaturityTerms {
  kind: Open<'perpetual' | 'fixed-date' | 'rolling-duration'>
  maturity?: number
  maturityIso?: string
  secondsToMaturity?: number
  minDurationSecs?: number
  maxDurationSecs?: number
  atMaturity?: Open<
    | 'stops-earning'
    | 'penalty-accrues'
    | 'liquidatable'
    | 'default-seizure'
    | 'physical-delivery'
    | 'refinanced'
    | 'auto-roll'
    | 'none'
  >
  graceSecs?: number
}

export interface FeeTerm {
  id: Open<string>
  /** Self-describing, so an unrecognised `id` still renders correctly. */
  label: string
  when: Open<'entry' | 'ongoing' | 'exit' | 'late' | 'liquidation' | 'performance'>
  unit: Open<'apr-percent' | 'percent' | 'bps' | 'absolute'>
  basis: Open<string>
  /** NEGATIVE means a rebate — sign is load-bearing, never take an absolute. */
  value: number
  payee?: Open<string>
  mutable?: boolean
  indicative?: boolean
  schedule?: { afterSecs: number; value: number }[]
  description?: string
}

export interface SupplyExitTerms {
  mode: Open<
    | 'instant'
    | 'instant-capped'
    | 'instant-or-queued'
    | 'fee-or-queued'
    | 'fixed-cooldown'
    | 'queued'
    | 'request-based'
    | 'market-sale'
    | 'at-maturity'
    | 'off-chain'
    | 'dex-only'
  >
  settlement: Open<'sync' | 'async'>
  cooldownSecs?: number
  claimWindow?: { earliestSecs?: number; freeAfterSecs?: number }
  liquidity?: { assets: number; assetsUsd?: number; ratio?: number }
  partialAllowed: boolean
  priceRisk: Open<'none' | 'haircut-formula' | 'market-price' | 'may-be-impossible'>
  cancellable?: boolean
  fees: FeeTerm[]
}

export interface BorrowExitTerms {
  earlyRepay: Open<'free' | 'discount' | 'penalty' | 'market-price' | 'not-allowed'>
  atMaturityCost: Open<'face' | 'accrued'>
  lateBehaviour: Open<
    'penalty-accrues' | 'liquidatable' | 'default-seizure' | 'refinanced' | 'none'
  >
  partialAllowed: boolean
  minDebt?: string
  overRepayReverts?: boolean
  fees: FeeTerm[]
}

export interface LiquidationPenaltyTerm {
  id: Open<string>
  label: string
  /** Fraction of repaid debt (0.05 = 5 %). */
  value: number
  description?: string
}

/**
 * Redemption — collateral taken from a HEALTHY position.
 *
 * The effect alone ("your collateral can be taken") reads as a governance
 * power or a bug. On every lender we serve it is neither: a permissionless
 * arbitrage that defends the stablecoin's peg. These fields are what turn the
 * warning into something a borrower can act on.
 */
export interface RedemptionTerms {
  /** WHO can trigger it — `permissionless-arbitrage` on every lender today. */
  trigger: Open<'permissionless-arbitrage' | 'governance' | 'protocol'>
  /** WHEN it pays them to. `below-peg` = only while the token is under target. */
  driver?: Open<'below-peg' | 'always'>
  /**
   * WHICH positions get hit. `lowest-rate-first` means your rate IS your queue
   * position; `pro-rata` means every borrower is skimmed and there is nothing
   * to out-run.
   */
  order: Open<'lowest-rate-first' | 'pro-rata' | 'lowest-collateral-ratio'>
  /** `usd-neutral` — you lose EXPOSURE, not value. Do not say "lose your collateral". */
  valueImpact?: Open<'usd-neutral' | 'loss'>
  /** What the borrower can do. Absent ⇒ nothing (pro-rata). */
  defence?: string
}

export interface LiquidationTerms {
  /** HOW liquidation happens — distinct from what TRIGGERS it. */
  model?: Open<
    | 'repay-seize'
    | 'soft-band'
    | 'stability-pool'
    | 'auction'
    | 'default-seizure'
    | 'delivery'
    | 'none'
  >
  absorber?: Open<'liquidator' | 'stability-pool' | 'other-borrowers' | 'lenders' | 'amm'>
  /** `soft-band` only: conversion is gradual AND reverses if price recovers. */
  reversible?: boolean
  /** Named penalties when one number cannot express the model. */
  penalties?: LiquidationPenaltyTerm[]
  windowSecs?: number
  permissioned?: boolean
  badDebt?: Open<
    'socialized' | 'redistributed' | 'insurance-fund' | 'protocol-absorbed' | 'unknown'
  >
  /** `soft-band`: collateral factor as a function of band count. */
  bandLtv?: Record<string, number>
  defaultBands?: number
  fullCloseBelowHealthFactor?: number
  trigger: Open<'price' | 'time' | 'price-and-time' | 'redemption' | 'none'>
  ltv?: number
  liquidationLtv?: number
  penalty: number
  closeFactor: number
  targetHealthFactor?: number
  seizure: Open<'proportional' | 'full-collateral'>
  redeemable?: boolean
  /** How redemption works, when `redeemable`. */
  redemption?: RedemptionTerms
  gracePeriodSecs?: number
}

export type OracleBand = Open<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>

export interface AssetQuality {
  riskScore?: number
  source?: Open<string>
  liquidityUsd?: number
  governanceScore?: number
  governanceLevel?: Open<'green' | 'amber' | 'red'>
  upgradeable?: boolean
  canPause?: boolean
  adminKind?: Open<string>
}

export interface OracleTerms {
  /** `none` is a FACT (Teller liquidates on time), not missing data. */
  kind: Open<'price-feed' | 'nav-attested' | 'none'>
  /** Singular by construction at `marketUid` granularity. */
  address?: string
  components?: string[]
  provider?: string
  priceDescription?: string
  intendedPair?: string
  correctAsset?: boolean | null
  correctNumeraire?: boolean | null
  fixedRate?: boolean
  score?: number
  band?: OracleBand
  flags?: string[]
  mutability?: {
    mutable: boolean
    kind: Open<string>
    controller?: string
    controllerKind?: Open<string>
    timelockSecs?: number
  }
  heartbeatSecs?: number
  lastUpdateAt?: number
}

export interface ExposureEntry {
  asset: TermAssetRef
  marketUid?: string
  via: Open<'collateral' | 'vault-allocation' | 'strategy' | 'idle'>
  assets?: number
  assetsUsd?: number
  /** Absent when `weightBasis === 'unweighted'`. */
  weightPct?: number
  ltv?: number
  liquidationLtv?: number
  liquidationPenalty?: number
  oracle?: OracleTerms
  quality?: AssetQuality
}

export interface ExposureTerms {
  count: number
  /** `unweighted` ⇒ the accepted SET, not a measured split. No pie charts. */
  weightBasis: Open<'debt' | 'allocation' | 'unweighted'>
  worstRiskScore?: number
  worstOracleBand?: OracleBand
  topWeightPct?: number
  /** Absent in `?terms=digest` — resolve via each item's `marketUid`. */
  items?: ExposureEntry[]
}

export interface UtilizationTerms {
  utilization: number
  basis: Open<'market' | 'hub' | 'liquidity-layer' | 'pool'>
  irmTotalDeposits?: number
  irmTotalDebt?: number
  targetUtilization?: number
  kinkUtilization?: number
  supplyCapUtilization?: number
  borrowCapUtilization?: number
  lockupRatio?: number
}

export interface GovernanceTerms {
  mutability: Open<'immutable' | 'governed' | 'unknown'>
  controller?: string
  controllerKind?: Open<
    'EOA' | 'SAFE' | 'TIMELOCK' | 'GOVERNOR' | 'GOVERNANCE' | 'CUSTOM' | 'UNKNOWN'
  >
  safe?: { threshold: number; owners: number }
  /**
   * The NOTICE period before a parameter change takes effect.
   * NOT a withdrawal lock — that is `SupplyExitTerms.cooldownSecs`. Never sum
   * or conflate the two.
   */
  timelockSecs?: number
  timelockSource?: Open<string>
  tier?: Open<'low' | 'medium' | 'high' | 'unknown'>
  score?: number
  powers?: Open<string>[]
  roles?: {
    owner?: string
    curator?: string
    guardian?: string
    feeRecipient?: string
  }
  asOfScreen?: number
}

export interface ModeVariant {
  modeId: string
  label?: string
  isDefault: boolean
  entry?: Open<'automatic' | 'user-selected' | 'per-position'>
  liquidation?: Partial<LiquidationTerms>
  acceptedCollateral?: ExposureTerms
  rate?: Partial<RateTerms>
  availability?: Partial<AvailabilityTerms>
}

export interface AvailabilityTerms {
  /** Gate CTAs on THIS and nothing else. */
  canOpen: boolean
  canClose: boolean
  blockedBy?: Open<string>
  gating: Open<'permissionless' | 'whitelist' | 'attestation' | 'kyc' | 'allowlist-contract'>
  window?: {
    status: Open<string>
    canBorrow: boolean
    canLend: boolean
    secondsUntilClose?: number
    revealTime?: number
    minBorrowAmount?: string
    minLendAmount?: string
  }
  minSize?: string
  cap?: string
  capUtilization?: number
  requires?: Open<string>[]
}

export interface PositionConstraints {
  isolation?: { enabled: boolean; debtCeiling?: string; ceilingUtilization?: number }
  siloedBorrowing?: boolean
  crossMargin: boolean
  positionModel: Open<'account' | 'sub-account' | 'nft' | 'cdp-id' | 'loan-id' | 'escrow'>
  positionIdMeaning?: string
  maxPositions?: number
}

export interface SupplyTermSheet {
  role: Open<'yield' | 'collateral' | 'both'>
  rate: RateTerms
  maturity: MaturityTerms
  exit: SupplyExitTerms
  fees: FeeTerm[]
  backedBy?: ExposureTerms
  modes?: ModeVariant[]
  counterparty: {
    kind: Open<string>
    address?: string
    solvency: Open<
      | 'overcollateralized'
      | 'tranched-senior'
      | 'tranched-junior'
      | 'undercollateralized'
      | 'nav-attested'
    >
    socializedLoss?: boolean
    curator?: string
  }
  availability: AvailabilityTerms
  principal: { protected: boolean; risks: Open<string>[] }
  info: TermInfo
}

export interface BorrowTermSheet {
  rate: RateTerms
  maturity: MaturityTerms
  debtShape: Open<'accruing' | 'static-face' | 'prepaid'>
  exit: BorrowExitTerms
  liquidation: LiquidationTerms
  acceptedCollateral?: ExposureTerms
  modes?: ModeVariant[]
  fees: FeeTerm[]
  counterparty: SupplyTermSheet['counterparty']
  availability: AvailabilityTerms
  info: TermInfo
}

export interface CoverageInfo {
  present: string[]
  /** Does not apply here — a positive fact. */
  notApplicable?: Record<string, string>
  /** Would apply but is not wired yet — NOT a claim of absence. */
  pending?: Record<string, string>
}

export interface TermSheet {
  schemaVersion: number
  asOf: number
  profileId: string
  marketUid?: string
  lender?: string
  chainId?: string
  /**
   * The market's own underlying asset. Required to render `minSize` / `cap` /
   * `minDebt`, which are all RAW base units.
   */
  asset?: TermAssetRef
  supply?: SupplyTermSheet
  borrow?: BorrowTermSheet
  governance?: GovernanceTerms
  oracle?: OracleTerms
  utilization?: UtilizationTerms
  constraints?: PositionConstraints
  coverage?: CoverageInfo
}

/** The `?terms=digest` shape — same fields, `items[]` and prose omitted. */
export interface TermSheetDigest {
  schemaVersion: number
  profileId: string
  marketUid?: string
  supply?: {
    rateKind: RateTerms['kind']
    aprTotal: number
    maturityKind: MaturityTerms['kind']
    maturity?: number
    exitMode: SupplyExitTerms['mode']
    settlement: SupplyExitTerms['settlement']
    canOpen: boolean
    headline: string
    tags: TermTag[]
    backedBy?: Omit<ExposureTerms, 'items'>
  }
  borrow?: {
    rateKind: RateTerms['kind']
    apr: number
    maturityKind: MaturityTerms['kind']
    maturity?: number
    debtShape: BorrowTermSheet['debtShape']
    earlyRepay: BorrowExitTerms['earlyRepay']
    liquidationTrigger: LiquidationTerms['trigger']
    canOpen: boolean
    headline: string
    tags: TermTag[]
    acceptedCollateral?: Omit<ExposureTerms, 'items'>
  }
  oracle?: Pick<OracleTerms, 'kind' | 'address' | 'provider' | 'band'>
  governance?: Pick<GovernanceTerms, 'mutability' | 'controllerKind' | 'timelockSecs' | 'tier'>
  utilization?: number
}

export type TermSide = 'supply' | 'borrow'

// ---------------------------------------------------------------------------
// Shape-agnostic access
// ---------------------------------------------------------------------------

/**
 * What actually arrives on a market row.
 *
 * The API serves `?terms=digest` BY DEFAULT on the list endpoints, so a row's
 * `termSheet` is usually a {@link TermSheetDigest}, not a {@link TermSheet} —
 * and the two differ structurally: the full sheet nests `info.headline` /
 * `info.tags`, the digest hoists `headline` / `tags` to the side root and has
 * no `info` at all.
 *
 * Typing this as `TermSheet` and reading `sheet.supply.info.tags` is a crash,
 * not a type error, because the field is `any` by the time it crosses the
 * network. Always go through {@link sideInfo} / {@link isFullSheet}.
 */
export type AnyTermSheet = TermSheet | TermSheetDigest

/** Is this the full sheet (nested blocks) rather than the digest? */
export function isFullSheet(sheet: AnyTermSheet | undefined): sheet is TermSheet {
  if (!sheet) return false
  const side = (sheet as TermSheet).supply ?? (sheet as TermSheet).borrow
  return !!side && typeof (side as SupplyTermSheet).info === 'object'
}

/**
 * The headline / tags / implications for one side, from EITHER shape.
 * Returns `undefined` when the side is absent — which is meaningful: no
 * `borrow` means the market cannot be borrowed.
 */
export function sideInfo(sheet: AnyTermSheet | undefined, side: TermSide): TermInfo | undefined {
  const s = sheet?.[side] as (Partial<TermInfo> & { info?: TermInfo }) | undefined
  if (!s) return undefined
  // Full sheet: nested. Digest: hoisted to the side root.
  if (s.info) return s.info
  if (s.headline != null || s.tags != null) {
    return {
      headline: s.headline ?? '',
      description: s.description ?? '',
      implications: s.implications,
      tags: s.tags ?? [],
    }
  }
  return undefined
}

/** The full supply block, or `undefined` when only a digest is available. */
export function fullSupply(sheet: AnyTermSheet | undefined): SupplyTermSheet | undefined {
  return isFullSheet(sheet) ? sheet.supply : undefined
}

/** The full borrow block, or `undefined` when only a digest is available. */
export function fullBorrow(sheet: AnyTermSheet | undefined): BorrowTermSheet | undefined {
  return isFullSheet(sheet) ? sheet.borrow : undefined
}

/** Does the sheet describe this side at all, in either shape? */
export function hasSide(sheet: AnyTermSheet | undefined, side: TermSide): boolean {
  return !!sheet?.[side]
}
