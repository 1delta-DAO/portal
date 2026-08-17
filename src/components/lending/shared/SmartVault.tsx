import React from 'react'
import { Badge } from '../../common/Badge'
import { Logo } from '../../common/Logo'
import {
  hasSmartCollateral,
  hasSmartDebt,
  isAutoBalanced,
  smartInfo,
  vaultTypeLabel,
  type SmartVaultRow,
} from '../../../sdk/lending-helper/fluidSmart'

/**
 * The UI vocabulary for a market side whose position unit is a two-token LP.
 *
 * Everything here renders NOTHING on an ordinary market, so these can be
 * dropped into a shared row or panel without a lender check — which is the
 * point. See `sdk/lending-helper/fluidSmart.ts` for the data model.
 */

/**
 * Why this row is not what it looks like, in one sentence per audience.
 *
 * Deliberately concrete about the CONSEQUENCE rather than the mechanism: a user
 * does not need to know what a Fluid DEX pool is, they need to know that the
 * token they deposit is not the token they will hold.
 */
export function autoBalancedExplainer(row: SmartVaultRow | null | undefined): string {
  const col = hasSmartCollateral(row)
  const debt = hasSmartDebt(row)
  const both = col && debt
  const side = both ? 'Both sides of this market are' : col ? 'Collateral here is' : 'Debt here is'
  return (
    `${side} a two-token liquidity position, not a single asset. ` +
    'Depositing one token gives you a claim on both, the pool keeps rebalancing the ' +
    'split between them, and you cannot hold one leg on its own. ' +
    'The rate shown is the whole position’s, not this token’s.'
  )
}

/**
 * "Auto-balanced LP" pill.
 *
 * Its whole job is to make the ratio drift stop being a surprise — the user
 * finds out at deposit time rather than at withdraw time.
 *
 * TWO THINGS IT DELIBERATELY DOES NOT DO:
 *
 *  - **It does not print the vault type.** `T2`/`T3`/`T4` is Fluid's internal
 *    vocabulary and means nothing to the person reading the row, while costing
 *    ~25 % of the pill's width in a cell that also has to fit a lender name.
 *    It goes in the tooltip, where someone debugging can still reach it — and
 *    keeping it out is what lets the same pill serve Lista SmartLP and GMX
 *    GM/GLV, which have no such types.
 *  - **It does not stretch the row.** daisyUI's `badge-xs` carries its own
 *    height, which reads a size too large next to a `text-[10px]` meta line, so
 *    the height and padding are pinned here.
 */
export const AutoBalancedBadge: React.FC<{
  row: SmartVaultRow | null | undefined
  className?: string
}> = ({ row, className = '' }) => {
  if (!isAutoBalanced(row)) return null
  const type = vaultTypeLabel(row)
  const title = type ? `${autoBalancedExplainer(row)} (Fluid ${type})` : autoBalancedExplainer(row)
  return <AutoBalancedPill title={title} className={className} />
}

/**
 * The pill itself, with no row behind it.
 *
 * Split out because the pair/loop surface knows only a BOOLEAN — the optimizer
 * rows come from `/pairs/optimize`, which carries `isBasketLong` and no vault
 * descriptor — and synthesising a fake `SmartVaultRow` to satisfy the badge
 * would be a lie the next reader has to untangle. It is also what lets Lista
 * SmartLP and GMX GM/GLV reuse this without a Fluid-shaped row.
 *
 * Default copy is the collateral-side wording, which is the only side a
 * caller-with-just-a-boolean can honestly claim.
 */
export const AutoBalancedPill: React.FC<{
  title?: string
  className?: string
}> = ({ title, className = '' }) => (
  <Badge
    tone="info"
    className={`h-4 px-1.5 leading-none whitespace-nowrap ${className}`}
    title={title ?? AUTO_BALANCED_COLLATERAL_EXPLAINER}
  >
    Auto-balanced LP
  </Badge>
)

/** Collateral-side wording for callers that have a flag and nothing else. */
export const AUTO_BALANCED_COLLATERAL_EXPLAINER =
  'Collateral here is a two-token liquidity position, not a single asset. ' +
  'Depositing one token gives you a claim on both, the pool keeps rebalancing ' +
  'the split between them, and you cannot hold one leg on its own. The APR ' +
  'shown is the whole position’s, not this token’s.'

interface LegAsset {
  address: string
  symbol?: string
  logoURI?: string
}

/**
 * The two icons of an LP side, overlapped.
 *
 * TWO ICONS, NOT ONE, is the whole fix for §2.2: a T4 emits up to four rows for
 * ONE vault and a single icon per row makes them read as four independent
 * markets. Falls back to the single asset icon when the legs cannot be
 * resolved, so a missing token-list entry degrades to today's rendering rather
 * than to an empty cell.
 */
export const LpAssetIcons: React.FC<{
  legs: LegAsset[]
  size?: number
  className?: string
}> = ({ legs, size = 20, className = '' }) => {
  if (legs.length === 0) return null
  return (
    <span className={`inline-flex shrink-0 items-center ${className}`}>
      {legs.map((leg, i) => (
        <Logo
          key={`${leg.address}-${i}`}
          src={leg.logoURI}
          alt={leg.symbol ?? leg.address}
          fallbackText={leg.symbol ?? '?'}
          size={size}
          className={`rounded-full object-contain token-logo ring-1 ring-base-100 ${
            i > 0 ? '-ml-2' : ''
          }`}
        />
      ))}
    </span>
  )
}

/**
 * "wstETH + ETH" — the LP side spelled out.
 *
 * `+` is not decoration: it is the marker that this side is a pair, and it is
 * the same character the lender name uses. Never split a lender name on it to
 * recover the pair — read `collateralPair` / `debtPair`.
 */
export const LpPairLabel: React.FC<{
  symbols: string[]
  className?: string
}> = ({ symbols, className = '' }) =>
  symbols.length === 0 ? null : <span className={className}>{symbols.join(' + ')}</span>

/**
 * A rate that is the basket's, with this leg's kept alongside.
 *
 * The leg rate is shown rather than hidden because it is not wrong — it is the
 * rate per dollar sitting in this token — and hiding it makes the headline
 * unauditable against the market page the user came from.
 */
export const BasketRateHint: React.FC<{
  row: SmartVaultRow | null | undefined
  side: 'supply' | 'borrow'
  legRate: number
  className?: string
}> = ({ row, side, legRate, className = '' }) => {
  const isBasket = side === 'supply' ? hasSmartCollateral(row) : hasSmartDebt(row)
  if (!isBasket) return null
  const info = smartInfo(row)
  const trading = side === 'supply' ? info?.supplyDexTradingRate : info?.borrowDexTradingRate
  return (
    <BasketRateMark legRate={legRate} dexTradingRate={trading} side={side} className={className} />
  )
}

/**
 * The "basket" mark, with no row behind it.
 *
 * Same split, and the same reason, as {@link AutoBalancedPill}: the pair/loop
 * surface has a blended rate and this leg's rate as two plain numbers, and no
 * vault descriptor to derive `hasSmartCollateral` from. The DEX trading yield
 * is simply omitted there — the pair endpoint does not carry it — which is why
 * it is optional rather than defaulted to zero: an absent figure and a 0.00 %
 * figure are different claims.
 */
export const BasketRateMark: React.FC<{
  legRate: number
  side: 'supply' | 'borrow'
  dexTradingRate?: number
  className?: string
}> = ({ legRate, side, dexTradingRate: trading, className = '' }) => {
  const parts = [`This leg alone: ${legRate.toFixed(2)}%`]
  if (typeof trading === 'number') {
    parts.push(
      side === 'supply'
        ? `Includes ${trading.toFixed(2)}% DEX trading yield`
        : `Net of ${trading.toFixed(2)}% DEX trading yield`
    )
  }
  parts.push('Position rate, value-weighted across both legs of the pool.')
  return (
    <span
      className={`text-[10px] text-base-content/50 cursor-help ${className}`}
      title={parts.join(' · ')}
    >
      basket
    </span>
  )
}

/**
 * The full disclosure block for an action panel.
 *
 * Shown ABOVE the amount inputs, not below the button: the fact that changes
 * what the user is agreeing to has to arrive before they size the trade.
 */
export const AutoBalancedNotice: React.FC<{
  row: SmartVaultRow | null | undefined
  /** Symbols of the side being acted on, in token0/token1 order. */
  legSymbols?: string[]
  className?: string
}> = ({ row, legSymbols = [], className = '' }) => {
  if (!isAutoBalanced(row)) return null
  return (
    <AutoBalancedNoticeBody
      explainer={autoBalancedExplainer(row)}
      legSymbols={legSymbols}
      className={className}
    />
  )
}

/**
 * The disclosure block, with no row behind it.
 *
 * The loop surfaces need this: a leveraged open on a smart-collateral market is
 * the flow where the ratio drift matters MOST — the position is levered, so the
 * drift is levered with it — and it was the one flow with no disclosure at all,
 * because the pair rows carry a boolean rather than a vault descriptor.
 *
 * Rendered ABOVE the amount inputs by every caller, for the reason the badge
 * exists at all: the fact that changes what the user is agreeing to has to
 * arrive before they size the trade, not after.
 */
export const AutoBalancedNoticeBody: React.FC<{
  explainer?: string
  legSymbols?: string[]
  className?: string
}> = ({ explainer = AUTO_BALANCED_COLLATERAL_EXPLAINER, legSymbols = [], className = '' }) => (
  <div
    className={`rounded-box border border-info/30 bg-info/5 p-2.5 text-xs space-y-1 ${className}`}
  >
    <div className="flex items-center gap-1.5 font-medium text-info">
      <AutoBalancedPill />
      {legSymbols.length > 0 && (
        <LpPairLabel symbols={legSymbols} className="text-base-content/80" />
      )}
    </div>
    <p className="text-base-content/70 leading-snug">{explainer}</p>
  </div>
)
