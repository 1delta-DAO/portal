import React, { useEffect, useMemo, useState } from 'react'
import { formatUnits, parseUnits } from 'viem'
import { AmountInput } from '../../common/AmountInput'
import {
  balancedCounterAmount,
  hasSmartCollateral,
  hasSmartDebt,
  legIndexOf,
  sideInfo,
  type FluidSideInfo,
  type SmartVaultRow,
} from '../../../sdk/lending-helper/fluidSmart'
import { AutoBalancedNotice } from './SmartVault'

/**
 * The second amount of a two-token LP side, plus the balanced / single-sided
 * choice.
 *
 * A smart side takes TWO amounts, and single-sided is legal — the pool swaps
 * internally — so this is a choice, not a requirement. It is also not a free
 * one: single-sided pays the pool's imbalance fee plus price impact, and at
 * size balanced is materially cheaper. Hence the default: balanced when the
 * user holds both legs, single-sided when they do not, because a form that
 * defaults to an amount the wallet cannot cover is worse than a form that
 * defaults to the more expensive route.
 */

export interface SmartLegState {
  /** Address of the second leg, or undefined when single-sided. */
  asset1?: string
  /** RAW amount of the second leg (its own decimals), or undefined. */
  amount1?: string
}

export interface SmartLegDescriptor {
  side: FluidSideInfo
  /** Index of the market row's own asset within the side. */
  primaryIndex: number
  /** The OTHER leg. */
  secondary: { underlying: string; decimals: number }
}

/**
 * Resolve the second leg of the side being acted on, or null when there is
 * none (an ordinary market, or the simple side of a T2/T3).
 *
 * `which` is the side the ACTION touches, not the side the row belongs to: a
 * deposit and a withdraw act on collateral, a borrow and a repay on debt.
 */
export function resolveSmartLeg(
  row: SmartVaultRow | null | undefined,
  primaryUnderlying: string,
  which: 'collateral' | 'debt'
): SmartLegDescriptor | null {
  const isSmart = which === 'collateral' ? hasSmartCollateral(row) : hasSmartDebt(row)
  if (!isSmart) return null
  const side = sideInfo(row, which)
  if (!side) return null
  const primaryIndex = legIndexOf(side, primaryUnderlying)
  if (primaryIndex !== 0 && primaryIndex !== 1) return null
  const secondary = side.assets[primaryIndex === 0 ? 1 : 0]
  if (!secondary) return null
  return { side, primaryIndex, secondary }
}

interface Props {
  row: SmartVaultRow | null | undefined
  leg: SmartLegDescriptor
  /** Human amount of the PRIMARY leg (the market row's own asset). */
  primaryAmount: string
  primarySymbol: string
  /** Symbol + logo of the second leg, when the token list knows it. */
  secondarySymbol?: string
  secondaryLogoURI?: string
  /** Human wallet balance of the second leg, when known. */
  secondaryBalance?: string
  /** Called whenever the resulting request changes. */
  onChange: (state: SmartLegState) => void
  disabled?: boolean
}

export const SmartLegInput: React.FC<Props> = ({
  row,
  leg,
  primaryAmount,
  primarySymbol,
  secondarySymbol,
  secondaryLogoURI,
  secondaryBalance,
  onChange,
  disabled,
}) => {
  const decimals = leg.secondary.decimals
  const symbol = secondarySymbol ?? 'second leg'

  /**
   * Is there a ratio to be balanced AGAINST?
   *
   * 18 live sides report `perShare: ['0','0']` — an empty pool. "Balanced" is
   * not a meaningful choice there: there is no ratio, the pre-fill computes
   * nothing, and the toggle would leave the user staring at a field that never
   * fills. Fall back to single-sided and say why.
   */
  const hasRatio = balancedCounterAmount(leg.side, leg.primaryIndex, 10n ** 18n) !== null

  // Balanced when the wallet can plausibly cover the second leg. A zero or
  // unknown balance defaults to single-sided rather than pre-filling an amount
  // the user cannot pay.
  const canPaySecond = (parseFloat(secondaryBalance ?? '0') || 0) > 0
  const [mode, setMode] = useState<'balanced' | 'single'>(
    canPaySecond && hasRatio ? 'balanced' : 'single'
  )
  const [manual, setManual] = useState<string | null>(null)

  // Re-derive the default when the SIDE changes (a different market selected),
  // never on every balance tick — that would fight the user's own choice.
  useEffect(() => {
    setMode(canPaySecond && hasRatio ? 'balanced' : 'single')
    setManual(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leg.secondary.underlying, leg.primaryIndex])

  /**
   * The pool's current ratio, applied to the primary amount.
   *
   * A SNAPSHOT — the split drifts with every trade — so it is a starting point
   * the user can overwrite, not a constraint. Null when the ratio is
   * unreadable, in which case the field simply starts empty.
   */
  const suggested = useMemo(() => {
    const primary = parseFloat(primaryAmount || '0')
    if (!Number.isFinite(primary) || primary <= 0) return null
    let primaryRaw: bigint
    try {
      primaryRaw = parseUnits(primaryAmount, leg.side.assets[leg.primaryIndex].decimals)
    } catch {
      return null
    }
    const counter = balancedCounterAmount(leg.side, leg.primaryIndex, primaryRaw)
    return counter === null ? null : formatUnits(counter, decimals)
  }, [primaryAmount, leg, decimals])

  const value = mode === 'single' ? '' : (manual ?? suggested ?? '')

  // Push the resulting request up. `asset1` is sent even with a zero amount so
  // the API still knows this is a two-leg side; sending `amount1` alone is a
  // server-side error by design.
  useEffect(() => {
    if (mode === 'single' || !value) {
      onChange({})
      return
    }
    try {
      onChange({
        asset1: leg.secondary.underlying,
        amount1: parseUnits(value, decimals).toString(),
      })
    } catch {
      onChange({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, value, decimals, leg.secondary.underlying])

  return (
    <div className="space-y-2">
      <AutoBalancedNotice row={row} legSymbols={[primarySymbol, symbol]} />

      <div className="flex items-center gap-0.5 bg-base-200 rounded-lg p-0.5 w-fit">
        <button
          type="button"
          disabled={disabled || !hasRatio}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
            mode === 'balanced'
              ? 'bg-base-100 shadow-sm text-base-content'
              : 'text-base-content/60 hover:text-base-content'
          } ${!hasRatio ? 'opacity-40 cursor-not-allowed' : ''}`}
          onClick={() => hasRatio && setMode('balanced')}
          title={
            hasRatio
              ? `Supply both ${primarySymbol} and ${symbol} at the pool's current ratio. Cheaper at size — no imbalance fee, no price impact.`
              : 'This pool holds no liquidity yet, so there is no ratio to match.'
          }
        >
          Balanced
        </button>
        <button
          type="button"
          disabled={disabled}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
            mode === 'single'
              ? 'bg-base-100 shadow-sm text-base-content'
              : 'text-base-content/60 hover:text-base-content'
          }`}
          onClick={() => setMode('single')}
          title={`Supply only ${primarySymbol}; the pool swaps internally. Simpler, but you pay the pool's imbalance fee plus price impact.`}
        >
          {primarySymbol} only
        </button>
      </div>

      {mode === 'balanced' ? (
        <>
          <AmountInput
            value={value}
            onChange={setManual}
            maxAmount={secondaryBalance ?? '0'}
            decimals={decimals}
            disabled={disabled}
            label={
              <span className="flex items-center gap-1">
                {secondaryLogoURI && (
                  <img src={secondaryLogoURI} alt={symbol} className="w-4 h-4 rounded-full" />
                )}
                {symbol} amount
              </span>
            }
          />
          <p className="text-[10px] text-base-content/50 leading-snug">
            Pre-filled at the pool&rsquo;s current ratio, which keeps moving — adjust it freely. The
            exact share count is quoted when the transaction is built.
          </p>
        </>
      ) : (
        <p className="text-[10px] text-base-content/50 leading-snug">
          Depositing {primarySymbol} alone: the pool swaps part of it into {symbol} internally, so
          you pay its imbalance fee and price impact. At size, supplying both legs is materially
          cheaper.
        </p>
      )}
    </div>
  )
}
