import { useMemo, useState } from 'react'
import { parseUnits, type Address, type Hex } from 'viem'
import { AmountInput } from '../../common/AmountInput'
import { formatTokenAmount, parseAmount } from '../actions/format'
import {
  useMidnightMake,
  useMidnightOpenOffers,
  useMidnightCancelOffer,
} from '../../../hooks/lending/useMidnightMake'
import { MidnightOrderBook } from './MidnightOrderBook'

/**
 * The "Make" side of a Morpho Midnight market — post your OWN limit offer (a
 * lend or borrow order at a rate you choose) instead of taking existing ones,
 * plus manage/cancel your open offers. Mirrors the Morpho order-book "Make" tab.
 *
 * `side='lend'` posts a bid (you'll lend the loan token at your rate when taken);
 * `side='borrow'` posts an ask (you'll borrow at your rate when taken).
 */
export function MakeOfferPanel({
  chainId,
  lender,
  side,
  symbol,
  decimals = 18,
  account,
  maturityMs,
}: {
  chainId: string
  /** `MORPHO_MIDNIGHT_<id>` lender key. */
  lender: string
  side: 'lend' | 'borrow'
  symbol?: string
  decimals?: number
  account?: string
  maturityMs?: number | null
}) {
  const [rate, setRate] = useState('')
  const [amount, setAmount] = useState('')
  const [expiryDays, setExpiryDays] = useState(7)

  const { makeOffer, pending, step, error } = useMidnightMake(chainId, account)
  const { offers, isLoading } = useMidnightOpenOffers({ chainId, lender, account })
  const { cancel, cancelling } = useMidnightCancelOffer(chainId, account)

  const rateNum = parseFloat(rate || '0')
  const amountNum = parseAmount(amount)

  // Cap the expiry at the market maturity.
  const now = Date.now()
  const maxDays = maturityMs ? Math.max(1, Math.floor((maturityMs - now) / 86_400_000)) : 3650
  const expiryChoices = [1, 7, 30, 90].filter((d) => d <= maxDays)
  if (!expiryChoices.includes(Math.min(expiryDays, maxDays))) {
    expiryChoices.push(maxDays)
  }

  const canPost = !!account && rateNum > 0 && amountNum > 0 && !pending && !!lender

  const onPost = async () => {
    if (!canPost || !account) return
    const expirySec = Math.floor(now / 1000) + Math.min(expiryDays, maxDays) * 86_400
    await makeOffer({
      chainId,
      lender,
      side,
      aprPct: rateNum,
      size: parseUnits(amount, decimals),
      expirySec,
      account: account as Address,
    })
  }

  const verb = side === 'lend' ? 'Lend' : 'Borrow'
  const rateHint =
    side === 'lend'
      ? 'The APR you want to earn — your offer fills when a borrower takes it.'
      : 'The APR you want to pay — your offer fills when a lender takes it.'

  const myOffers = useMemo(() => offers.filter((o) => o.side === side), [offers, side])

  return (
    <div className="space-y-3">
      <div className="text-[10px] text-base-content/50 px-1">
        Post a limit {verb.toLowerCase()} offer at your own rate. It sits on the order book until
        someone takes it (or you cancel).
      </div>

      {/* Competing offers — the live two-sided book, with your typed rate marked
          in place on the side you'd be joining, so you can pitch a realistic
          (fillable) offer instead of one buried behind the market. A lend maker
          offer joins the BID side; a borrow maker offer joins the ASK side. */}
      <div className="space-y-1">
        <div className="px-1 text-[10px] text-base-content/50">
          Competing offers{rateNum > 0 ? ' · your rate marked' : ''}
        </div>
        <MidnightOrderBook
          chainId={chainId}
          lender={lender}
          symbol={symbol}
          marker={
            rateNum > 0
              ? {
                  side: side === 'lend' ? 'bids' : 'asks',
                  aprPct: rateNum,
                  sizeTokens: amountNum > 0 ? amountNum : undefined,
                }
              : undefined
          }
        />
      </div>

      {/* Rate */}
      <div className="space-y-1">
        <div className="flex justify-between px-1 text-xs">
          <span className="text-base-content/60" title={rateHint}>
            Your rate (APR %)
          </span>
        </div>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          className="input input-bordered input-sm w-full tabular-nums"
        />
      </div>

      {/* Size */}
      <div className="space-y-1">
        <div className="px-1 text-xs text-base-content/60">Size{symbol ? ` (${symbol})` : ''}</div>
        <AmountInput
          value={amount}
          onChange={setAmount}
          maxAmount=""
          decimals={decimals}
          disabled={pending}
        />
      </div>

      {/* Expiry */}
      <div className="space-y-1">
        <div className="px-1 text-xs text-base-content/60">Expires in</div>
        <div className="flex flex-wrap gap-1.5">
          {expiryChoices.map((d) => {
            const active = Math.min(expiryDays, maxDays) === d
            return (
              <button
                key={d}
                type="button"
                onClick={() => setExpiryDays(d)}
                className={`px-2.5 py-1 rounded-lg border text-xs transition-colors ${
                  active
                    ? 'border-primary bg-primary/10 ring-1 ring-primary'
                    : 'border-base-300 bg-base-200/50 hover:bg-base-200'
                }`}
              >
                {d >= maxDays && maturityMs ? 'Until maturity' : `${d}d`}
              </button>
            )
          })}
        </div>
      </div>

      {error && <div className="text-error text-xs wrap-break-word px-1">{error}</div>}

      <button
        type="button"
        disabled={!canPost}
        onClick={onPost}
        className="btn btn-primary btn-sm w-full"
      >
        {pending ? (step ?? 'Working…') : `Post ${verb.toLowerCase()} offer`}
      </button>

      {/* Open offers */}
      <div className="space-y-1 pt-1">
        <div className="px-1 text-xs text-base-content/60">
          Your open {verb.toLowerCase()} offers
          {isLoading ? ' (loading…)' : ` (${myOffers.length})`}
        </div>
        {myOffers.length === 0 ? (
          <div className="px-1 text-[10px] text-base-content/40">
            No open {verb.toLowerCase()} offers on this market.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {myOffers.map((o) => (
              <div
                key={o.root}
                className="flex items-center justify-between gap-2 rounded-lg border border-base-300 bg-base-200/40 px-2.5 py-1 text-xs"
              >
                <span className="tabular-nums font-semibold">{o.aprPct.toFixed(2)}%</span>
                <span className="tabular-nums text-base-content/60">
                  {formatTokenAmount(Number(o.size) / 10 ** decimals)}
                  {symbol ? ` ${symbol}` : ''}
                </span>
                <span className="text-[10px] text-base-content/40">
                  exp {new Date(o.expiry * 1000).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  disabled={cancelling === o.root}
                  onClick={() => cancel(o.root as Hex, lender)}
                  className="text-[10px] text-error hover:underline disabled:opacity-50"
                >
                  {cancelling === o.root ? 'Cancelling…' : 'Cancel'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Take / Make segmented toggle — shared by the lend and borrow panels. */
export function TakeMakeToggle({
  value,
  onChange,
}: {
  value: 'take' | 'make'
  onChange: (v: 'take' | 'make') => void
}) {
  return (
    <div className="flex rounded-lg border border-base-300 p-0.5 text-xs">
      {(['take', 'make'] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`flex-1 rounded-md py-1 capitalize transition-colors ${
            value === v
              ? 'bg-primary/15 text-primary font-medium'
              : 'text-base-content/60 hover:text-base-content'
          }`}
          title={
            v === 'take'
              ? 'Take existing offers now (market rate)'
              : 'Post your own offer at a rate you choose (limit)'
          }
        >
          {v}
        </button>
      ))}
    </div>
  )
}
