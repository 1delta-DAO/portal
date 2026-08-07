import type {
  ExposureTerms,
  RedemptionTerms,
  FeeTerm,
  GovernanceTerms,
  MaturityTerms,
  OracleBand,
  SupplyExitTerms,
  TermTag,
} from './types'

/**
 * Display formatting for term sheets.
 *
 * Every mapping here is a lookup with a `default` that degrades to something
 * correct-but-generic, never a crash and never an empty cell. That is what
 * lets the portal render a term sheet from a lender this build has never heard
 * of — see `terms/README.md`.
 */

/**
 * Format an already-PERCENT value (`49.88` → `"49.88%"`).
 *
 * Never pass a fraction — `0.4988` renders as `"0.5%"`, not `"49.88%"`. The
 * convention across the term sheet is: **rates are percent, factors/ratios are
 * fractions**, so anything named `*Ltv`, `penalty`, `utilization`, `*Ratio` or
 * `*Utilization` must be multiplied by 100 at the call site.
 *
 * Trailing zeros are trimmed only inside the FRACTIONAL part. A naive
 * `/\.?0+$/` strip eats integer zeros when `dp = 0` leaves no decimal point —
 * `pct(100, 0)` produced `"1%"` and `pct(1000, 0)` produced `"1%"`.
 */
export function pct(value: number | undefined | null, dp = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const fixed = Number(value).toFixed(dp)
  // Only touch the string when `toFixed` actually produced a decimal point.
  const trimmed = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
  return `${trimmed === '' || trimmed === '-' ? '0' : trimmed}%`
}

export function duration(secs: number | undefined | null): string {
  if (secs == null || !Number.isFinite(secs) || secs < 0) return '—'
  if (secs === 0) return 'none'
  if (secs >= 86_400) {
    const d = secs / 86_400
    return `${d % 1 === 0 ? d : d.toFixed(1)}d`
  }
  if (secs >= 3_600) {
    const h = secs / 3_600
    return `${h % 1 === 0 ? h : h.toFixed(1)}h`
  }
  if (secs >= 60) return `${Math.round(secs / 60)}min`
  return `${Math.round(secs)}s`
}

export function shortDate(unixSecs: number | undefined): string {
  if (unixSecs == null || !Number.isFinite(unixSecs)) return '—'
  return new Date(unixSecs * 1000).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function shortAddress(addr?: string): string {
  if (!addr) return '—'
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------

/**
 * A fee amount. `FeeTerm` carries its own `label`, `unit` and `basis`, which is
 * precisely why an unrecognised `id` still renders correctly — the fallback
 * branch is the common case for a newly added fee, not an error path.
 */
export function feeAmount(fee: FeeTerm): string {
  const magnitude = Math.abs(fee.value)
  switch (fee.unit) {
    case 'bps':
      return `${magnitude} bps`
    case 'apr-percent':
      return `${pct(magnitude)}/yr`
    case 'percent':
      return pct(magnitude)
    default:
      return String(magnitude)
  }
}

/** A NEGATIVE fee is a rebate. Sign is load-bearing — never abs() it away. */
export function isRebate(fee: FeeTerm): boolean {
  return fee.value < 0
}

// ---------------------------------------------------------------------------
// Enum → label
// ---------------------------------------------------------------------------

const EXIT_LABEL: Record<string, string> = {
  instant: 'Instant',
  'instant-capped': 'Instant, up to available liquidity',
  'instant-or-queued': 'Instant or queued',
  'fee-or-queued': 'Instant for a fee, or queued free',
  'fixed-cooldown': 'After a cooldown',
  queued: 'Queued',
  'request-based': 'Request, then claim',
  'market-sale': 'Sell on the market',
  'at-maturity': 'Only at maturity',
  'off-chain': 'Off-chain',
  'dex-only': 'Via a DEX only',
}

export function exitLabel(mode: SupplyExitTerms['mode']): string {
  return EXIT_LABEL[String(mode)] ?? String(mode).replace(/-/g, ' ')
}

const PRICE_RISK_LABEL: Record<string, string> = {
  none: 'At par',
  'haircut-formula': 'At a formula-priced discount',
  'market-price': 'At whatever the market bids',
  'may-be-impossible': 'Only if a buyer exists — there may be none',
}

export function priceRiskLabel(risk: SupplyExitTerms['priceRisk']): string {
  return PRICE_RISK_LABEL[String(risk)] ?? String(risk).replace(/-/g, ' ')
}

const EARLY_REPAY_LABEL: Record<string, string> = {
  free: 'Free — repay any time',
  discount: 'Rebated — repaying early costs LESS than face',
  penalty: 'Penalised',
  'market-price': 'At the market price',
  'not-allowed': 'Not possible before maturity',
}

export function earlyRepayLabel(v: string): string {
  return EARLY_REPAY_LABEL[v] ?? v.replace(/-/g, ' ')
}

const AT_MATURITY_LABEL: Record<string, string> = {
  'stops-earning': 'Stops earning — no penalty, no expiry',
  'penalty-accrues': 'A late penalty starts accruing',
  liquidatable: 'Becomes liquidatable regardless of health',
  'default-seizure': 'Defaults — the collateral is forfeit',
  'physical-delivery': 'Collateral is delivered to lenders',
  refinanced: 'A keeper refinances it into the variable position',
  'auto-roll': 'Rolls into a new term',
  none: 'Nothing happens',
}

export function atMaturityLabel(v: MaturityTerms['atMaturity']): string {
  if (!v) return '—'
  return AT_MATURITY_LABEL[String(v)] ?? String(v).replace(/-/g, ' ')
}

const TRIGGER_LABEL: Record<string, string> = {
  price: 'Price',
  time: 'TIME — being late, not price',
  'price-and-time': 'Price AND time',
  redemption: 'Redemption',
  none: 'None',
}

export function triggerLabel(v: string): string {
  return TRIGGER_LABEL[v] ?? v.replace(/-/g, ' ')
}

const RATE_KIND_LABEL: Record<string, string> = {
  'variable-curve': 'Variable',
  'variable-managed': 'Governance-set',
  'user-set': 'You choose',
  'fixed-term': 'Fixed',
  'fixed-open': 'Fixed',
  'zero-interest': 'No interest',
  prepaid: 'Prepaid',
  'nav-accrual': 'NAV',
  none: 'None',
}

export function rateKindLabel(v: string): string {
  return RATE_KIND_LABEL[v] ?? 'Variable'
}

const DEBT_SHAPE_LABEL: Record<string, string> = {
  accruing: 'Grows as interest accrues',
  'static-face': 'Fixed at trade time — does not grow',
  prepaid: 'Static; interest prepaid in a separate token',
}

export function debtShapeLabel(v: string): string {
  return DEBT_SHAPE_LABEL[v] ?? v.replace(/-/g, ' ')
}

const SOLVENCY_LABEL: Record<string, string> = {
  overcollateralized: 'Over-collateralised',
  'tranched-senior': 'Senior tranche',
  'tranched-junior': 'Junior tranche — first loss',
  undercollateralized: 'Under-collateralised credit',
  'nav-attested': 'Operator-published NAV',
}

export function solvencyLabel(v: string): string {
  return SOLVENCY_LABEL[v] ?? v.replace(/-/g, ' ')
}

const BLOCKED_LABEL: Record<string, string> = {
  frozen: 'market frozen',
  paused: 'paused',
  'cap-full': 'cap reached',
  'auction-closed': 'no auction round open',
  'no-liquidity': 'no liquidity',
  'not-whitelisted': 'not whitelisted',
  shutdown: 'market shut down',
  disabled: 'disabled',
}

export function blockedLabel(v?: string): string {
  if (!v) return 'unavailable'
  return BLOCKED_LABEL[v] ?? v.replace(/-/g, ' ')
}

/** Short, human tag labels for chips. Unknown tags render de-kebabed. */
const TAG_LABEL: Record<string, string> = {
  'fixed-rate': 'Fixed rate',
  'variable-rate': 'Variable rate',
  'user-set-rate': 'You set the rate',
  'zero-interest': 'No interest',
  'prepaid-interest': 'Prepaid interest',
  'nav-accrual': 'NAV-priced',
  'has-maturity': 'Has maturity',
  perpetual: 'No maturity',
  'rolling-duration': 'Rolling term',
  'static-debt': 'Static debt',
  'accruing-debt': 'Accruing debt',
  'time-liquidation': 'Time-based liquidation',
  'price-liquidation': 'Price liquidation',
  redeemable: 'Redeemable while healthy',
  'no-liquidation': 'No liquidation',
  'full-collateral-seizure': 'Full collateral seizure',
  'early-exit-free': 'Free early exit',
  'early-exit-penalty': 'Early-exit penalty',
  'early-exit-discount': 'Early-exit rebate',
  'exit-instant': 'Instant exit',
  'exit-capped': 'Capped exit',
  'exit-cooldown': 'Exit cooldown',
  'repay-locked': 'Repayment locked',
  'exit-queued': 'Queued exit',
  'exit-market-sale': 'Exit by market sale',
  'exit-may-be-impossible': 'Exit may be impossible',
  permissioned: 'Permissioned',
  capped: 'Capped',
  'cap-full': 'Cap full',
  'first-loss': 'First-loss capital',
  'socialized-loss': 'Socialised losses',
  'physical-delivery': 'Physical delivery',
  undercollateralized: 'Under-collateralised',
  'nav-attested': 'NAV-attested',
  immutable: 'Immutable',
  'no-timelock': 'No timelock',
  'eoa-controlled': 'EOA-controlled',
  'points-rewards': 'Includes points',
  // Yield PROVENANCE. Both read as plain statements rather than warnings —
  // intrinsic yield is not a defect, it just is not this market paying you.
  'intrinsic-yield': 'Mostly asset yield',
  'no-market-interest': 'Market pays no interest',
  'oracle-flagged': 'Oracle flagged',
  'no-oracle': 'No oracle',
}

export function tagLabel(tag: TermTag): string {
  return TAG_LABEL[String(tag)] ?? String(tag).replace(/-/g, ' ')
}

// ---------------------------------------------------------------------------
// Governance + oracle + exposures
// ---------------------------------------------------------------------------

/**
 * The governance line as a sentence. `timelockSecs` is the NOTICE period, not
 * a withdrawal lock — the wording keeps that distinction explicit because the
 * two sitting near each other in a UI is exactly how they get confused.
 */
export function governanceSentence(g: GovernanceTerms | undefined): string {
  if (!g) return 'Not screened yet.'
  if (g.mutability === 'immutable') return 'Immutable — no one can change this market’s parameters.'

  const who =
    g.controllerKind === 'SAFE' && g.safe
      ? `a ${g.safe.threshold}-of-${g.safe.owners} multisig`
      : g.controllerKind === 'EOA'
        ? 'a single private key'
        : g.controllerKind === 'TIMELOCK'
          ? 'a timelock'
          : g.controllerKind === 'GOVERNOR' || g.controllerKind === 'GOVERNANCE'
            ? 'on-chain governance'
            : 'an unidentified controller'

  const notice =
    g.timelockSecs && g.timelockSecs > 0
      ? `with ${duration(g.timelockSecs)} of notice`
      : 'with **no notice period**'

  return `Parameters can be changed by ${who} ${notice}.`
}

export function oracleBandClass(band: OracleBand | undefined): string {
  switch (band) {
    case 'LOW':
      return 'text-success'
    case 'MEDIUM':
      return 'text-warning'
    case 'HIGH':
    case 'CRITICAL':
      return 'text-error'
    default:
      return 'text-base-content/50'
  }
}

/** Asset risk score 1 (best) … 5 (worst) → a colour. */
export function riskScoreClass(score: number | undefined): string {
  if (score == null) return 'text-base-content/50'
  if (score <= 2) return 'text-success'
  if (score === 3) return 'text-warning'
  return 'text-error'
}

/**
 * Summarize an exposure set in one line.
 *
 * `unweighted` gets deliberately different wording: Aave does not record which
 * collateral backs which borrow, so calling it a "split" would be a fabricated
 * measurement. The UI says "accepted", the API says `weightBasis`.
 */
export function exposureSummary(e: ExposureTerms | undefined): string {
  if (!e || e.count === 0) return '—'
  if (e.weightBasis === 'unweighted')
    return `${e.count} accepted collateral asset${e.count === 1 ? '' : 's'}`
  const top = e.topWeightPct != null ? `, largest ${e.topWeightPct.toFixed(0)}%` : ''
  return `${e.count} market${e.count === 1 ? '' : 's'}${top}`
}

const LIQ_MODEL_LABEL: Record<string, string> = {
  'repay-seize': 'A liquidator repays your debt and takes collateral',
  'soft-band': 'Gradual, reversible conversion inside the market’s AMM',
  'stability-pool': 'A Stability Pool absorbs the debt first',
  auction: 'Price discovered by auction',
  'default-seizure': 'The whole escrow is forfeit on a missed payment',
  delivery: 'Unpaid collateral is delivered to lenders',
  none: 'No liquidation',
}

export function liquidationModelLabel(v?: string): string | undefined {
  if (!v) return undefined
  return LIQ_MODEL_LABEL[v] ?? v.replace(/-/g, ' ')
}

const BAD_DEBT_LABEL: Record<string, string> = {
  socialized: 'Socialised across lenders',
  redistributed: 'Redistributed across other borrowers',
  'insurance-fund': 'Covered by an insurance fund',
  'protocol-absorbed': 'Absorbed by the protocol',
  unknown: 'Not known',
}

export function badDebtLabel(v?: string): string | undefined {
  if (!v || v === 'unknown') return undefined
  return BAD_DEBT_LABEL[v] ?? v.replace(/-/g, ' ')
}

/**
 * Format a RAW base-unit string using the market asset's decimals.
 *
 * `minSize`, `cap` and `minDebt` all arrive as raw integers; rendering them
 * unformatted shows a user "2000000000000000000000" as their minimum debt.
 * Returns the raw string only as a last resort, never a wrong number.
 */
export function formatRaw(
  raw: string | undefined,
  decimals: number | undefined,
  symbol?: string
): string | undefined {
  if (!raw) return undefined
  if (decimals == null || !/^\d+$/.test(raw)) return raw
  const n = Number(raw) / 10 ** decimals
  if (!Number.isFinite(n)) return raw
  const shown =
    n >= 1000
      ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : n.toLocaleString(undefined, { maximumSignificantDigits: 4 })
  return symbol ? `${shown} ${symbol}` : shown
}

// ---------------------------------------------------------------------------
// Redemption
// ---------------------------------------------------------------------------

const REDEMPTION_ORDER_LABEL: Record<string, string> = {
  'lowest-rate-first': 'Lowest-rate positions first',
  'pro-rata': 'Every borrower, pro-rata',
  'lowest-collateral-ratio': 'Weakest collateral ratio first',
}

export function redemptionOrderLabel(v?: string): string | undefined {
  if (!v) return undefined
  return REDEMPTION_ORDER_LABEL[v] ?? v.replace(/-/g, ' ')
}

/**
 * One sentence naming what redemption actually IS.
 *
 * Deliberately leads with the trigger rather than the effect: "your collateral
 * can be taken" reads as a governance power, when it is a permissionless
 * arbitrage that only pays while the token trades under its target.
 */
export function redemptionMechanism(r: RedemptionTerms | undefined): string | undefined {
  if (!r) return undefined
  const who =
    r.trigger === 'permissionless-arbitrage'
      ? 'Anyone holding the borrowed token can redeem it for collateral'
      : 'Collateral can be taken from a healthy position'
  const why =
    r.driver === 'below-peg'
      ? ' — peg defence, not a liquidation and not a governance decision. It only pays them while the token trades below target.'
      : '.'
  return `${who}${why}`
}

/** What the borrower actually loses. `usd-neutral` must not read as a loss. */
export function redemptionImpactLabel(v?: string): string | undefined {
  if (v === 'usd-neutral')
    return 'Debt cancelled against the collateral taken — roughly USD-neutral, but you lose collateral exposure.'
  if (v === 'loss') return 'You end up down in USD terms.'
  return undefined
}
