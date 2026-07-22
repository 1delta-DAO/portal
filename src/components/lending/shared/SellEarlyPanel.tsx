import { useState } from 'react'
import { parseUnits } from 'viem'
import { AmountInput } from '../../common/AmountInput'
import { formatTokenAmount, parseAmount } from '../actions/format'
import { OfferLadder } from './OfferLadder'
import { MakeOfferPanel, TakeMakeToggle } from './MakeOfferPanel'
import { useLendingOffers, computeEffectiveBorrow } from '../../../hooks/lending/useLendingOffers'
import { useMidnightSell } from '../../../hooks/lending/useMidnightMake'

/**
 * Early-exit a Morpho Midnight LENDER position before maturity by selling your
 * credit units into the order book — the withdraw-side analog of the deposit
 * book. Two ways, like the Make tab:
 *
 *  - TAKE  → sell now into existing bids (you receive loan token at market price,
 *            a discount to face; the rate is the blend across the bids you fill).
 *  - MAKE  → post your own ask at a price you choose (fills when a borrower takes
 *            it) — reuses {@link MakeOfferPanel} with `side='borrow'`.
 *
 * Redeeming at/after maturity (1:1, no discount) stays the plain Withdraw path.
 */
export function SellEarlyPanel({
  chainId,
  lender,
  symbol,
  decimals = 18,
  account,
  maturityMs,
  /** Max sellable = the lender position (loan-token face), decimal string. */
  maxAmount,
  onSold,
}: {
  chainId: string
  lender: string
  symbol?: string
  decimals?: number
  account?: string
  maturityMs?: number | null
  maxAmount?: string
  onSold?: () => void
}) {
  const [mode, setMode] = useState<'take' | 'make'>('take')
  const [amount, setAmount] = useState('')
  const { sell, pending, error } = useMidnightSell(chainId, account)

  // The bids you'd sell into (same book side a borrower takes).
  const { offers: bids } = useLendingOffers({
    chainId,
    lender,
    minAssetsUsd: 1,
  })
  const amountNum = parseAmount(amount)
  const eff = computeEffectiveBorrow(bids, amountNum)

  const overMax =
    !!maxAmount && parseAmount(maxAmount) > 0 && amountNum > parseAmount(maxAmount) + 1e-9
  const canSell = !!account && amountNum > 0 && !overMax && !pending

  const onSell = async () => {
    if (!canSell) return
    const r = await sell(lender, parseUnits(amount, decimals))
    if (r.ok) {
      setAmount('')
      onSold?.()
    }
  }

  return (
    <div className="space-y-3">
      <TakeMakeToggle value={mode} onChange={setMode} />

      {mode === 'make' ? (
        // Post an ask to sell your units at your own price.
        <MakeOfferPanel
          chainId={chainId}
          lender={lender}
          side="borrow"
          symbol={symbol}
          decimals={decimals}
          account={account}
          maturityMs={maturityMs}
        />
      ) : (
        <div className="space-y-3">
          <div className="text-[10px] text-base-content/50 px-1">
            Sell your position into the book now. You receive {symbol ?? 'the loan token'} at the
            market price — a discount to face, since it's before maturity.
          </div>

          <div className="space-y-1">
            <div className="px-1 text-xs text-base-content/60">
              Amount to sell{symbol ? ` (${symbol} face)` : ''}
            </div>
            <AmountInput
              value={amount}
              onChange={setAmount}
              maxAmount={maxAmount ?? ''}
              decimals={decimals}
              disabled={pending}
              error={
                overMax
                  ? `Exceeds your position (${formatTokenAmount(parseAmount(maxAmount!))}).`
                  : null
              }
            />
          </div>

          {/* Effective sell rate + the bids you'd fill. */}
          {eff.aprPct != null && (
            <div className="flex justify-between px-1 text-xs">
              <span
                className="text-base-content/60"
                title="Size-weighted rate across the bids this sale fills."
              >
                Effective sell rate
              </span>
              <span className="tabular-nums text-warning font-medium">
                {eff.aprPct.toFixed(2)}%
              </span>
            </div>
          )}
          <div className="px-1">
            <OfferLadder
              chainId={chainId}
              lender={lender}
              symbol={symbol}
              side="borrow"
              amountTokens={amountNum}
            />
          </div>

          {error && <div className="text-error text-xs wrap-break-word px-1">{error}</div>}

          <button
            type="button"
            disabled={!canSell}
            onClick={onSell}
            className="btn btn-warning btn-sm w-full"
          >
            {pending ? 'Selling…' : 'Sell now'}
          </button>
        </div>
      )}
    </div>
  )
}
