import React, { useEffect, useMemo, useState } from 'react'
import { zeroAddress } from 'viem'
import { isWNative } from '../../../../../lib/lib-utils'
import { isValidAddress } from '../../../../../utils/addressValidation'
import type { RawCurrency } from '../../../../../types/currency'
import {
  vaultFamily,
  withdrawalStyle,
  type UserVaultItem,
  type VaultActionVerb,
  type VaultEntry,
} from '../../../../../sdk/vaults-helper'
import { useSyncChain } from '../../../../../hooks/useSyncChain'
import { useSpyMode } from '../../../../../contexts/SpyMode'
import { useUserVaults, useVaultActionExecution } from '../../../../../hooks/vaults'
import { AmountInput } from '../../../../common/AmountInput'
import { Logo } from '../../../../common/Logo'
import { WalletConnect } from '../../../../connect'
import { NativeCurrencySelector } from '../../../actions/NativeCurrencySelector'
import { SpyModeNotice } from '../../../shared/SpyModeNotice'
import { TransactionSuccess } from '../../../actions/TransactionSuccess'
import {
  formatTokenAmount,
  formatUsd,
  parseAmount,
} from '../../../actions/format'
import type { TokenBalance } from '../../../../../hooks/lending/useTokenBalances'
import {
  PROVIDER_LABELS,
  PROVIDER_LOGOS,
  formatSupplyRate,
  isSupplyRateMeaningful,
} from './helpers'
import { DelegationPicker } from './DelegationPicker'

type VaultAction = 'Deposit' | 'Withdraw'

interface VaultActionPanelProps {
  selected: VaultEntry | null
  chainId: string
  account?: string
  /** Wallet balance of the vault's underlying. */
  walletBalance: TokenBalance | null
  /** When the underlying is wrapped-native, the native token metadata. */
  nativeToken?: RawCurrency | null
  /** Wallet balance of the native token (when relevant). */
  nativeBalance?: TokenBalance | null
  /** User's existing position in this specific vault (when present). */
  userPosition: UserVaultItem | null
  /** Underlying token metadata from the chain token list. */
  underlyingToken?: RawCurrency
  isBalancesFetching?: boolean
  refetchBalances?: () => void
}

export const VaultActionPanel: React.FC<VaultActionPanelProps> = ({
  selected,
  chainId,
  account,
  walletBalance,
  nativeToken,
  nativeBalance,
  userPosition,
  underlyingToken,
  isBalancesFetching,
  refetchBalances,
}) => {
  const [tab, setTab] = useState<VaultAction>('Deposit')
  const [amount, setAmount] = useState('')
  const [useNative, setUseNative] = useState(false)
  const [isAll, setIsAll] = useState(false)
  // LST delegation choice (validator / group / pool id), null = server default.
  const [delegationChoice, setDelegationChoice] = useState<string | null>(null)
  // Custom-receiver state. `receiverOverride` is null when shares/underlying
  // should go to the operator (default); set to a checksum-validated address
  // when the integrator wants to test a flow where depositor ≠ receiver.
  const [receiverOverride, setReceiverOverride] = useState<string | null>(null)
  const [receiverDraft, setReceiverDraft] = useState('')
  const [editingReceiver, setEditingReceiver] = useState(false)

  const { syncChain, currentChainId } = useSyncChain()
  const { isSpyMode } = useSpyMode()
  const isWrongChain = !isSpyMode && !!account && currentChainId !== Number(chainId)

  const isWrappedNative = !!selected && isWNative(underlyingToken)
  const canUseNative = isWrappedNative && !!nativeToken
  // Provider-native depositNative is only supported by Fluid's fWETH today.
  const supportsProviderNativeDeposit =
    canUseNative && selected?.provider === 'fluid'

  // Reset state when the selected vault changes
  useEffect(() => {
    setAmount('')
    setUseNative(false)
    setIsAll(false)
    setDelegationChoice(null)
  }, [selected?.address.toLowerCase()])

  // For wrapped-native vaults, if the user holds native but no wrapped, default
  // the toggle to "native" so the wallet balance row is non-zero out of the box.
  useEffect(() => {
    if (!canUseNative || useNative || tab !== 'Deposit') return
    const wrappedBal = parseAmount(walletBalance?.balance ?? '0')
    const nativeBal = parseAmount(nativeBalance?.balance ?? '0')
    if (wrappedBal === 0 && nativeBal > 0) setUseNative(true)
  }, [canUseNative, useNative, walletBalance, nativeBalance, tab])

  const payAsset = canUseNative && useNative && tab === 'Deposit' ? zeroAddress : undefined
  const nativeProvider = supportsProviderNativeDeposit && useNative && tab === 'Deposit'
    ? selected?.provider
    : undefined

  // Async families (lst / gmx / lagoon) don't exit instantly — the Withdraw tab
  // builds a `request-withdraw` instead, and the matured request is claimed
  // later from the Pending Withdrawals list.
  const family = selected ? vaultFamily(selected.provider) : 'erc4626'
  const isAsyncWithdraw = tab === 'Withdraw' && withdrawalStyle(family) === 'async'
  const withdrawVerb: VaultActionVerb | undefined = isAsyncWithdraw
    ? 'request-withdraw'
    : undefined
  // request-withdraw takes the amount in share/LST units, so for async exits the
  // input maxes out on the share balance rather than the underlying-equivalent.
  const isAllDirect = tab === 'Withdraw' && !isAsyncWithdraw && isAll

  // LST delegation (validator / group / pool selection) — deposit-only. When a
  // choice is made, echo it back under the delegation's `optionKey`. A required
  // picker gates the deposit until a choice exists.
  const delegation = tab === 'Deposit' ? selected?.delegation : undefined
  const delegationReady = !delegation || !delegation.required || !!delegationChoice
  const extraParams = useMemo(
    () =>
      delegation && delegationChoice
        ? { [delegation.optionKey]: delegationChoice }
        : undefined,
    [delegation, delegationChoice]
  )

  const effectiveReceiver = receiverOverride ?? account

  const exec = useVaultActionExecution(
    {
      actionType: tab,
      verb: withdrawVerb,
      provider: selected?.provider ?? 'morpho',
      chainId,
      account,
      receiver: effectiveReceiver,
      vault: selected?.address,
      underlying: selected?.underlying,
      decimals: selected?.decimals,
      amount,
      isAll: isAllDirect,
      sharesRaw: isAllDirect ? userPosition?.sharesRaw : undefined,
      payAsset,
      nativeProvider,
      extraParams,
    },
    underlyingToken?.symbol ?? selected?.symbol ?? ''
  )

  // Fetch the receiver's existing position on the *selected* vault so the
  // integrator can see how much that address already holds. Only fires when
  // the override is a valid address and a vault is selected — otherwise the
  // hook's enabled gate keeps it idle. `includeZero` is on so freshly-empty
  // receivers still get a "0" line instead of a missing row.
  const receiverVaults = useMemo(
    () => (selected ? [selected.address] : []),
    [selected]
  )
  const {
    byVault: receiverByVault,
    isLoading: receiverLoading,
    error: receiverError,
    refetch: refetchReceiver,
  } = useUserVaults({
    chainId,
    account: receiverOverride ?? undefined,
    vaults: receiverVaults,
    includeZero: true,
    enabled: !!receiverOverride && !!selected,
  })
  const receiverPosition = useMemo(
    () => (selected ? receiverByVault.get(selected.address.toLowerCase()) ?? null : null),
    [selected, receiverByVault]
  )

  const activeBal = canUseNative && useNative && tab === 'Deposit' ? nativeBalance : walletBalance

  // For Withdraw, the "max" is the user's underlying-equivalent balance — except
  // async exits redeem in share units, so they max out on the share balance.
  const maxAmountStr =
    tab === 'Deposit'
      ? activeBal?.balance ?? '0'
      : isAsyncWithdraw
        ? userPosition?.shares ?? '0'
        : userPosition?.assets ?? '0'

  const overMax =
    !isAll &&
    parseAmount(maxAmountStr) > 0 &&
    parseAmount(amount) > parseAmount(maxAmountStr) + 1e-9

  // ---- Success state ----
  if (exec.txSuccess) {
    return (
      <TransactionSuccess
        actionType={exec.txSuccess.actionType as any}
        amount={exec.txSuccess.amount}
        symbol={exec.txSuccess.symbol}
        hash={exec.txSuccess.hash}
        onDismiss={() => {
          exec.dismissSuccess()
          setAmount('')
          setIsAll(false)
        }}
      />
    )
  }

  return (
    <div className="w-72 shrink-0 rounded-box border border-base-300 p-3 space-y-3 sticky top-4">
      {/* Provider header — selected vault's protocol */}
      {selected && (
        <div className="flex items-center gap-2 px-1">
          <Logo
            src={PROVIDER_LOGOS[selected.provider]}
            alt={PROVIDER_LABELS[selected.provider]}
            fallbackText={PROVIDER_LABELS[selected.provider]}
            className="rounded-full object-contain w-5 h-5 shrink-0"
          />
          <span className="font-semibold text-sm truncate">
            {PROVIDER_LABELS[selected.provider]}
          </span>
          <span className="ml-auto text-[10px] uppercase tracking-wider text-base-content/40">
            Vault
          </span>
        </div>
      )}

      <div role="tablist" className="tabs tabs-boxed tabs-xs">
        {(['Deposit', 'Withdraw'] as VaultAction[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            className={`tab ${tab === t ? 'tab-active' : ''}`}
            onClick={() => {
              setTab(t)
              setAmount('')
              setIsAll(false)
              setDelegationChoice(null)
              exec.resetState()
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Selected vault summary */}
      {selected ? (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-base-200">
          <Logo
            src={underlyingToken?.logoURI}
            alt={underlyingToken?.symbol ?? selected.symbol}
            fallbackText={underlyingToken?.symbol ?? selected.symbol}
            className="rounded-full object-contain w-8 h-8 shrink-0 token-logo"
          />
          <div className="flex flex-col min-w-0">
            <span className="font-medium text-sm truncate" title={selected.name}>
              {selected.name || selected.symbol}
            </span>
            <span className="text-xs text-base-content/60 truncate">
              {underlyingToken?.symbol ?? selected.symbol}
              {isSupplyRateMeaningful(selected) && (
                <span className="text-success ml-1">· {formatSupplyRate(selected)}</span>
              )}
            </span>
          </div>
        </div>
      ) : (
        <div className="text-sm text-base-content/60 text-center p-3 rounded-lg border border-dashed border-base-300">
          Click a row to select a vault
        </div>
      )}

      {/* Custom receiver row — surfaces the address that will own the shares
          (deposit) or receive the underlying (withdraw). Defaults to the
          operator; integrators can paste a different address to preview the
          flow and the receiver's current vault holding. */}
      {selected && (account || receiverOverride) && (
        <div className="rounded-lg border border-base-300 px-2 py-1.5 text-xs space-y-1">
          {editingReceiver ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-base-content/60">Receiver</span>
                <button
                  type="button"
                  className="text-[10px] text-base-content/40 hover:text-base-content"
                  onClick={() => {
                    setEditingReceiver(false)
                    setReceiverDraft('')
                  }}
                >
                  Cancel
                </button>
              </div>
              <input
                type="text"
                spellCheck={false}
                autoFocus
                className={`input input-bordered input-xs w-full font-mono ${
                  receiverDraft && !isValidAddress(receiverDraft) ? 'input-error' : ''
                }`}
                placeholder="0x… (defaults to operator)"
                value={receiverDraft}
                onChange={(e) => setReceiverDraft(e.target.value.trim())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isValidAddress(receiverDraft)) {
                    setReceiverOverride(receiverDraft)
                    setEditingReceiver(false)
                  } else if (e.key === 'Escape') {
                    setEditingReceiver(false)
                    setReceiverDraft('')
                  }
                }}
              />
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`text-[10px] ${
                    receiverDraft && !isValidAddress(receiverDraft)
                      ? 'text-error'
                      : 'text-base-content/40'
                  }`}
                >
                  {receiverDraft
                    ? isValidAddress(receiverDraft)
                      ? 'Valid checksum'
                      : 'Not a valid address'
                    : 'Paste an EVM address'}
                </span>
                <button
                  type="button"
                  className="btn btn-xs btn-primary"
                  disabled={!isValidAddress(receiverDraft)}
                  onClick={() => {
                    setReceiverOverride(receiverDraft)
                    setEditingReceiver(false)
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-base-content/60">Receiver</span>
                <div className="flex items-center gap-1">
                  <span
                    className="font-mono text-[11px] truncate max-w-35"
                    title={effectiveReceiver ?? ''}
                  >
                    {receiverOverride
                      ? `${receiverOverride.slice(0, 6)}…${receiverOverride.slice(-4)}`
                      : 'Operator'}
                  </span>
                  <button
                    type="button"
                    className="text-base-content/40 hover:text-base-content"
                    title="Edit receiver"
                    onClick={() => {
                      setReceiverDraft(receiverOverride ?? '')
                      setEditingReceiver(true)
                    }}
                  >
                    <svg
                      className="w-3 h-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                  {receiverOverride && (
                    <button
                      type="button"
                      className="text-base-content/40 hover:text-base-content"
                      title="Reset to operator"
                      onClick={() => {
                        setReceiverOverride(null)
                        setReceiverDraft('')
                      }}
                    >
                      <svg
                        className="w-3 h-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              {/* Receiver's current holding *inside the selected vault* —
                  not their wallet balance of the underlying. Surfaced so
                  integrators can watch the position accumulate post-deposit.
                  Label is explicit ("In vault") to avoid confusion with
                  spendable wallet balance. */}
              {receiverOverride && (
                <div
                  className="flex items-center justify-between text-[10px] text-base-content/60"
                  title="Receiver's position inside the selected vault (underlying-equivalent via current price-per-share)"
                >
                  <span>In vault</span>
                  {receiverLoading ? (
                    <span className="flex items-center gap-1">
                      <span className="loading loading-spinner w-2.5 h-2.5" />
                      Loading…
                    </span>
                  ) : receiverError ? (
                    <span className="flex items-center gap-1">
                      <span
                        className="text-error/80"
                        title={receiverError.message}
                      >
                        unavailable
                      </span>
                      <button
                        type="button"
                        className="text-base-content/40 hover:text-base-content"
                        title="Retry"
                        onClick={() => refetchReceiver()}
                      >
                        <svg
                          className="w-2.5 h-2.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 2v6h-6" />
                          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                          <path d="M3 22v-6h6" />
                          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                        </svg>
                      </button>
                    </span>
                  ) : receiverPosition ? (
                    <span
                      className="font-medium text-base-content/80"
                      title={`${receiverPosition.shares} ${receiverPosition.symbol} (shares)`}
                    >
                      ≈{formatTokenAmount(receiverPosition.assets)}{' '}
                      {underlyingToken?.symbol ?? receiverPosition.symbol}{' '}
                      <span className="text-base-content/50">
                        (${formatUsd(receiverPosition.balanceUSD)})
                      </span>
                    </span>
                  ) : (
                    <span className="text-base-content/40">—</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Wallet / connection state */}
      {isSpyMode && <SpyModeNotice />}
      {!isSpyMode && !account ? (
        <div className="w-full flex justify-center">
          <WalletConnect />
        </div>
      ) : !isSpyMode && isWrongChain ? (
        <button
          type="button"
          className="btn btn-warning btn-sm w-full"
          onClick={() => syncChain(Number(chainId))}
        >
          Switch Wallet Chain
        </button>
      ) : (
        <>
          {/* Native/wrapped selector (deposit only) */}
          {tab === 'Deposit' && canUseNative && nativeToken && (
            // The wrapped option is the underlying you pay with (e.g. WBNB),
            // not the vault share token (e.g. MEVBNB).
            <NativeCurrencySelector
              wrappedSymbol={underlyingToken?.symbol || selected!.symbol || 'TOKEN'}
              nativeToken={nativeToken}
              useNative={useNative}
              onChange={setUseNative}
              label="Pay with"
            />
          )}

          {/* Balance row */}
          {selected && (
            <div className="text-xs flex justify-between px-1">
              <span className="text-base-content/60 flex items-center gap-1">
                {tab === 'Deposit' ? 'Wallet balance' : 'Withdrawable'}:
                {refetchBalances && tab === 'Deposit' && (
                  <button
                    type="button"
                    className="text-base-content/30 hover:text-base-content/60 transition-colors"
                    onClick={refetchBalances}
                    title="Refresh balance"
                  >
                    {isBalancesFetching ? (
                      <span className="loading loading-spinner w-2.5 h-2.5" />
                    ) : (
                      <svg
                        className="w-2.5 h-2.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 2v6h-6" />
                        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                        <path d="M3 22v-6h6" />
                        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                      </svg>
                    )}
                  </button>
                )}
              </span>
              {tab === 'Deposit' ? (
                activeBal ? (
                  <span
                    className={`font-medium ${
                      parseAmount(activeBal.balance) === 0 ? 'text-base-content/40' : ''
                    }`}
                  >
                    {formatTokenAmount(activeBal.balance)} (${formatUsd(activeBal.balanceUSD)})
                  </span>
                ) : isBalancesFetching ? (
                  <span className="flex items-center gap-1 text-base-content/40">
                    <span className="loading loading-spinner w-3 h-3" />
                    Loading…
                  </span>
                ) : (
                  <span className="text-base-content/40">—</span>
                )
              ) : userPosition ? (
                <span className="font-medium">
                  {formatTokenAmount(userPosition.assets)} (${formatUsd(userPosition.balanceUSD)})
                </span>
              ) : (
                <span className="text-base-content/40">—</span>
              )}
            </div>
          )}

          {/* Withdraw: existing position info */}
          {tab === 'Withdraw' && userPosition && (
            <div className="text-xs flex justify-between px-1">
              <span className="text-base-content/60">Shares:</span>
              <span className="font-mono tabular-nums text-base-content/70">
                {formatTokenAmount(userPosition.shares)}
              </span>
            </div>
          )}

          {/* Amount input */}
          <AmountInput
            value={isAll ? '' : amount}
            onChange={(v) => {
              setAmount(v)
              if (isAll) setIsAll(false)
            }}
            maxAmount={maxAmountStr}
            onMaxClick={
              tab === 'Withdraw' && userPosition
                ? () => {
                    if (isAsyncWithdraw) {
                      // request-withdraw amount is in share units; no isAll path.
                      setIsAll(false)
                      setAmount(userPosition.shares)
                    } else {
                      setIsAll(true)
                      setAmount(userPosition.assets)
                    }
                  }
                : undefined
            }
            decimals={selected?.decimals}
            disabled={!selected || (tab === 'Withdraw' && !userPosition)}
            error={
              overMax
                ? `Exceeds ${tab === 'Deposit' ? 'wallet balance' : 'position'} (${formatTokenAmount(maxAmountStr)}).`
                : null
            }
          />

          {/* LST delegation picker (Deposit only) — validator / group / pool */}
          {tab === 'Deposit' && selected && delegation && (
            <DelegationPicker
              chainId={chainId}
              shareToken={selected.address}
              delegation={delegation}
              underlyingDecimals={underlyingToken?.decimals ?? selected.decimals}
              underlyingSymbol={underlyingToken?.symbol ?? selected.symbol}
              value={delegationChoice}
              onChange={setDelegationChoice}
            />
          )}

          {/* APR-derived monthly earnings estimate (Deposit only) */}
          {tab === 'Deposit' && selected && isSupplyRateMeaningful(selected) && (() => {
            const amt = parseAmount(amount)
            const px = selected.underlyingPriceUsd ?? userPosition?.priceUSD ?? 0
            const apr = selected.supplyRate ?? 0
            const monthly = amt > 0 && px > 0 && apr > 0 ? (amt * px * (apr / 100)) / 12 : 0
            if (monthly <= 0) return null
            return (
              <div className="text-xs flex items-center justify-between gap-2 px-1">
                <span className="text-base-content/60 whitespace-nowrap">Earnings / month</span>
                <span className="text-success font-medium whitespace-nowrap">
                  ~${formatUsd(monthly)}
                  <span className="text-base-content/40 font-normal ml-1">({apr.toFixed(2)}%)</span>
                </span>
              </div>
            )
          })()}

          {/* Async exit explainer — the request matures off-chain, then is
              claimed from the Pending Withdrawals list below the table. */}
          {isAsyncWithdraw && selected && (
            <div className="text-[11px] text-base-content/60 wrap-break-word px-1">
              {PROVIDER_LABELS[selected.provider]} withdrawals are asynchronous:
              this submits a redeem request. Once it matures, claim it from
              “Pending withdrawals”.
            </div>
          )}

          {exec.error && <div className="text-error text-xs wrap-break-word">{exec.error}</div>}

          {exec.loading && (
            <div className="flex items-center justify-center gap-2 py-1 text-xs text-base-content/60">
              <span className="loading loading-spinner loading-xs" />
              <span>Building transaction…</span>
            </div>
          )}

          {/* Delegation required but not yet chosen */}
          {tab === 'Deposit' && delegation?.required && !delegationReady && (
            <div className="text-[11px] text-warning px-1">
              Select a {delegation.kind === 'validatorGroup' ? 'validator group' : delegation.kind}{' '}
              to continue.
            </div>
          )}

          {/* Permissions */}
          {exec.result && !overMax && delegationReady && exec.hasPermissions && !exec.allPermissionsDone && (
            <div className="space-y-1">
              <span className="text-xs text-base-content/60">
                Approvals ({exec.permissionsCompleted}/{exec.permissions.length})
              </span>
              {exec.permissions.map((perm, i) => {
                const done = i < exec.permissionsCompleted
                const isCurrent = i === exec.permissionsCompleted
                return (
                  <button
                    key={i}
                    type="button"
                    className={`btn btn-sm w-full ${
                      done
                        ? 'btn-disabled btn-outline btn-success'
                        : isCurrent
                          ? 'btn-warning'
                          : 'btn-outline btn-ghost'
                    }`}
                    disabled={!isCurrent || exec.executingPermission}
                    onClick={isCurrent ? exec.executeNextPermission : undefined}
                    title={perm.description || `Approval ${i + 1}`}
                  >
                    <span className="truncate max-w-full">
                      {done
                        ? `✓ ${perm.description || `Approval ${i + 1}`}`
                        : isCurrent && exec.executingPermission
                          ? null
                          : perm.description || `Approval ${i + 1}`}
                      {isCurrent && exec.executingPermission && (
                        <span className="loading loading-spinner loading-xs" />
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Execute */}
          {exec.result && !overMax && delegationReady && (!exec.hasPermissions || exec.allPermissionsDone) && (
            <button
              type="button"
              className="btn btn-success btn-sm w-full"
              disabled={exec.executingMain}
              onClick={exec.executeMain}
            >
              {exec.executingMain ? (
                <span className="loading loading-spinner loading-xs" />
              ) : isAsyncWithdraw ? (
                'Request Withdrawal'
              ) : (
                `Execute ${tab}`
              )}
            </button>
          )}
        </>
      )}
    </div>
  )
}
