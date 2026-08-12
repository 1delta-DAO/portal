import React, { useEffect, useMemo, useState } from 'react'
import { zeroAddress, type Address } from 'viem'
import type { RawCurrency } from '../../../../types/currency'
import { AmountInput } from '../../../common/AmountInput'
import { TokenSelector } from '../../../token-selection'
import { WalletConnect } from '../../../connect'
import { useSpyAccount } from '../../../../contexts/SpyMode'
import { useBalanceQuery, type BalanceEntry } from '../../../../hooks/balances/useBalanceQuery'
import { parseUnits } from 'viem'
import { formatTokenAmount } from '../../../../utils/format'
import { useEarnAction } from '../../../../hooks/earn/useEarnAction'
import { getCurrency } from '../../../../lib/trade-helpers/utils'
import { UsdAmount } from '../../../common/UsdAmount'
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

/**
 * The chain's native coin, as the balances endpoint keys it.
 *
 * A capability input spells native as the literal `'native'` (it has no
 * address), so it needs translating in both directions — otherwise selecting
 * "ETH" leaves `payAsset` unset and the panel silently falls back to the
 * market's own asset, quoting and reading the balance of the wrong token.
 */
const NATIVE_ADDRESS = zeroAddress

/** `'native'` → the sentinel; anything else is already an address. */
const inputAddress = (asset: string): Address =>
  (asset === 'native' ? NATIVE_ADDRESS : asset) as Address

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
  const isCustomSpend =
    !!payAsset && payAsset.toLowerCase() !== defaultToken.toLowerCase()
  const spendDecimals = isCustomSpend
    ? // Real decimals where the token list has them, so a 50 % preset on USDC
      // produces 6 places and not 18. The quote re-derives them regardless.
      (getCurrency(row.chainId, payAsset!)?.decimals ?? 18)
    : isExit && row.shareToken
      ? row.shareToken.decimals
      : row.asset.decimals

  // Ask for EVERY asset the panel can offer, not just the selected one: the
  // accepted inputs render as buttons, and a user picking between ETH / stETH /
  // wstETH should see which of them they actually hold WITHOUT clicking each
  // and waiting for a refetch. One request covers them all.
  const currencies = useMemo<RawCurrency[]>(() => {
    const wanted = new Map<string, RawCurrency>()
    const add = (address: Address, decimals: number) => {
      const key = address.toLowerCase()
      if (!wanted.has(key))
        wanted.set(key, { chainId: row.chainId, address, decimals } as RawCurrency)
    }
    add(spendToken, spendDecimals)
    for (const c of row.capabilities)
      for (const i of c.inputs ?? []) add(inputAddress(i.asset), 18)
    return [...wanted.values()]
  }, [row.chainId, row.capabilities, spendToken, spendDecimals])

  // Nested chainId -> lowercased address -> entry, so index in two steps
  // rather than assuming a flat map.
  const { data: balances, isFetching: balancesFetching } = useBalanceQuery({
    currencies,
    enabled: !!account,
  })
  const balanceFor = (address: string): BalanceEntry | undefined =>
    balances?.[row.chainId]?.[address.toLowerCase()]
  const entry = balanceFor(spendToken)

  /**
   * Is the wallet balance the real ceiling for this action?
   *
   * For a deposit, and for redeeming a vault share the user holds as an ERC-20,
   * yes. For a LENDING withdrawal it is not: the bound is the supplied
   * position, and this row carries no position (plan §7). Offering the wallet
   * balance of USDC as the withdrawable amount would present a number that is
   * both wrong and confidently wrong — a user holding 5,000 USDC and supplying
   * none would be shown 5,000 as their max.
   */
  const walletBounds = !isExit || !!row.shareToken

  const maxAmount = walletBounds ? (entry?.balance ?? '0') : '0'

  /**
   * What the amount field is denominated in — the pay asset where the user
   * chose one, else the market's own asset (or its share token on an exit).
   */
  const spendSymbol = isCustomSpend
    ? // Never fall back to the MARKET's symbol here: pairing this row's number
      // with that row's name reads as a wrong balance, not a missing name.
      (selectedInputSymbol(row, row.chainId, payAsset!) ?? 'tokens')
    : isExit && row.shareToken
      ? row.shareToken.symbol
      : row.asset.symbol

  // Typing more than you hold is worth catching before the button, not after
  // the wallet rejects it.
  const amountExceedsBalance =
    walletBounds &&
    !!account &&
    !!amount &&
    Number(amount) > Number(entry?.balance ?? '0')

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
      inputs.find((i) => inputAddress(i.asset).toLowerCase() === want) ??
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

  /**
   * The amount in BASE UNITS, or undefined when the field cannot be parsed.
   *
   * `parseUnits` throws on partial input ("0.", "1.2.3"), which a user
   * produces constantly while typing — a throw here would blank the panel
   * mid-keystroke, so it degrades to "not ready to build" instead.
   */
  const amountRaw = useMemo(() => {
    if (!amount) return undefined
    try {
      const raw = parseUnits(amount, spendDecimals)
      return raw > 0n ? raw.toString() : undefined
    } catch {
      return undefined
    }
  }, [amount, spendDecimals])

  const exec = useEarnAction({
    chainId: row.chainId,
    earnUid: row.earnUid,
    action: (action || 'deposit') as any,
    operator: account,
    amount: amountRaw,
    // Deposits spend the pay asset; exits are denominated in the share token
    // where one exists, which is what `isShares` tells the builder.
    payAsset: isExit ? undefined : isCustomSpend ? payAsset : undefined,
    receiveAsset: isExit && isCustomSpend ? payAsset : undefined,
    isShares: isExit && !!row.shareToken,
    // Sent ONLY where the server said a bound is required. Sending it
    // unasked would look harmless but sets a limit on venues that price
    // deterministically, where any bound is noise the builder must interpret.
    slippage: needsSlippage ? Number(slippage) : undefined,
    // Blocked while a required param exists that this UI cannot collect —
    // building anyway produces a call that reverts or fills at any price.
    enabled: unsupported.length === 0 && row.capabilities.length > 0,
  })

  // Everything that must be true before the wallet is asked for anything.
  const submitBlockedReason = !capability
    ? 'Pick an action'
    : unsupported.length > 0
      ? `Needs ${unsupported.join(', ')}`
      : amountExceedsBalance
        ? `More than your ${spendSymbol} balance`
        : exec.loading
          ? 'Building the transaction…'
          : !exec.result
            ? 'Enter an amount'
            : !exec.allPermissionsDone
              ? 'Approve first'
              : undefined

  const canSubmit = !submitBlockedReason && !exec.executing

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
                  onClick={() => setPayAsset(inputAddress(i.asset))}
                >
                  {i.symbol ?? (i.asset === 'native' ? 'ETH' : 'token')}
                  {/* What the user holds of THIS option, so the choice can be
                      made without selecting each one in turn. Silent when the
                      balance is zero — a row of "0"s is noise. */}
                  {(balanceFor(inputAddress(i.asset))?.value ?? 0) > 0 && (
                    <span className="ml-1 opacity-50">
                      {formatTokenAmount(balanceFor(inputAddress(i.asset))!.value)}
                    </span>
                  )}
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

      {/* What the user actually holds of the asset they are about to spend.
          Rendered whenever an account is connected — INCLUDING at zero,
          because "you hold none of this" answers the same question, and
          hiding it leaves the user unsure whether the number merely failed to
          load. Its own row rather than the input's label, so it can occupy the
          full width without competing with the 25/50/75 presets. */}
      {account && walletBounds && (
        <div className="-mb-1 flex items-baseline justify-between text-[11px]">
          <span className="opacity-60">Your balance</span>
          {balancesFetching && !entry ? (
            <span className="loading loading-spinner h-3 w-3 opacity-40" />
          ) : (
            <button
              type="button"
              className="link-hover flex items-baseline gap-1 tabular-nums"
              onClick={() => setAmount(maxAmount)}
              title={`Use your full ${spendSymbol} balance`}
            >
              <span className="font-medium">
                {formatTokenAmount(entry?.value ?? 0)} {spendSymbol}
              </span>
              {(entry?.balanceUSD ?? 0) > 0 && (
                <UsdAmount value={entry!.balanceUSD} plain className="opacity-60" />
              )}
            </button>
          )}
        </div>
      )}

      {/* A lending withdrawal is bounded by the SUPPLIED position, which this
          row does not carry — so no wallet number is shown rather than a
          plausible wrong one. */}
      {account && !walletBounds && (
        <div className="text-[11px] opacity-60">
          Bounded by your supplied position, not your wallet balance.
        </div>
      )}

      <AmountInput
        value={amount}
        onChange={setAmount}
        maxAmount={maxAmount}
        onMaxClick={() => setAmount(maxAmount)}
        decimals={spendDecimals}
        usdValue={usdValue}
        error={amountExceedsBalance ? `Exceeds your ${spendSymbol} balance` : null}
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

      {exec.error && (
        <div className="alert alert-error py-2">
          <span className="break-words text-[11px]">{exec.error}</span>
        </div>
      )}

      {!account ? (
        <WalletConnect />
      ) : (
        <div className="flex flex-col gap-1.5">
          {/* Approvals first, one at a time and in order. Showing them as
              their own steps rather than folding them into the action button
              is what lets a user see WHY a wallet prompt appeared — the
              backend labels each one. */}
          {exec.result && exec.result.permissions.length > 0 && !exec.allPermissionsDone && (
            <>
              <span className="text-[11px] opacity-60">
                Approvals ({exec.permissionsCompleted}/{exec.result.permissions.length})
              </span>
              {exec.result.permissions.map((perm, i) => {
                const done = i < exec.permissionsCompleted
                const current = i === exec.permissionsCompleted
                return (
                  <button
                    key={`${perm.to}-${i}`}
                    type="button"
                    className={`btn btn-xs ${
                      done
                        ? 'btn-outline btn-success btn-disabled'
                        : current
                          ? 'btn-warning'
                          : 'btn-outline btn-ghost'
                    }`}
                    disabled={!current || exec.executing}
                    onClick={current ? exec.executeNextPermission : undefined}
                  >
                    {done ? '✓ ' : ''}
                    {perm.description || `Approval ${i + 1}`}
                  </button>
                )
              })}
            </>
          )}

          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!canSubmit}
            title={submitBlockedReason}
            onClick={exec.executeMain}
          >
            {exec.loading
              ? 'Building…'
              : exec.executing
                ? 'Confirm in wallet…'
                : `${vocabLabel(vocab, 'action', action)}${amount ? ` ${amount}` : ''}`}
          </button>

          {exec.txHash && (
            <span className="text-[11px] opacity-60">
              Submitted · {exec.txHash.slice(0, 10)}…
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Symbol for a chosen pay asset, from what the SERVER published about it.
 *
 * Not looked up in a token list: the accepted inputs are the only assets this
 * panel offers, and they already carry their symbols. A second source would be
 * a second thing to get out of date.
 */
function selectedInputSymbol(
  row: EarnMarket,
  chainId: string,
  payAsset: Address,
): string | undefined {
  const want = payAsset.toLowerCase()
  for (const c of row.capabilities)
    for (const i of c.inputs ?? [])
      if (inputAddress(i.asset).toLowerCase() === want) return i.symbol
  if (want === row.asset.address.toLowerCase()) return row.asset.symbol
  // A freely-selected pay asset is not in `capabilities`, so fall back to the
  // token list. Returning undefined here would label the balance with the
  // MARKET's symbol while showing the selected token's number — a mismatch
  // that reads as a wrong balance rather than a missing name.
  return getCurrency(chainId, want)?.symbol
}
