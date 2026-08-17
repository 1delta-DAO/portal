import { useState } from 'react'
import { useSendLendingTransaction, type LendingTx } from './useSendLendingTransaction'
import { useAtomicBatch } from './useAtomicBatch'

/**
 * The approvals + execute state machine, extracted so every flow that sends a
 * backend-built bundle (direct actions, refinance, migrate, vaults, earn)
 * drives the SAME logic instead of a copy.
 *
 * Owns: which permission is next, what is executing, the transaction error,
 * and the atomic (EIP-5792) path. Does NOT own fetching the bundle or what
 * "success" means — the caller passes the bundle in and gets `onDone(hash)`
 * back, because success UI differs per flow.
 */
export function usePermissionLadder(params: {
  chainId: string
  account?: string
  /** Permission (approval / permit) steps, executed one at a time, in order. */
  permissions: LendingTx[]
  /** The action's own transactions, executed after all permissions. */
  transactions: LendingTx[]
  /** Called with the last transaction hash once the main action landed. */
  onDone?: (hash?: string) => void
}) {
  const { chainId, account, permissions, transactions, onDone } = params

  const { send } = useSendLendingTransaction({ chainId, account })
  const {
    supported: batchSupported,
    needsUpgrade: batchNeedsUpgrade,
    sendBatch,
  } = useAtomicBatch({ chainId, account })

  /** Number of permissions that have been successfully executed */
  const [permissionsCompleted, setPermissionsCompleted] = useState(0)
  const [executingPermission, setExecutingPermission] = useState(false)
  const [executingMain, setExecutingMain] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasPermissions = permissions.length > 0
  const allPermissionsDone = !hasPermissions || permissionsCompleted >= permissions.length
  const executing = executingPermission || executingMain

  /** Call when a new bundle arrives (or the form resets): step back to zero. */
  const resetLadder = () => {
    setPermissionsCompleted(0)
    setError(null)
  }

  /** Execute the next pending permission transaction */
  const executeNextPermission = async () => {
    if (allPermissionsDone) return
    setExecutingPermission(true)
    setError(null)

    const { ok, error: txError } = await send(permissions[permissionsCompleted])
    if (ok) setPermissionsCompleted((prev) => prev + 1)
    else setError(txError ?? 'Permission transaction failed')
    setExecutingPermission(false)
  }

  const executeMain = async () => {
    setExecutingMain(true)
    setError(null)

    let lastHash: string | undefined
    for (const tx of transactions) {
      const { ok, error: txError, hash } = await send(tx)
      if (!ok) {
        setError(txError ?? 'Transaction failed')
        setExecutingMain(false)
        return
      }
      lastHash = hash
    }

    setExecutingMain(false)
    onDone?.(lastHash)
  }

  /**
   * Atomic path: permissions + the action's transactions in ONE confirmation.
   * Ordering is preserved inside the bundle, so approvals land before the call
   * that spends them, and an atomic revert leaves no dangling allowance.
   */
  const executeAll = async () => {
    setExecutingMain(true)
    setError(null)

    const { ok, error: txError, hash } = await sendBatch([...permissions, ...transactions])
    setExecutingMain(false)
    if (!ok) {
      setError(txError ?? 'Transaction failed')
      return
    }

    setPermissionsCompleted(permissions.length)
    onDone?.(hash)
  }

  return {
    permissions,
    hasPermissions,
    permissionsCompleted,
    allPermissionsDone,
    executing,
    executingPermission,
    executingMain,
    batchSupported,
    batchNeedsUpgrade,
    error,
    executeNextPermission,
    executeMain,
    executeAll,
    resetLadder,
  }
}

export type PermissionLadder = ReturnType<typeof usePermissionLadder>
