import { useEffect, useRef, useState } from 'react'
import { parseUnits } from 'viem'
import {
  fetchVaultAction,
  verbForActionType,
  type VaultActionResponse,
  type VaultActionType,
  type VaultActionVerb,
  type VaultFamily,
  type VaultProvider,
} from '../../sdk/vaults-helper'
import { useDebounce } from '../useDebounce'
import { usePermissionLadder } from '../usePermissionLadder'

export interface UseVaultActionExecutionParams {
  actionType: VaultActionType
  /**
   * Builder verb. Defaults to deposit/withdraw derived from `actionType`. Async
   * families pass `request-withdraw` here so the panel can keep a single tab.
   */
  verb?: VaultActionVerb
  /** The vault's provider — selects the calldata-builder family/route. */
  provider: VaultProvider
  /**
   * Route family override, for vaults whose provider alone doesn't determine
   * the route (savings withdrawals: `/savings` when the exit is
   * cooldown/request-based, the generic `/withdraw` when it is instant).
   * Resolve it with `withdrawFamily`.
   */
  family?: VaultFamily
  chainId: string
  account?: string
  /**
   * Address that should receive the resulting shares (deposit) or underlying
   * (withdraw). Defaults to `account` when omitted. Integrators typically use
   * this to test flows where the depositor and the share-token owner differ.
   */
  receiver?: string
  /** Vault contract address (the share token). */
  vault?: string
  /** Underlying ERC-20 the vault accepts. */
  underlying?: string
  /** Token decimals — used to parse the human-readable amount. */
  decimals?: number
  /** Decimal-string amount of underlying (deposit) or underlying-to-withdraw (withdraw). */
  amount: string
  /** Withdraw-all flag. When true, amount is ignored and the worker resolves shares. */
  isAll?: boolean
  /** Pre-fetched share balance for `isAll` withdraws (POST path). */
  sharesRaw?: string
  /** When set, the action is routed through the wrapper composer. */
  payAsset?: string
  /** Native-out toggle for withdraws (composer path — currently bugged upstream). */
  receiveAsset?: string
  /** Opt-in to provider-native deposit (currently only fluid for fWETH `depositNative`). */
  nativeProvider?: VaultProvider
  /** Routing mode override. */
  mode?: 'auto' | 'direct' | 'proxy'
  /**
   * Extra query params echoed verbatim into the builder — e.g. an LST
   * delegation choice under its `optionKey` (`validatorGroup`, `poolId`, …).
   */
  extraParams?: Record<string, string | number | undefined>
}

export interface UseVaultActionExecutionResult {
  result: VaultActionResponse | null
  loading: boolean
  executingPermission: boolean
  executingMain: boolean
  permissions: VaultActionResponse['permissions']
  hasPermissions: boolean
  permissionsCompleted: number
  allPermissionsDone: boolean
  /** Wallet can collapse the whole flow into one atomic confirmation. */
  batchSupported: boolean
  /** …but will prompt the EIP-7702 account upgrade the first time. */
  batchNeedsUpgrade: boolean
  error: string | null
  txSuccess: {
    actionType: VaultActionType
    amount: string
    symbol: string
    hash?: string
  } | null
  executeNextPermission: () => Promise<void>
  executeMain: () => Promise<void>
  executeAll: () => Promise<void>
  resetState: () => void
  dismissSuccess: () => void
}

/**
 * Mirror of `useActionExecution` but talks to /v1/actions/vaults.
 *
 * Differences from the lending equivalent:
 * - No simulation / health-factor / rate-impact projection (vaults don't have
 *   a borrow leg, so there's nothing to project).
 * - No sub-account routing.
 * - Withdraw-all uses the POST path when the caller supplies `sharesRaw`.
 *
 * The `symbol` carried into the success state is the *underlying* symbol —
 * passed by the caller (see VaultActionPanel) since this hook doesn't fetch
 * vault metadata.
 */
export function useVaultActionExecution(
  params: UseVaultActionExecutionParams,
  underlyingSymbol: string
): UseVaultActionExecutionResult {
  const {
    actionType,
    verb: verbOverride,
    provider,
    family,
    chainId,
    account,
    receiver,
    vault,
    underlying,
    decimals,
    amount,
    isAll,
    sharesRaw,
    payAsset,
    receiveAsset,
    nativeProvider,
    mode,
    extraParams,
  } = params
  const verb = verbOverride ?? verbForActionType(actionType)
  // Stable dep key so a changed delegation choice re-builds the transaction.
  const extraParamsKey = JSON.stringify(extraParams ?? {})
  const effectiveReceiver = receiver && receiver.length > 0 ? receiver : account

  const [result, setResult] = useState<VaultActionResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [txSuccess, setTxSuccess] = useState<UseVaultActionExecutionResult['txSuccess']>(null)

  const debouncedAmount = useDebounce(amount, 500)
  const fetchIdRef = useRef(0)

  const ladder = usePermissionLadder({
    chainId,
    account,
    permissions: result?.permissions ?? [],
    // Strict order: transactions → postTransactions (permissions already ran).
    transactions: result ? [...result.transactions, ...result.postTransactions] : [],
    onDone: (hash) =>
      setTxSuccess({
        actionType,
        amount,
        symbol: underlyingSymbol,
        hash,
      }),
  })

  const resetState = () => {
    setResult(null)
    setFetchError(null)
    setTxSuccess(null)
    ladder.resetLadder()
    fetchIdRef.current++
  }

  const dismissSuccess = () => {
    setTxSuccess(null)
    setResult(null)
    ladder.resetLadder()
  }

  useEffect(() => {
    if (!account || !vault || !underlying) {
      setResult(null)
      setFetchError(null)
      return
    }

    const parsed = parseFloat(debouncedAmount || '0')
    if (parsed <= 0 && !isAll) {
      setResult(null)
      setFetchError(null)
      setLoading(false)
      return
    }

    const fetchId = ++fetchIdRef.current
    const dec = decimals ?? 18

    const doFetch = async () => {
      setLoading(true)
      setFetchError(null)
      // A new bundle invalidates the approval progress: the amount an approval
      // was granted for is no longer the amount being sent.
      ladder.resetLadder()

      const parsedAmount = isAll ? '0' : parseUnits(debouncedAmount || '0', dec).toString()

      const response = await fetchVaultAction({
        verb,
        provider,
        family,
        chainId,
        vault,
        underlying,
        amount: parsedAmount,
        operator: account,
        receiver: effectiveReceiver,
        payAsset,
        receiveAsset,
        nativeProvider,
        mode,
        isAll,
        sharesRaw,
        ref: extraParams,
      })

      if (fetchIdRef.current !== fetchId) return

      setLoading(false)
      if (!response.success) {
        setFetchError(response.error ?? 'Failed to build vault transaction')
        return
      }
      setResult(response.data ?? null)
    }

    doFetch()
    // `ladder` is rebuilt per render; `ladder.resetLadder` only touches stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedAmount,
    vault,
    underlying,
    decimals,
    account,
    effectiveReceiver,
    isAll,
    sharesRaw,
    payAsset,
    receiveAsset,
    nativeProvider,
    provider,
    family,
    verb,
    mode,
    extraParamsKey,
    actionType,
    chainId,
  ])

  // The ladder owns the execution sequence; these wrappers only add the
  // "nothing to execute yet" guard.
  const executeMain = async () => {
    if (!result) return
    await ladder.executeMain()
  }

  const executeAll = async () => {
    if (!result) return
    await ladder.executeAll()
  }

  return {
    result,
    loading,
    executingPermission: ladder.executingPermission,
    executingMain: ladder.executingMain,
    permissions: result?.permissions ?? [],
    hasPermissions: ladder.hasPermissions,
    permissionsCompleted: ladder.permissionsCompleted,
    allPermissionsDone: ladder.allPermissionsDone,
    batchSupported: ladder.batchSupported,
    batchNeedsUpgrade: ladder.batchNeedsUpgrade,
    error: fetchError ?? ladder.error,
    txSuccess,
    executeNextPermission: ladder.executeNextPermission,
    executeMain,
    executeAll,
    resetState,
    dismissSuccess,
  }
}
