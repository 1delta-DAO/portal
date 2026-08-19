import React from 'react'
import type { ConfigMarketItem } from '../../../sdk/lending-helper/marketTypes'
import type { PoolRole } from '../tabs/trading/types'
import { AssetPopover } from './AssetPopover'
import { ROLE_CHIP_CLASS, ROLE_LABEL } from './configMarketConstants'
import { AutoBalancedBadge, BasketRateHint } from './SmartVault'
import {
  positionBorrowRate,
  positionSupplyRate,
  type SmartVaultRow,
} from '../../../sdk/lending-helper/fluidSmart'

/**
 * Down-pointing chevron rotated -90° when collapsed (right-pointing).
 * Matches the SVG used in token-selection/Dropdown for visual consistency
 * across the app's expand/collapse affordances.
 */
export const ExpandChevron: React.FC<{ expanded: boolean }> = ({ expanded }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className={`w-3.5 h-3.5 shrink-0 text-base-content/40 transition-transform ${
      expanded ? '' : '-rotate-90'
    }`}
    aria-hidden
  >
    <path
      fillRule="evenodd"
      d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
      clipRule="evenodd"
    />
  </svg>
)

/**
 * Role chip — pairs with the colored left rail to signal which Loop slot this
 * row is currently filling. Renders nothing when no role is assigned: it no
 * longer backs a column that would collapse, it sits at the row's top-right
 * corner, so an unassigned row should show no artifact at all.
 */
export const RoleChip: React.FC<{ role: PoolRole | undefined }> = ({ role }) => {
  if (!role) return null
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${ROLE_CHIP_CLASS[role]}`}
      title={`Selected as ${ROLE_LABEL[role]} in the active loop action`}
    >
      {ROLE_LABEL[role]}
    </span>
  )
}

const SIDE_BADGE: Record<
  'collateral' | 'borrowable' | 'supply',
  { label: string; cls: string; title: string }
> = {
  collateral: {
    label: 'Coll',
    cls: 'bg-success/15 text-success',
    title: 'Can be posted as collateral',
  },
  // Distinct from collateral on purpose: this asset earns the supply rate but
  // backs no borrowing, which is the whole reason the row exists.
  supply: {
    label: 'Lend',
    cls: 'bg-info/15 text-info',
    title: 'Can be supplied to earn — not usable as collateral',
  },
  borrowable: {
    label: 'Bor',
    cls: 'bg-error/15 text-error',
    title: 'Can be borrowed',
  },
}

export const SideBadge: React.FC<{ side: 'collateral' | 'borrowable' | 'supply' }> = ({ side }) => {
  const cfg = SIDE_BADGE[side]
  return (
    <span
      title={cfg.title}
      className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  )
}

export const AssetCell: React.FC<{
  item: ConfigMarketItem
  hasPosition: boolean
  entityName?: string
  /**
   * The matching market row, when the caller has it.
   *
   * `/pools/by-config` does NOT carry the Fluid descriptor — only
   * `/lending/pools` and `/lending/latest` do — so the config view has to learn
   * that a row is an LP leg from the pool it already holds in `poolMap`.
   * Without it the DEFAULT view of the Lending tab renders leg rates with no
   * badge, which is the one screen a user lands on first.
   */
  row?: SmartVaultRow | null
}> = ({ item, hasPosition, entityName, row }) => {
  const asset = item.underlyingInfo.asset
  const iy = item.intrinsicYield ?? 0
  return (
    <AssetPopover
      address={asset.address}
      name={asset.name}
      symbol={asset.symbol}
      logoURI={asset.logoURI}
      positionDot={hasPosition}
      marketUid={item.marketUid}
      marketName={entityName ?? `${asset.symbol} (${asset.name})`}
      currentDepositRate={item.depositRate + iy}
      currentBorrowRate={item.variableBorrowRate + iy}
      priceUsd={item.underlyingInfo.prices?.priceUsd}
      oraclePriceUsd={item.underlyingInfo.oraclePrice?.oraclePriceUsd}
      chainId={asset.chainId}
    >
      <div className="flex flex-col min-w-0">
        <span className="font-medium text-sm truncate" title={asset.symbol}>
          {asset.symbol}
        </span>
        <span
          className="text-[10px] text-base-content/60 truncate flex items-center gap-1"
          title={asset.name}
        >
          <span className="truncate">{asset.name}</span>
          <AutoBalancedBadge row={row} className="shrink-0" />
        </span>
      </div>
    </AssetPopover>
  )
}

export const AprCell: React.FC<{
  rate: number
  iy: number
  color: 'success' | 'warning'
  reward?: number
  align?: 'start' | 'end'
  /** The matching market row — see {@link AssetCell}'s `row`. */
  row?: SmartVaultRow | null
}> = ({ rate, iy, color, reward = 0, align = 'start', row }) => {
  // On an LP-backed side the rate passed in is one LEG's; the position earns
  // the basket. Falls through untouched on every ordinary market.
  const side = color === 'success' ? 'supply' : 'borrow'
  const positionRate =
    side === 'supply' ? positionSupplyRate(row, rate) : positionBorrowRate(row, rate)
  const total = positionRate + iy
  // A deposit-side reward adds to what you earn; a borrow-side reward is a
  // rebate that lowers cost — show it in the opposite semantic colour.
  const isBorrow = color === 'warning'
  return (
    <div className={`flex flex-col gap-0.5 ${align === 'end' ? 'items-end' : 'items-start'}`}>
      <div className="flex items-center gap-1">
        <span className={`text-sm font-medium tabular-nums text-${color}`}>
          {total.toFixed(2)}%
        </span>
        <BasketRateHint row={row} side={side} legRate={rate} />
        {iy > 0 && (
          <span
            className={`badge badge-xs bg-${color}/15 text-${color} border-0 cursor-help whitespace-nowrap`}
            title={`Base rate: ${positionRate.toFixed(2)}% + Intrinsic yield: ${iy.toFixed(2)}%`}
          >
            +{iy.toFixed(1)}%
          </span>
        )}
      </div>
      {reward > 0.005 && (
        <span
          className={`badge badge-xs border-0 cursor-help whitespace-nowrap ${
            isBorrow ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
          }`}
          title={
            isBorrow
              ? `Borrow reward rebate: −${reward.toFixed(2)}% APR (lowers borrow cost, transient)`
              : `Reward incentive: +${reward.toFixed(2)}% APR (transient)`
          }
        >
          {isBorrow ? '−' : '+'}
          {reward.toFixed(1)}% rwd
        </span>
      )}
    </div>
  )
}
