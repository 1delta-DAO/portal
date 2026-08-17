import React, { useEffect, useMemo, useState } from 'react'
import { formatUnits } from 'viem'
import {
  sharesForLegAmount,
  splitForShares,
  type FluidSideInfo,
  type SmartVaultRow,
} from '../../../sdk/lending-helper/fluidSmart'
import { AutoBalancedNotice } from './SmartVault'

/**
 * Exiting an auto-balanced side, sized in SHARES.
 *
 * WHY NOT A TOKEN AMOUNT. The position is one share count over a two-token LP,
 * and the pool — not the user — decides how many of each token a share is
 * worth. "Withdraw 100 USDC" from a USDC+ETH side is therefore not a request
 * the position can answer: it is a request the POOL answers, differently at
 * every block. "Withdraw 50 %" is a request the position can answer exactly.
 *
 * A FULL exit is share-precise and routes to `operatePerfect` server-side via
 * the existing `isAll` flag — the token-sized form cannot express it at all,
 * which is why 100 % is a different request here rather than a preset that
 * fills the field.
 *
 * The split shown is an ESTIMATE at the current ratio and is labelled as one.
 * A share request also lands on Fluid's own storage precision (a packed
 * coefficient + exponent — measured 4,096 off a 2.4e20 request), so nothing
 * here asserts an exact match, and neither should any caller.
 */

export interface SmartExitRequest {
  /** Raw LP shares to burn, or undefined when the request is a full exit. */
  shares?: string
  /** True ⇒ full exit; the caller should send `isAll` rather than a size. */
  isAll: boolean
}

interface Props {
  row: SmartVaultRow | null | undefined
  side: FluidSideInfo
  /** Index of the row's own asset within the side. */
  legIndex: number
  /**
   * The user's position in THIS leg's token, human units — what the market row
   * reports. The share count is derived from it and the pool's current ratio,
   * because no endpoint serves a share balance today.
   */
  legBalance: string
  legSymbols: [string, string]
  /** Verb for the button copy: withdrawing collateral vs repaying debt. */
  verb: 'withdraw' | 'repay'
  onChange: (request: SmartExitRequest) => void
  disabled?: boolean
}

const PRESETS = [25, 50, 75, 100] as const

export const SmartExitPanel: React.FC<Props> = ({
  row,
  side,
  legIndex,
  legBalance,
  legSymbols,
  verb,
  onChange,
  disabled,
}) => {
  const [pct, setPct] = useState<number>(100)

  const decimals = side.assets.map((a) => a.decimals)

  /**
   * The position's share count, derived from this leg's balance and the pool's
   * ratio. Null when either is unreadable, in which case the panel says so
   * rather than offering a size it cannot compute.
   */
  const totalShares = useMemo(() => {
    const bal = parseFloat(legBalance || '0')
    if (!Number.isFinite(bal) || bal <= 0) return null
    let raw: bigint
    try {
      // `legBalance` is a decimal string in this leg's own decimals.
      const [whole, frac = ''] = legBalance.split('.')
      const d = decimals[legIndex] ?? 18
      raw =
        BigInt(whole || '0') * 10n ** BigInt(d) + BigInt((frac + '0'.repeat(d)).slice(0, d) || '0')
    } catch {
      return null
    }
    return sharesForLegAmount(side, legIndex, raw)
  }, [legBalance, side, legIndex, decimals])

  const requestedShares = useMemo(() => {
    if (totalShares === null || pct >= 100) return null
    return (totalShares * BigInt(Math.round(pct * 100))) / 10000n
  }, [totalShares, pct])

  const estimatedSplit = useMemo(() => {
    const shares = pct >= 100 ? totalShares : requestedShares
    return shares === null ? null : splitForShares(side, shares)
  }, [pct, totalShares, requestedShares, side])

  useEffect(() => {
    if (pct >= 100) {
      onChange({ isAll: true })
      return
    }
    onChange({
      isAll: false,
      shares: requestedShares === null ? undefined : requestedShares.toString(),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct, requestedShares])

  return (
    <div className="space-y-2">
      <AutoBalancedNotice row={row} legSymbols={legSymbols} />

      <div className="flex items-center justify-between px-1 text-xs">
        <span className="text-base-content/60">How much of the position to {verb}</span>
        <span className="font-medium tabular-nums">{pct}%</span>
      </div>

      <div className="flex gap-1">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            disabled={disabled}
            className={`btn btn-xs flex-1 ${pct === p ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setPct(p)}
            title={
              p === 100
                ? `Close the whole position. Share-precise — the only exact form on an LP side.`
                : `Burn ${p}% of your LP shares and receive both ${legSymbols[0]} and ${legSymbols[1]}.`
            }
          >
            {p === 100 ? 'Max' : `${p}%`}
          </button>
        ))}
      </div>

      <input
        type="range"
        min={1}
        max={100}
        step={1}
        value={pct}
        disabled={disabled}
        onChange={(e) => setPct(Number(e.target.value))}
        className="range range-xs range-primary"
      />

      {estimatedSplit ? (
        <div className="rounded-box bg-base-200/50 p-2 text-xs space-y-1">
          <div className="text-base-content/60">You receive, at the pool&rsquo;s current ratio</div>
          {estimatedSplit.map((amt, i) => (
            <div key={i} className="flex items-baseline justify-between gap-2">
              <span className="text-base-content/70">{legSymbols[i]}</span>
              <span className="font-medium tabular-nums">
                ≈{' '}
                {Number(formatUnits(amt, decimals[i] ?? 18)).toLocaleString(undefined, {
                  maximumFractionDigits: 6,
                })}
              </span>
            </div>
          ))}
          <p className="text-[10px] text-base-content/50 leading-snug pt-0.5">
            An estimate. The ratio moves with the pool, and the protocol rounds a share request to
            its own storage precision — the exact amounts are set when the transaction lands.
          </p>
        </div>
      ) : (
        <p className="text-[10px] text-base-content/50 px-1 leading-snug">
          {totalShares === null
            ? 'Your share balance could not be read from this leg — use Max to close the whole position, which is share-precise and needs no estimate.'
            : 'Enter a percentage to see what you receive.'}
        </p>
      )}
    </div>
  )
}
