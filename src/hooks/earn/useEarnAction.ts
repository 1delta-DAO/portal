import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchEarnAction,
  type EarnActionResult,
  type FetchEarnActionParams,
} from '../../sdk/earn-helper/fetchEarnAction'
import { useSendLendingTransaction } from '../useSendLendingTransaction'
import { useDebounce } from '../useDebounce'

interface UseEarnActionParams
  extends Omit<FetchEarnActionParams, 'operator' | 'amount'> {
  chainId: string
  operator?: string
  /** Base units, as a decimal string. Empty / zero means "do not build yet". */
  amount?: string
  /** False while the panel knows the request would be incomplete. */
  enabled?: boolean
}

export interface EarnActionExecution {
  result: EarnActionResult | null
  loading: boolean
  error: string | null
  /** Approvals still to run, in order. */
  permissionsCompleted: number
  allPermissionsDone: boolean
  executing: boolean
  txHash: string | null
  executeNextPermission: () => Promise<void>
  executeMain: () => Promise<void>
  reset: () => void
}

/**
 * Fetch-and-send for one earn action.
 *
 * Mirrors `useActionExecution` (the direct lending panels) but takes its whole
 * request from the row's `earnUid` rather than from a `PoolDataItem`, because
 * that hook's inputs are lending-shaped — a market, a lender, a sub-account —
 * and a vault has none of them. What it deliberately keeps is the execution
 * SEQUENCE, which is not a detail: approvals run one at a time and in order,
 * and re-fetching mid-sequence would hand the wallet a stale approval.
 *
 * The debounce exists because the amount field drives this: every keystroke
 * would otherwise be a quote, and for a swap-routed venue a quote is a real
 * aggregator call.
 */
export function useEarnAction(params: UseEarnActionParams): EarnActionExecution {
  const {
    chainId,
    operator,
    amount,
    enabled = true,
    earnUid,
    action,
    ...rest
  } = params

  const { send } = useSendLendingTransaction({ chainId, account: operator })

  const [result, setResult] = useState<EarnActionResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [permissionsCompleted, setPermissionsCompleted] = useState(0)
  const [executing, setExecuting] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)

  const debouncedAmount = useDebounce(amount ?? '', 500)
  // Guards against an out-of-order response overwriting a newer one — the
  // classic amount-field race, where a slow quote for "1" lands after a fast
  // quote for "100" and the user signs the wrong number.
  const fetchIdRef = useRef(0)

  // Serialised so the sender always reads the CURRENT request rather than a
  // closure captured when the effect ran.
  const restKey = JSON.stringify(rest)

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
    setPermissionsCompleted(0)
    setTxHash(null)
  }, [])

  useEffect(() => {
    const hasAmount = !!debouncedAmount && debouncedAmount !== '0'
    // `claim` and `cancel` settle an EXISTING request, so they carry no amount
    // — requiring one would make those buttons permanently dead.
    const needsAmount = action !== 'claim' && action !== 'cancel'
    if (!enabled || !operator || (needsAmount && !hasAmount)) {
      setResult(null)
      setError(null)
      return
    }

    const id = ++fetchIdRef.current
    setLoading(true)
    setError(null)
    // A new quote invalidates the approval progress: the amount it was granted
    // for is no longer the amount being sent.
    setPermissionsCompleted(0)

    fetchEarnAction({
      earnUid,
      action,
      operator,
      amount: needsAmount ? debouncedAmount : undefined,
      ...(JSON.parse(restKey) as object),
    })
      .then((res) => {
        if (id !== fetchIdRef.current) return
        if (res.success) {
          setResult(res.result)
        } else {
          setResult(null)
          setError(res.error)
        }
      })
      .finally(() => {
        if (id === fetchIdRef.current) setLoading(false)
      })
  }, [enabled, operator, earnUid, action, debouncedAmount, restKey])

  const permissions = result?.permissions ?? []
  const allPermissionsDone = permissionsCompleted >= permissions.length

  const executeNextPermission = useCallback(async () => {
    const next = permissions[permissionsCompleted]
    if (!next) return
    setExecuting(true)
    setError(null)
    const res = await send(next)
    setExecuting(false)
    if (res.ok) setPermissionsCompleted((n) => n + 1)
    else setError(res.error ?? 'Approval failed')
  }, [permissions, permissionsCompleted, send])

  const executeMain = useCallback(async () => {
    if (!result || !allPermissionsDone) return
    setExecuting(true)
    setError(null)
    // Multi-step actions come back as an ORDERED array (an LST that mints then
    // wraps, a vault that settles then claims). Stopping on the first failure
    // is deliberate: step two on top of a failed step one is not a partial
    // success, it is a different transaction.
    for (const tx of result.transactions) {
      const res = await send(tx)
      if (!res.ok) {
        setExecuting(false)
        setError(res.error ?? 'Transaction failed')
        return
      }
      setTxHash(res.hash ?? null)
    }
    setExecuting(false)
    // The position changed, so the built calls describe a state that no longer
    // exists. Clearing forces a rebuild rather than leaving a stale one armed.
    setResult(null)
    setPermissionsCompleted(0)
  }, [result, allPermissionsDone, send])

  return {
    result,
    loading,
    error,
    permissionsCompleted,
    allPermissionsDone,
    executing,
    txHash,
    executeNextPermission,
    executeMain,
    reset,
  }
}
