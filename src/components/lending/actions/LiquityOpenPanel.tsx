import React, { useMemo, useState } from 'react'
import { parseUnits } from 'viem'
import { AmountInput } from '../../common/AmountInput'
import { TermsSummary } from '../terms'
import { useTermsAcknowledgement, TermsDisclosure } from '../terms/TermsDisclosure'
import type { RateSetterState } from '../terms/RateSetterRow'
import { isFullSheet } from '../terms/types'
import type { AnyTermSheet } from '../terms/types'
import { fetchLiquityOpen } from '../../../sdk/lending-helper/fetchLiquityRate'
import { useSendLendingTransaction } from '../../../hooks/useSendLendingTransaction'
import { formatTokenAmount } from './format'
import type { PoolDataItem } from '../../../sdk/lending-helper/marketTypes'

/**
 * Opening a Liquity-family position.
 *
 * The ordinary borrow form cannot do this: `/v1/actions/lending/borrow` only
 * INCREASES debt on a trove that already exists, while opening one is a single
 * call that needs collateral, debt AND an interest rate together. So a market
 * with no trove yet gets this panel instead — the borrow path is left
 * completely untouched.
 *
 * The rate is edited inside the term sheet rather than here, because it is a
 * term of the loan, not a field of the form.
 */
export const LiquityOpenPanel: React.FC<{
  pool: PoolDataItem
  /**
   * The collateral to deposit. Taken from the term sheet's
   * `acceptedCollateral` rather than passed in: a Liquity branch has exactly
   * ONE collateral by construction, so the sheet already knows it and there is
   * nothing to plumb.
   */
  collateralAsset?: { symbol?: string; decimals?: number }
  /** Wallet balance of that collateral, decimal string. Omit to disable presets. */
  collateralBalance?: string
  termSheet: AnyTermSheet | undefined
  account?: string
  chainId: string
  onOpened?: () => void
}> = ({ pool, collateralAsset, collateralBalance, termSheet, account, chainId, onOpened }) => {
  const [collAmount, setCollAmount] = useState('')
  const [debtAmount, setDebtAmount] = useState('')
  const [rateState, setRateState] = useState<RateSetterState | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  const { send } = useSendLendingTransaction({ chainId, account })
  const ack = useTermsAcknowledgement(termSheet, 'borrow')

  const borrow = isFullSheet(termSheet) ? termSheet.borrow : undefined
  const userSet = borrow?.rate.userSet
  const ratePct = rateState?.aprPercent ?? userSet?.default

  const collateralBalanceStr = collateralBalance ?? '0'
  const debtDecimals = pool.asset?.decimals ?? 18
  const collDecimals = collateralAsset?.decimals ?? 18

  // The protocol floor — a smaller debt reverts, so block before building.
  const minDebtRaw = borrow?.exit.minDebt ?? borrow?.availability.minSize
  const minDebtHuman = useMemo(() => {
    if (!minDebtRaw) return undefined
    const n = Number(minDebtRaw) / 10 ** debtDecimals
    return Number.isFinite(n) ? n : undefined
  }, [minDebtRaw, debtDecimals])

  const debtNum = Number(debtAmount || '0')
  const collNum = Number(collAmount || '0')
  const belowMin = minDebtHuman != null && debtNum > 0 && debtNum < minDebtHuman
  const rateInvalid = userSet?.required === true && rateState?.valid === false

  const canSubmit =
    !!account && collNum > 0 && debtNum > 0 && !belowMin && !rateInvalid && ack.cleared && !busy

  const submit = async () => {
    if (!account) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetchLiquityOpen({
        chainId,
        lender: pool.marketUid.split(':')[0],
        account,
        collAmount: parseUnits(collAmount || '0', collDecimals).toString(),
        amount: parseUnits(debtAmount || '0', debtDecimals).toString(),
        // Omitted ⇒ the branch average, which is also what we pre-filled.
        aprPercent: ratePct,
      })
      if (!res.success || !res.data) {
        setError(res.error ?? 'Could not build the transaction')
        return
      }
      // Approvals first, in order, then the open itself — same shape and
      // ordering the generic lending actions use.
      for (const p of res.data.permissions ?? []) {
        const r = await send(p)
        if (!r.ok) {
          setError(r.error ?? 'Approval failed')
          return
        }
      }
      for (const tx of res.data.transactions ?? []) {
        const r = await send(tx)
        if (!r.ok) {
          setError(r.error ?? 'Transaction failed')
          return
        }
        setTxHash(r.hash ?? null)
      }
      onOpened?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-base-300 px-2 py-1.5 text-[11px] text-base-content/60">
        You have no position in this market yet. Opening one deposits collateral and mints debt in a
        single transaction, at a rate you choose.
      </div>

      <AmountInput
        label={`Collateral${collateralAsset?.symbol ? ` (${collateralAsset.symbol})` : ''}`}
        value={collAmount}
        onChange={setCollAmount}
        maxAmount={collateralBalanceStr}
        decimals={collDecimals}
      />

      <AmountInput
        label={`Borrow${pool.asset?.symbol ? ` (${pool.asset.symbol})` : ''}`}
        value={debtAmount}
        onChange={setDebtAmount}
        // No borrow ceiling is knowable before the collateral is chosen, so
        // the presets are disabled rather than guessing one.
        maxAmount="0"
        decimals={debtDecimals}
        error={
          belowMin && minDebtHuman != null
            ? `Minimum ${formatTokenAmount(minDebtHuman)} ${pool.asset?.symbol ?? ''} — a smaller borrow reverts.`
            : undefined
        }
      />

      {/* The rate lives in the term sheet: it is a term, not a form field. */}
      <TermsSummary
        sheet={termSheet}
        side="borrow"
        defaultOpen
        rateEdit={userSet?.required ? { value: ratePct, onChange: setRateState } : undefined}
      />

      {!ack.cleared ? (
        <TermsDisclosure ack={ack} side="borrow" actionLabel="open this position" />
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-sm w-full"
          disabled={!canSubmit}
          onClick={submit}
        >
          {busy ? 'Opening…' : 'Open position'}
        </button>
      )}

      {error ? <div className="text-error text-xs wrap-break-word">{error}</div> : null}
      {txHash ? <div className="text-success text-xs">Position opened.</div> : null}
    </div>
  )
}
