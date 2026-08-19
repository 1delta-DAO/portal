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
import { isWNative } from '../../../../lib/lib-utils'
import { UsdAmount } from '../../../common/UsdAmount'
import { ErrorAlert } from '../../../common/ErrorAlert'
import {
  vocabLabel,
  type EarnActionInput,
  type EarnCapability,
  type EarnMarket,
  type EarnVaultPosition,
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
  /**
   * The user's position in THIS row, when they hold one.
   *
   * Only load-bearing for an exit from a vault with no share token, where the
   * wallet cannot supply the bound — see `positionBounds` below. Absent for
   * every other shape, which stays wallet-bounded exactly as before.
   */
  position?: EarnVaultPosition
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
export const EarnActionPanel: React.FC<Props> = ({ row, vocab, position }) => {
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
  const isCustomSpend = !!payAsset && payAsset.toLowerCase() !== defaultToken.toLowerCase()
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
    for (const c of row.capabilities) for (const i of c.inputs ?? []) add(inputAddress(i.asset), 18)
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
   * position. Offering the wallet balance of USDC as the withdrawable amount
   * would present a number that is both wrong and confidently wrong — a user
   * holding 5,000 USDC and supplying none would be shown 5,000 as their max.
   */
  const walletBounds = !isExit || !!row.shareToken

  /**
   * A vault position that has NO share token — the exit bound the wallet
   * cannot supply.
   *
   * Frankencoin's savings module is the case that forced this: it mints no
   * token, so `row.shareToken` is absent and `balanceOf` reverts on the module
   * address. The panel therefore fell to `maxAmount = '0'`, which disabled
   * Withdraw entirely for a funded account and told them the bound was "your
   * supplied position" while showing none of it.
   *
   * The position IS known — the Unified tab already fetched it — so it is
   * passed in rather than re-read. Denominated in the underlying (the module
   * has no shares and its exchange rate is pinned at par), which is exactly
   * what `withdraw(target, amount)` takes.
   */
  const positionBounds = isExit && !row.shareToken && !!position

  const maxAmount = walletBounds
    ? (entry?.balance ?? '0')
    : positionBounds
      ? (position!.assets ?? '0')
      : '0'

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

  /**
   * What a route PAYS OUT — the other end of the trade from `spendSymbol`.
   *
   * A deposit lands in the market's asset; an exit lands in whatever the user
   * chose to receive, which is the same `payAsset` field read the other way
   * round (see the `receiveAsset` argument below).
   */
  const receiveSymbol = isExit
    ? isCustomSpend
      ? (getCurrency(row.chainId, payAsset!)?.symbol ?? row.asset.symbol)
      : row.asset.symbol
    : row.asset.symbol

  // Typing more than you hold is worth catching before the button, not after
  // the wallet rejects it.
  const amountExceedsBalance =
    walletBounds && !!account && !!amount && Number(amount) > Number(entry?.balance ?? '0')

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

  /**
   * Does the chosen pay asset route through a third-party AGGREGATOR?
   *
   * Any row advertising `acceptsPayAsset` — lending markets, and (phase 3)
   * plain-4626 vault rows — serves the conversion on two different paths,
   * mirroring the worker's dispatch:
   *
   *  - **direct** — no aggregator. The pay asset matches the market's asset,
   *    or it is native paid into a wrapped-native market (a deterministic
   *    wrap — no price exists to bound).
   *  - **swap** — anything else is quoted through an aggregator, and that
   *    route REQUIRES `slippage` (it 400s "Missing 'slippage'" without it).
   *
   * The capability cannot state this per pay asset — it depends on what the
   * user picks — so the split is derived here. Over-detecting is safe (a
   * direct builder ignores an unneeded bound); under-detecting is the 400.
   */
  const isAggregatorSwap =
    !!capability?.acceptsPayAsset &&
    !isExit &&
    isCustomSpend &&
    !(
      payAsset === NATIVE_ADDRESS &&
      isWNative(
        getCurrency(row.chainId, row.asset.address) ?? {
          chainId: row.chainId,
          address: row.asset.address,
          decimals: row.asset.decimals,
          symbol: row.asset.symbol,
        }
      )
    )

  const needsSlippage = boundNeeds.length > 0 || isAggregatorSwap
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
    // Sent where the server said a bound is required, OR where the chosen
    // pay asset routes through an aggregator (the swap branch 400s without
    // it). Still withheld everywhere else: an unasked bound on a venue that
    // prices deterministically is noise the builder must interpret.
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
            : exec.needsSignature
              ? 'Needs an off-chain signature, which this panel cannot collect yet'
              : !exec.allPermissionsDone
                ? 'Approve first'
                : undefined

  const canSubmit = !submitBlockedReason && !exec.executing

  if (row.capabilities.length === 0) {
    return (
      <div className="text-xs text-base-content/50">
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
            onClick={() => {
              setAction(c.action)
              // The pay asset and amount belong to the verb they were entered
              // for. Carrying a deposit's pay asset into a withdraw silently
              // turned it into `receiveAsset` and re-denominated the amount
              // field in a token the exit never touches.
              setPayAsset(undefined)
              setAmount('')
            }}
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
          <div className="mb-1 text-xs text-base-content/50">Pay with</div>
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
                    <span className="ml-1 tabular-nums text-base-content/50">
                      {formatTokenAmount(balanceFor(inputAddress(i.asset))!.value)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {selectedInput?.mode === 'submit-wrap' && (
            <div className="mt-1 text-[10px] text-base-content/50">
              Two legs: mints the base token, then wraps it.
            </div>
          )}
        </div>
      )}

      {/* Free selection only where the server says any asset is acceptable. */}
      {action === 'deposit' && !inputs?.length && capability?.acceptsPayAsset && (
        <div>
          <div className="mb-1 text-xs text-base-content/50">Pay with</div>
          <TokenSelector
            chainId={row.chainId}
            value={spendToken}
            onChange={(a) => setPayAsset(a)}
          />
          {isCustomSpend && (
            <div className="mt-1 text-[10px] text-base-content/50">
              {isAggregatorSwap
                ? // The amount entered is the PAY asset spent (the swap is
                  // exact-in) — say so, or the field reads as "how much
                  // ${row.asset.symbol} arrives".
                  `You spend ${spendSymbol}; it is swapped to ${row.asset.symbol} via an aggregator on deposit.`
                : `Wrapped to ${row.asset.symbol} on deposit.`}
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
        <div className="-mb-1 flex items-baseline justify-between text-xs">
          <span className="text-base-content/50">Your balance</span>
          {balancesFetching && !entry ? (
            <span className="loading loading-spinner h-3 w-3 text-base-content/40" />
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
                <UsdAmount value={entry!.balanceUSD} plain className="text-base-content/50" />
              )}
            </button>
          )}
        </div>
      )}

      {/* Bounded by the SUPPLIED position, not the wallet. Where the position
          is known (a share-less vault) the number is shown — saying "bounded
          by your position" while offering no figure and a Max of 0 reads as
          "you have nothing", which is how a funded savings account looked.
          A lending row still carries no position here, so it stays a bare
          note rather than a plausible wrong number. */}
      {account && !walletBounds && (
        <div className="flex items-center justify-between gap-2 text-xs text-base-content/50">
          <span>Bounded by your supplied position, not your wallet balance.</span>
          {positionBounds && (
            <button
              type="button"
              className="font-medium text-base-content/70 hover:text-base-content"
              onClick={() => setAmount(maxAmount)}
            >
              {formatTokenAmount(Number(position!.assets ?? 0))} {spendSymbol}
            </button>
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
        error={amountExceedsBalance ? `Exceeds your ${spendSymbol} balance` : null}
        label={
          <span className="text-xs text-base-content/50">
            {/* Denominated in what the user SPENDS. For a pay-asset zap the
                swap is exact-in, so the amount is the pay asset — labelling
                it with the market's symbol paired this field's number with a
                different token's name. */}
            {isExit && row.shareToken
              ? `${row.shareToken.symbol} to redeem`
              : `${spendSymbol} amount`}
          </span>
        }
      />

      {/* A bound is REQUIRED here, not optional: this venue settles against a
          book, so sending no limit accepts any fill. The server marks it on
          the capability; collecting it is the UI's job. */}
      {needsSlippage && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-base-content/50">
              Max slippage
              {capability?.via === 'swap'
                ? ' · traded on a market'
                : isAggregatorSwap
                  ? ' · swapped via an aggregator'
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
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-2 py-1.5 text-xs text-warning">
          This action needs {unsupported.join(', ')} — not yet selectable here.
        </div>
      )}

      {capability?.feeBps != null && capability.feeBps > 0 && (
        <div className="text-xs text-base-content/70">
          Instant-exit fee: {capability.feeBps} bps
        </div>
      )}

      {capability?.async && (
        <div className="text-xs text-base-content/70">
          Settles later — track it under pending withdrawals after submitting.
        </div>
      )}

      {/* Route choice. Present only where the server actually quoted more than
          one aggregator for the same action — which is the trades (a Pendle
          PT, a secondary-market row, a pay-asset zap), never a plain deposit.
          Showing the winner alone was hiding a real price difference: the
          venue's own AMM and a general aggregator routing into it can be half
          a percent apart on the same PT. */}
      {exec.routes.length > 1 && (
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-xs text-base-content/50">Route</span>
            <span className="text-[10px] text-base-content/40">
              {exec.routes.length} quotes · best first
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {exec.routes.map((r, i) => {
              const selected = i === exec.selectedRoute
              const best = exec.routes[0]?.tradeOutput
              // Against the BEST quote, not against the selected one — the
              // reference has to stay put as the user clicks through, or every
              // route reads as 0 % the moment it is picked.
              const delta =
                r.tradeOutput != null && best != null && best > 0
                  ? ((r.tradeOutput - best) / best) * 100
                  : undefined
              return (
                <button
                  key={`${r.aggregator}-${i}`}
                  type="button"
                  className={`flex items-center justify-between rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                    selected
                      ? 'border-primary bg-primary/10'
                      : 'border-base-300 bg-base-200/50 hover:bg-base-200'
                  }`}
                  onClick={() => exec.selectRoute(i)}
                >
                  <span className="font-semibold">{r.aggregator}</span>
                  <span className="flex items-baseline gap-1.5 tabular-nums">
                    {r.tradeOutput != null && (
                      <span className="text-success">
                        {formatTokenAmount(r.tradeOutput)} {receiveSymbol}
                      </span>
                    )}
                    {delta != null && delta < -0.0001 && (
                      <span className="text-base-content/40">{delta.toFixed(2)}%</span>
                    )}
                    {i === 0 && <span className="badge badge-ghost badge-xs">best</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {exec.error && <ErrorAlert error={exec.error} title="Transaction error" />}

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
              <span className="text-xs text-base-content/50">
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
            <span className="text-xs text-base-content/50">
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
  payAsset: Address
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
