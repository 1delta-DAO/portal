import React from 'react'
import { abbreviateUsd, formatUsd } from '../../../utils/format'
import { LpAssetIcons } from './SmartVault'
import {
  lenderKeyOf,
  rowAsset,
  rowIsLegOf,
  smartInfo,
  type SmartVaultRow,
} from '../../../sdk/lending-helper/fluidSmart'

/**
 * What each leg of an auto-balanced position actually holds and earns.
 *
 * WHY THIS EXISTS. Collapsing a vault's legs into one row (see
 * `collapseSmartVaults`) fixes the identity problem — one position, one row —
 * but it also hides real information: how the pool has currently split the
 * money, and what each token is earning inside it. Both are things a depositor
 * legitimately wants before committing, and the second is the number the
 * headline is a weighted average OF.
 *
 * So the legs become the DETAIL rather than disappearing. This is the half of
 * FLUID_SMART_UI_PLAN.md §2.2 that the collapse alone does not deliver.
 *
 * The split shown is the pool's CURRENT one. It is not what anyone deposited
 * and it does not stay put — the weight column is a snapshot, and the copy says
 * so rather than letting a stable-looking percentage imply otherwise.
 */

export interface VaultLeg {
  key: string
  symbol: string
  logoURI?: string
  /** This leg's own rate — right per dollar, but not the position's. */
  legRate: number
  /** This leg's share of the side, USD. */
  depositsUsd: number
  /** Token units held, for the tooltip. */
  amount?: number
}

/**
 * Build the leg list for a row, from the sibling markets of its own vault.
 *
 * ONE definition, used by both tabs. The earn tab has the legs already grouped
 * by `collapseSmartVaults`; the lending tab is scoped to a single lender, so
 * the legs are simply its other markets — and re-deriving "same vault" a second
 * way is how two surfaces start disagreeing about what a position is.
 *
 * Returns `[]` on an ordinary market, which renders nothing.
 */
export function vaultLegsFor(
  row: (SmartVaultRow & { asset?: { symbol?: string; logoURI?: string } }) | null | undefined,
  siblings: readonly (SmartVaultRow & {
    asset?: { symbol?: string; logoURI?: string }
    name?: string
    intrinsicYield?: number | null
    depositRate?: number
    totalDepositsUSD?: number
  })[]
): VaultLeg[] {
  if (!rowIsLegOf(row, 'collateral')) return []
  const pair = smartInfo(row)?.collateralPair ?? []
  const vault = lenderKeyOf(row!.marketUid)
  const byAsset = new Map(
    siblings.filter((s) => lenderKeyOf(s.marketUid) === vault).map((s) => [rowAsset(s) ?? '', s])
  )
  const out: VaultLeg[] = []
  for (const addr of pair) {
    const leg = byAsset.get(addr.toLowerCase())
    if (!leg) continue
    out.push({
      key: leg.marketUid,
      symbol: leg.asset?.symbol ?? leg.name ?? addr.slice(0, 6),
      logoURI: leg.asset?.logoURI,
      // The LEG's own rate — the headline above it is the weighted blend.
      legRate: leg.depositRate ?? 0,
      depositsUsd: leg.totalDepositsUSD ?? 0,
    })
  }
  return out
}

interface Props {
  legs: VaultLeg[]
  /** The value-weighted figure the legs blend into — the headline. */
  basketRate: number | undefined
  side: 'supply' | 'borrow'
  className?: string
}

export const VaultLegBreakdown: React.FC<Props> = ({ legs, basketRate, side, className = '' }) => {
  if (legs.length < 2) return null
  const total = legs.reduce((s, l) => s + (l.depositsUsd || 0), 0)
  const accent = side === 'supply' ? 'text-success' : 'text-warning'

  return (
    <div className={`rounded-box bg-base-200/40 p-2.5 text-xs space-y-2 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-base-content/70">
          <LpAssetIcons
            legs={legs.map((l) => ({ address: l.key, symbol: l.symbol, logoURI: l.logoURI }))}
            size={14}
          />
          One position, {legs.length} tokens
        </span>
        {typeof basketRate === 'number' && (
          <span className={`font-semibold tabular-nums ${accent}`}>{basketRate.toFixed(2)}%</span>
        )}
      </div>

      <div className="space-y-1">
        {legs.map((l) => {
          const weight = total > 0 ? (l.depositsUsd / total) * 100 : 0
          return (
            <div key={l.key} className="flex items-center gap-2">
              <span className="w-16 shrink-0 truncate text-base-content/70" title={l.symbol}>
                {l.symbol}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-base-300/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-base-content/25"
                  style={{ width: `${Math.max(2, weight)}%` }}
                />
              </div>
              <span
                className="w-10 shrink-0 text-right tabular-nums text-base-content/50"
                title={`${abbreviateUsd(l.depositsUsd)} of ${abbreviateUsd(total)}`}
              >
                {weight.toFixed(0)}%
              </span>
              <span
                className="w-14 shrink-0 text-right tabular-nums text-base-content/60"
                title={
                  l.amount != null
                    ? `${l.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${l.symbol} · $${formatUsd(l.depositsUsd)}`
                    : `$${formatUsd(l.depositsUsd)}`
                }
              >
                {l.legRate.toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>

      <p className="text-[10px] text-base-content/50 leading-snug">
        The rate on the right is what each token earns per dollar inside the pool; the figure above
        is the position&rsquo;s, weighted by the split. The pool keeps rebalancing that split — it
        is not what you deposited and it will not stay put.
      </p>
    </div>
  )
}
