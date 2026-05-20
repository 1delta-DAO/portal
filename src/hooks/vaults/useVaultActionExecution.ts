import { useEffect, useRef, useState } from 'react'
import { parseUnits } from 'viem'
import {
  fetchVaultAction,
  type VaultActionResponse,
  type VaultActionType,
  type VaultProvider,
} from '../../sdk/vaults-helper'
import { useSendLendingTransaction } from '../useSendLendingTransaction'
import { useDebounce } from '../useDebounce'

export interface UseVaultActionExecutionParams {
  actionType: VaultActionType
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
  /** Opt-in to provider-native flows (currently only fluid for fWETH `depositNative`). */
  provider?: VaultProvider
  /** Routing mode override. */
  mode?: 'auto' | 'direct' | 'proxy'
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
  error: string | null
  txSuccess: {
    actionType: VaultActionType
    amount: string
    symbol: string
    hash?: string
  } | null
  executeNextPermission: () => Promise<void>
  executeMain: () => Promise<void>
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
    provider,
    mode,
  } = params
  const effectiveReceiver = receiver && receiver.length > 0 ? receiver : account

  const { send } = useSendLendingTransaction({ chainId, account })

  const [result, setResult] = useState<VaultActionResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [executingPermission, setExecutingPermission] = useState(false)
  const [executingMain, setExecutingMain] = useState(false)
  const [permissionsCompleted, setPermissionsCompleted] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [txSuccess, setTxSuccess] = useState<UseVaultActionExecutionResult['txSuccess']>(null)

  const debouncedAmount = useDebounce(amount, 500)
  const fetchIdRef = useRef(0)

  const permissions = result?.permissions ?? []
  const hasPermissions = permissions.length > 0
  const allPermissionsDone = hasPermissions && permissionsCompleted >= permissions.length

  const resetState = () => {
    setResult(null)
    setError(null)
    setPermissionsCompleted(0)
    setTxSuccess(null)
    fetchIdRef.current++
  }

  const dismissSuccess = () => {
    setTxSuccess(null)
    setResult(null)
    setPermissionsCompleted(0)
  }

  useEffect(() => {
    if (!account || !vault || !underlying) {
      setResult(null)
      setError(null)
      return
    }

    const parsed = parseFloat(debouncedAmount || '0')
    if (parsed <= 0 && !isAll) {
      setResult(null)
      setError(null)
      setLoading(false)
      return
    }

    const fetchId = ++fetchIdRef.current
    const dec = decimals ?? 18

    const doFetch = async () => {
      setLoading(true)
      setError(null)
      setPermissionsCompleted(0)

      const parsedAmount = isAll ? '0' : parseUnits(debouncedAmount || '0', dec).toString()

      const response = await fetchVaultAction({
        actionType,
        chainId,
        vault,
        underlying,
        amount: parsedAmount,
        operator: account,
        receiver: effectiveReceiver,
        payAsset,
        receiveAsset,
        provider,
        mode,
        isAll,
        sharesRaw,
      })

      if (fetchIdRef.current !== fetchId) return

      setLoading(false)
      if (!response.success) {
        setError(response.error ?? 'Failed to build vault transaction')
        return
      }
      setResult(response.data ?? null)
    }

    doFetch()
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
    provider,
    mode,
    actionType,
    chainId,
  ])

  const executeNextPermission = async () => {
    if (!hasPermissions || permissionsCompleted >= permissions.length) return
    setExecutingPermission(true)
    setError(null)

    const perm = permissions[permissionsCompleted]
    const { ok, error: txError } = await send(perm)
    if (ok) {
      setPermissionsCompleted((prev) => prev + 1)
    } else {
      setError(txError ?? 'Permission transaction failed')
    }
    setExecutingPermission(false)
  }

  const executeMain = async () => {
    if (!result) return
    setExecutingMain(true)
    setError(null)

    let lastHash: string | undefined
    for (const tx of result.transactions) {
      const { ok, error: txError, hash } = await send(tx)
      if (!ok) {
        setError(txError ?? 'Transaction failed')
        setExecutingMain(false)
        return
      }
      lastHash = hash
    }

    setExecutingMain(false)
    setTxSuccess({
      actionType,
      amount,
      symbol: underlyingSymbol,
      hash: lastHash,
    })
  }

  return {
    result,
    loading,
    executingPermission,
    executingMain,
    permissions,
    hasPermissions,
    permissionsCompleted,
    allPermissionsDone,
    error,
    txSuccess,
    executeNextPermission,
    executeMain,
    resetState,
    dismissSuccess,
  }
}
