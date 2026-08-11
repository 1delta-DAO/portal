import React, { useEffect, useMemo, useState } from 'react'
import type { Address } from 'viem'
import type { RawCurrency } from '../../../../types/currency'
import { AmountInput } from '../../../common/AmountInput'
import { TokenSelector } from '../../../token-selection'
import { WalletConnect } from '../../../connect'
import { useSpyAccount } from '../../../../contexts/SpyMode'
import { useBalanceQuery } from '../../../../hooks/balances/useBalanceQuery'
import {
  vocabLabel,
  type EarnActionInput,
  type EarnCapability,
  type EarnMarket,
  type EarnVocabulary,
} from '../../../../sdk/earn-helper'

/**
 * A need that bounds a FILL, as opposed to a routing address or a realised
 * amount. `minMETHAmount` / `minRSETHAmountExpected` / `minUsddOut` bound a
 * price; `depositPool` selects a route and `stEthAmount` carries what the first
 * leg produced (Lido's submit and wrap are deterministic — no slippage exists
 * to bound). Only the first class gets a tolerance control.
 *
 * Mirrors `isBoundNeed` in margin-fetcher; kept as one predicate so the rule
 * lives in one shape rather than a list of key names on each side.
 */
const isBoundNeed = (need: string) => /^min/i.test(need)

interface Props {
  row: EarnMarket
  vocab: EarnVocabulary
}

/**
 * Amount + pay-asset entry for a selected earn row.
 *
 * Mirrors the existing vaults `VaultActionPanel` flow (balance, max, USD
 * readout) but takes its ENTIRE routing from `row.capabilities`. The vaults
 * panel imports `vaultFamily` / `withdrawFamily` / `isAsyncVaultWithdraw` to
 * work out which endpoint and which verbs apply; here the server already
 * decided, so this component never learns what a provider is.
 *
 * The pay-asset selector appears only where the server says the action accepts
 * one (`capability.acceptsPayAsset`). Today that is the lending half — its
 * deposit route runs `payAsset` through the conversion solver — and NOT the
 * vault half, whose zap lands with phase 3. Rendering the selector everywhere
 * would build an input that 400s on submit.
 */
export const EarnActionPanel: React.FC<Props> = ({ row, vocab }) => {
  const { address: account } = useSpyAccount()

  const [action, setAction] = useState<string>(() => row.capabilities[0]?.action ?? '')
  const [amount, setAmount] = useState('')
  const [payAsset, setPayAsset] = useState<Address | undefined>()
  // Percent. Only meaningful where the server SAYS a bound is required — see
  // `needsSlippage` below.
  const [slippage, setSlippage] = useState('0.5')

  // Reset when the selected market changes — carrying an amount across rows is
  // how a user deposits into the wrong market.
  useEffect(() => {
    setAction(row.capabilities[0]?.action ?? '')
    setAmount('')
    setPayAsset(undefined)
  }, [row.earnUid])

  const capability: EarnCapability | undefined = useMemo(
    () => row.capabilities.find((c) => c.action === action),
    [row.capabilities, action]
  )

  // Withdrawals are denominated in the SHARE token where one exists; deposits
  // in whatever the user is paying with.
  const isExit = action !== 'deposit'
  const defaultToken = (
    isExit && row.shareToken ? row.shareToken.address : row.asset.address
  ) as Address
  const spendToken = (payAsset ?? defaultToken) as Address
  const spendDecimals =
    payAsset && payAsset !== row.asset.address
      ? 18 // an arbitrary pay asset — decimals resolve on quote
      : isExit && row.shareToken
        ? row.shareToken.decimals
        : row.asset.decimals

  // Nested chainId -> lowercased address -> entry, so index in two steps
  // rather than assuming a flat map.
  const { data: balances } = useBalanceQuery({
    currencies: [
      {
        chainId: row.chainId,
        address: spendToken,
        decimals: spendDecimals,
      } as RawCurrency,
    ],
    enabled: !!account,
  })
  const entry = balances?.[row.chainId]?.[spendToken.toLowerCase()]

  const maxAmount = entry?.balance ?? '0'

  const usdValue = useMemo(() => {
    const n = Number(amount)
    if (!Number.isFinite(n)) return undefined
    // Prefer the balance query's own price — it prices whatever the user
    // actually selected, which for a pay-asset zap is NOT the market's asset.
    const price = entry?.priceUSD ?? row.asset.priceUsd
    return price ? n * price : undefined
  }, [amount, entry?.priceUSD, row.asset.priceUsd])

  // Assets this action accepts. Present ⇒ the picker is LIMITED to them;
  // offering anything else builds a call the venue cannot serve.
  const inputs: EarnActionInput[] | undefined = capability?.inputs
  const selectedInput = useMemo(() => {
    if (!inputs?.length) return undefined
    const want = (payAsset ?? '').toLowerCase()
    return (
      inputs.find((i) => i.asset.toLowerCase() === want) ??
      inputs.find((i) => i.asset === 'native') ??
      inputs[0]
    )
  }, [inputs, payAsset])

  // Action-level needs plus the ones specific to the CHOSEN path.
  const requires = useMemo(() => {
    const base = capability?.requires ?? []
    const perPath = selectedInput?.needs ?? []
    return [...new Set([...base, ...perPath])]
  }, [capability, selectedInput])
  // Inputs this UI can actually collect. Everything else in `requires` is
  // surfaced as a blocker rather than silently dropped — an action built
  // without a required param does not fail politely, it reverts or fills at
  // any price.
  // `slippage` is the generic marker; `min*` keys are the same requirement
  // stated as a concrete option name. Both are satisfied by one tolerance.
  const boundNeeds = requires.filter((r) => r === 'slippage' || isBoundNeed(r))
  const needsSlippage = boundNeeds.length > 0
  const unsupported = requires.filter((r) => r !== 'slippage' && !isBoundNeed(r))

  if (row.capabilities.length === 0) {
    return (
      <div className="text-xs opacity-60">
        {row.availability.reason ?? 'No actions available for this market'}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Verb picker — straight from capabilities, labelled by the server. */}
      <div role="tablist" className="tabs tabs-boxed tabs-xs">
        {row.capabilities.map((c) => (
          <button
            key={c.action}
            type="button"
            role="tab"
            className={`tab ${action === c.action ? 'tab-active' : ''}`}
            onClick={() => setAction(c.action)}
            title={c.async ? 'Settles asynchronously' : undefined}
          >
            {vocabLabel(vocab, 'action', c.action)}
          </button>
        ))}
      </div>

      {/* A venue that publishes accepted inputs takes ONLY those — a free
          token picker would offer assets its mint reverts on. */}
      {action === 'deposit' && inputs && inputs.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] opacity-60">Pay with</div>
          <div className="join">
            {inputs.map((i) => {
              const active = selectedInput?.asset === i.asset
              return (
                <button
                  key={i.asset}
                  type="button"
                  className={`btn btn-xs join-item ${active ? 'btn-active' : ''}`}
                  title={i.mode ? `route: ${i.mode}` : undefined}
                  onClick={() =>
                    setPayAsset(i.asset === 'native' ? undefined : (i.asset as Address))
                  }
                >
                  {i.symbol ?? (i.asset === 'native' ? 'ETH' : 'token')}
                </button>
              )
            })}
          </div>
          {selectedInput?.mode === 'submit-wrap' && (
            <div className="mt-1 text-[10px] opacity-60">
              Two legs: mints the base token, then wraps it.
            </div>
          )}
        </div>
      )}

      {/* Free selection only where the server says any asset is acceptable. */}
      {action === 'deposit' && !inputs?.length && capability?.acceptsPayAsset && (
        <div>
          <div className="mb-1 text-[11px] opacity-60">Pay with</div>
          <TokenSelector
            chainId={row.chainId}
            value={spendToken}
            onChange={(a) => setPayAsset(a)}
          />
          {payAsset && payAsset.toLowerCase() !== row.asset.address.toLowerCase() && (
            <div className="mt-1 text-[10px] opacity-60">
              Swapped to {row.asset.symbol} on deposit.
            </div>
          )}
        </div>
      )}

      <AmountInput
        value={amount}
        onChange={setAmount}
        maxAmount={maxAmount}
        onMaxClick={() => setAmount(maxAmount)}
        decimals={spendDecimals}
        usdValue={usdValue}
        label={
          <span className="text-[11px] opacity-60">
            {isExit && row.shareToken
              ? `${row.shareToken.symbol} to redeem`
              : `${row.asset.symbol} amount`}
          </span>
        }
      />

      {/* A bound is REQUIRED here, not optional: this venue settles against a
          book, so sending no limit accepts any fill. The server marks it on
          the capability; collecting it is the UI's job. */}
      {needsSlippage && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] opacity-60">
              Max slippage
              {capability?.via === 'swap'
                ? ' · traded on a market'
                : boundNeeds.some(isBoundNeed)
                  ? ` · sets ${boundNeeds.filter(isBoundNeed).join(', ')}`
                  : ''}
            </span>
            <div className="join">
              {['0.1', '0.5', '1'].map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`btn btn-xs join-item ${slippage === p ? 'btn-active' : ''}`}
                  onClick={() => setSlippage(p)}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
          <input
            type="number"
            className="input input-bordered input-sm w-full"
            value={slippage}
            min="0"
            step="0.1"
            onChange={(e) => setSlippage(e.target.value)}
          />
        </div>
      )}

      {/* Params the server says this action needs but the UI cannot supply
          yet — surfaced rather than silently omitted. */}
      {unsupported.length > 0 && (
        <div className="alert alert-warning py-2">
          <span className="text-[11px]">
            This action needs {unsupported.join(', ')} — not yet selectable here.
          </span>
        </div>
      )}

      {capability?.feeBps != null && capability.feeBps > 0 && (
        <div className="text-[11px] opacity-70">Instant-exit fee: {capability.feeBps} bps</div>
      )}

      {capability?.async && (
        <div className="text-[11px] opacity-70">
          Settles later — track it under pending withdrawals after submitting.
        </div>
      )}

      {!account ? (
        <WalletConnect />
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          // Execution lands with `/v1/actions/earn/{action}` (plan §5.2). Every
          // parameter it needs is already collected here — earnUid, the verb,
          // the amount, the pay asset — so this is wiring, not design.
          disabled
          title="Transaction building lands with the earn action dispatcher"
        >
          {vocabLabel(vocab, 'action', action)}
          {amount ? ` ${amount}` : ''}
        </button>
      )}
    </div>
  )
}
