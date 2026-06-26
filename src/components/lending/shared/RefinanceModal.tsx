import React, { useEffect, useMemo, useState } from 'react'
import { parseUnits } from 'viem'
import type { PoolDataItem } from '../../../hooks/lending/usePoolData'
import type { UserPositionEntry } from '../../../hooks/lending/useUserData'
import { useSendLendingTransaction } from '../../../hooks/useSendLendingTransaction'
import { useDebounce } from '../../../hooks/useDebounce'
import {
  fetchRefinance,
  type RefinanceResult,
} from '../../../sdk/lending-helper/fetchRefinance'
import { AmountInput } from '../../common/AmountInput'
import { formatTokenAmount } from '../../../utils/format'
import {
  loanDebtString,
  closeNowAmountString,
  termLabel,
  loanRatePct,
  hasEarlyRepayPenalty,
  maturityDisplay,
} from './brokeredLoans'

interface RefinanceModalProps {
  /** The brokered debt market the loan belongs to (carries the `terms[]` rate card). */
  pool: PoolDataItem
  /** The source loan to refinance / roll over (a per-loan brokered row). */
  loan: UserPositionEntry
  account: string
  chainId: string
  onClose: () => void
}

/**
 * Refinance / roll-over a Lista DAO broker loan into a fresh fixed term.
 * Opens from a loan row in `YourPositions`. A flex/dynamic source is
 * "refinanced" into a fixed term; a fixed source is "rolled over" into a
 * different (or fresh same-duration) term. Flash-loan-backed server-side, so
 * it works at any LTV — see `fetchRefinance` + the loop-refinance OpenAPI.
 */
export const RefinanceModal: React.FC<RefinanceModalProps> = ({
  pool,
  loan,
  account,
  chainId,
  onClose,
}) => {
  const decimals = pool.asset?.decimals ?? 18
  const symbol = pool.asset?.symbol ?? ''
  const terms = pool.terms ?? []

  const isDynamicSource = loan.term?.isDynamic === true
  // Omit fromLoanId for the dynamic/flex source (server defaults to it); pass
  // the posId for a fixed source to roll that specific loan over.
  const fromLoanId = isDynamicSource ? undefined : loan.term?.loanId
  const sourceTermId = loan.term?.termId

  // Default the target to a term that differs from the source's, else the first.
  const defaultTermId = useMemo(() => {
    const differing = terms.find((t) => t.termId !== sourceTermId)
    return (differing ?? terms[0])?.termId ?? null
  }, [terms, sourceTermId])

  const [termId, setTermId] = useState<number | null>(defaultTermId)
  // Display value is the close-now estimate; the actual full-close amount is sized server-side
  // (live balance + margin), so we don't bake a frontend buffer in here — that only made the
  // pre-filled value disagree with the "Max" button.
  const closeNowStr = closeNowAmountString(loan)
  const [amount, setAmount] = useState(closeNowStr)
  // Default intent is a FULL close: the server sizes the flash from the source loan's borrow
  // balance (+ a small margin), so a stale snapshot amount can't fall short and revert
  // `REMAIN_BORROW_TOO_LOW`. Typing a value drops to a partial re-fix at exactly that amount;
  // pressing "Max" goes back to a full close.
  const [isFullClose, setIsFullClose] = useState(true)

  // Typing / 25-50-75 presets ⇒ partial re-fix at that amount.
  const handleAmountChange = (next: string) => {
    setIsFullClose(false)
    setAmount(next)
  }
  // "Max" ⇒ full close (server-sized), NOT a partial at the snapshot. Mirror the estimate for show.
  const handleMaxClick = () => {
    setIsFullClose(true)
    setAmount(closeNowStr)
  }

  const [result, setResult] = useState<RefinanceResult['data'] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [permissionsCompleted, setPermissionsCompleted] = useState(0)
  const [executingPermission, setExecutingPermission] = useState(false)
  const [executingMain, setExecutingMain] = useState(false)
  const [done, setDone] = useState<{ hash?: string } | null>(null)

  const { send } = useSendLendingTransaction({ chainId, account })

  const debouncedAmount = useDebounce(amount, 500)
  const permissions = result?.permissions ?? []
  const hasPermissions = permissions.length > 0
  const allPermissionsDone = !hasPermissions || permissionsCompleted >= permissions.length

  const debtStr = loanDebtString(loan)
  const penaltyStr = loan.term?.earlyRepayPenalty ?? '0'

  // Auto-fetch the refinance bundle on amount / term / mode change.
  useEffect(() => {
    if (termId == null) {
      setResult(null)
      return
    }

    // Partial re-fix needs a positive amount; full close is sized server-side from the borrow
    // balance, so it doesn't.
    const toWei = (v: string): string | undefined => {
      const n = parseFloat(v || '0')
      if (!(n > 0)) return undefined
      try {
        return parseUnits(v as `${number}`, decimals).toString()
      } catch {
        return undefined
      }
    }
    const amountWei = toWei(debouncedAmount)
    if (!isFullClose && !amountWei) {
      setResult(null)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      setPermissionsCompleted(0)
      const res = await fetchRefinance({
        marketUid: pool.marketUid,
        operator: account,
        termId,
        fromLoanId,
        // Full close: send ONLY the borrow balance — the server sizes from it (max with its own
        // live read) + margin. Do NOT pass the stale display `amount` (sending it as a partial is
        // exactly what left dust and reverted). Partial: send the explicit amount.
        ...(isFullClose
          ? {
              isAll: true,
              borrowBalance: toWei(debtStr),
              earlyRepayPenalty: toWei(penaltyStr),
            }
          : { amount: amountWei }),
      })
      if (cancelled) return
      setLoading(false)
      if (!res.success) {
        setError(res.error ?? 'Failed to build refinance transaction')
        setResult(null)
        return
      }
      setResult(res.data ?? null)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [
    debouncedAmount,
    termId,
    pool.marketUid,
    account,
    fromLoanId,
    decimals,
    isFullClose,
    debtStr,
    penaltyStr,
  ])

  const executeNextPermission = async () => {
    if (allPermissionsDone) return
    setExecutingPermission(true)
    setError(null)
    const { ok, error: txError } = await send(permissions[permissionsCompleted])
    if (ok) setPermissionsCompleted((p) => p + 1)
    else setError(txError ?? 'Permission transaction failed')
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
    setDone({ hash: lastHash })
  }

  const targetTerm = terms.find((t) => t.termId === termId) ?? null
  const ratePct = loanRatePct(loan)
  const mat = maturityDisplay(loan)
  const hasPenalty = hasEarlyRepayPenalty(loan)

  return (
    <div className="modal modal-open" onClick={onClose}>
      <div className="modal-box max-w-sm" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
          onClick={onClose}
        >
          ✕
        </button>

        <h3 className="text-sm font-semibold mb-3">
          {isDynamicSource ? 'Refinance to fixed term' : 'Roll over loan'}
        </h3>

        {done ? (
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-2 py-4">
              <div className="text-success text-3xl">✓</div>
              <div className="text-sm font-medium">Refinance submitted</div>
              {done.hash && (
                <div className="text-[11px] font-mono text-base-content/50 break-all px-2 text-center">
                  {done.hash}
                </div>
              )}
            </div>
            <button type="button" className="btn btn-sm w-full" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Source loan summary */}
            <div className="rounded-lg border border-base-300 bg-base-200/50 px-2.5 py-1.5 space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-base-content/50">
                From
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="font-semibold">{termLabel(loan)}</span>
                  {ratePct != null && (
                    <span className="font-mono tabular-nums text-warning">
                      {ratePct.toFixed(2)}%
                    </span>
                  )}
                  {mat.isPast && (
                    <span className="badge badge-xs bg-warning/15 text-warning border-0">
                      Matured
                    </span>
                  )}
                </span>
                <span className="font-mono tabular-nums text-error shrink-0">
                  {formatTokenAmount(debtStr)} {symbol}
                </span>
              </div>
              {hasPenalty && (
                <div className="text-[11px] text-warning/80 flex justify-between">
                  <span>Early-repay penalty</span>
                  <span className="font-mono tabular-nums">
                    +{formatTokenAmount(loan.term?.earlyRepayPenalty ?? '0')} {symbol}
                  </span>
                </div>
              )}
            </div>

            {/* Target term picker */}
            <div className="space-y-1.5">
              <span className="text-xs text-base-content/60 px-1">To term</span>
              {terms.length === 0 ? (
                <div className="text-[11px] text-error px-1">
                  No fixed terms available for this market.
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {terms.map((t) => {
                    const active = t.termId === termId
                    const isSource = t.termId === sourceTermId
                    return (
                      <button
                        key={t.termId}
                        type="button"
                        onClick={() => setTermId(t.termId)}
                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                          active
                            ? 'border-primary bg-primary/10 ring-1 ring-primary'
                            : 'border-base-300 bg-base-200/50 hover:bg-base-200'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-xs">
                          <span className="font-semibold">{t.durationDays}-day</span>
                          {isSource && (
                            <span className="text-[10px] text-base-content/40">(current)</span>
                          )}
                        </span>
                        <span className="font-mono tabular-nums text-xs text-warning">
                          {t.apr.toFixed(2)}%
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Amount */}
            <AmountInput
              value={amount}
              onChange={handleAmountChange}
              onMaxClick={handleMaxClick}
              maxAmount={closeNowStr}
              decimals={decimals}
              label={
                <span className="flex items-center gap-1.5">
                  Amount
                  {isFullClose && (
                    <span className="badge badge-xs bg-primary/15 text-primary border-0">
                      full close
                    </span>
                  )}
                </span>
              }
            />
            <div className="text-[11px] text-base-content/50 px-1">
              {isFullClose
                ? 'Closes the source loan fully — sized from its live balance at execution; excess is automatically refunded.'
                : 'Partial re-fix: keeps the remainder in the source loan. Both the new and remaining loans must clear the market minimum.'}
            </div>

            {error && <div className="text-error text-xs wrap-break-word">{error}</div>}

            {loading && (
              <div className="flex items-center justify-center gap-2 py-1 text-xs text-base-content/60">
                <span className="loading loading-spinner loading-xs" />
                <span>Building transaction...</span>
              </div>
            )}

            {/* Permissions */}
            {result && hasPermissions && !allPermissionsDone && (
              <div className="space-y-1">
                <span className="text-xs text-base-content/60">
                  Approvals ({permissionsCompleted}/{permissions.length})
                </span>
                {permissions.map((perm, i) => {
                  const isDonePerm = i < permissionsCompleted
                  const isCurrent = i === permissionsCompleted
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`btn btn-sm w-full ${
                        isDonePerm
                          ? 'btn-disabled btn-outline btn-success'
                          : isCurrent
                            ? 'btn-warning'
                            : 'btn-outline btn-ghost'
                      }`}
                      disabled={!isCurrent || executingPermission}
                      onClick={isCurrent ? executeNextPermission : undefined}
                      title={perm.description || `Approval ${i + 1}`}
                    >
                      <span className="truncate max-w-full">
                        {isDonePerm ? (
                          `✓ ${perm.description || `Approval ${i + 1}`}`
                        ) : isCurrent && executingPermission ? (
                          <span className="loading loading-spinner loading-xs" />
                        ) : (
                          perm.description || `Approval ${i + 1}`
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {result && allPermissionsDone && (
              <button
                type="button"
                className="btn btn-success btn-sm w-full"
                disabled={executingMain}
                onClick={executeMain}
              >
                {executingMain ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : isDynamicSource ? (
                  `Refinance to ${targetTerm ? `${targetTerm.durationDays}-day` : 'fixed'}`
                ) : (
                  `Roll over to ${targetTerm ? `${targetTerm.durationDays}-day` : 'fixed'}`
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
