import React, { useMemo, useState } from 'react'
import { parseUnits } from 'viem'
import { AmountInput } from '../../common/AmountInput'
import { TermsSummary } from '../terms'
import { useTermsAcknowledgement, TermsDisclosure } from '../terms/TermsDisclosure'
import type { BandSetterState } from '../terms/BandSetterRow'
import { isFullSheet } from '../terms/types'
import type { AnyTermSheet } from '../terms/types'
import type { ExposureEntry } from '../../../sdk/lending-helper/termSheets'
import { fetchDepositAndBorrow } from '../../../sdk/lending-helper/fetchCombinedAction'
import { useSendLendingTransaction } from '../../../hooks/useSendLendingTransaction'
import type { PoolDataItem } from '../../../sdk/lending-helper/marketTypes'

/**
 * Embedded deposit-and-borrow: opening a position from the Borrow panel when
 * the standalone borrow structurally cannot (TermMax needs a GT, LlamaLend
 * needs `create_loan` with collateral + bands — both 400 without a position).
 *
 * Same pattern as {@link LiquityOpenPanel}, generalized: two amounts, one
 * `/v1/actions/lending/deposit-and-borrow` build, permissions then
 * transactions in order. The open parameter a lender needs at open time lives
 * in the TERM SHEET, not here — `bandEdit` renders LlamaLend's band count and
 * renders nothing everywhere else — so this panel stays lender-agnostic.
 *
 * The collateral comes from the sheet's `acceptedCollateral`: these are
 * isolated pair markets, so there is usually exactly one entry; a selector
 * appears only when the sheet lists several. Callers should fall back to the
 * explanatory notice when the sheet resolves no collateral at all — building
 * a request we know is incomplete is worse than pointing at the Optimizer.
 */

/** Collateral candidates the sheet can actually address a market for. */
export const openPanelCollaterals = (sheet: AnyTermSheet | undefined): ExposureEntry[] =>
  (isFullSheet(sheet) ? (sheet.borrow?.acceptedCollateral?.items ?? []) : []).filter(
    (i): i is ExposureEntry => !!i?.asset?.address
  )

export const DepositBorrowOpenPanel: React.FC<{
  pool: PoolDataItem
  termSheet: AnyTermSheet | undefined
  account?: string
  chainId: string
  onOpened?: () => void
}> = ({ pool, termSheet, account, chainId, onOpened }) => {
  const [collAmount, setCollAmount] = useState('')
  const [borrowAmount, setBorrowAmount] = useState('')
  const [bandState, setBandState] = useState<BandSetterState | undefined>(undefined)
  const [collIdx, setCollIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  const { send } = useSendLendingTransaction({ chainId, account })
  const ack = useTermsAcknowledgement(termSheet, 'borrow')

  const collaterals = useMemo(() => openPanelCollaterals(termSheet), [termSheet])
  const collateral = collaterals[Math.min(collIdx, collaterals.length - 1)]

  const [lender] = pool.marketUid.split(':')
  const collateralMarketUid =
    collateral?.marketUid ??
    (collateral ? `${lender}:${chainId}:${collateral.asset.address.toLowerCase()}` : undefined)

  const debtDecimals = pool.asset?.decimals ?? 18
  const collDecimals = collateral?.asset?.decimals ?? 18

  // A market whose open parameter is the band count refuses an invalid one at
  // the protocol, so refuse it at the button. `bandState` only ever exists
  // when the sheet rendered the band row (LlamaLend).
  const bandsInvalid = bandState != null && !bandState.valid

  const collNum = Number(collAmount || '0')
  const borrowNum = Number(borrowAmount || '0')
  const canSubmit =
    !!account &&
    !!collateralMarketUid &&
    collNum > 0 &&
    borrowNum > 0 &&
    !bandsInvalid &&
    ack.cleared &&
    !busy

  const submit = async () => {
    if (!account || !collateralMarketUid) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetchDepositAndBorrow({
        collateralMarketUid,
        debtMarketUid: pool.marketUid,
        operator: account,
        collateralAmount: parseUnits(collAmount || '0', collDecimals).toString(),
        borrowAmount: parseUnits(borrowAmount || '0', debtDecimals).toString(),
        bands: bandState?.valid ? bandState.bands : undefined,
      })
      if (!res.success || !res.data) {
        setError(res.error ?? 'Could not build the transaction')
        return
      }
      // Approvals first, in order, then the open itself — same shape and
      // ordering the generic lending actions and the Liquity open use.
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
        You have no position in this market yet. Opening one deposits collateral and borrows in a
        single transaction.
      </div>

      {collaterals.length > 1 && (
        <div className="space-y-1.5">
          <span className="text-xs text-base-content/60 px-1">Collateral</span>
          <div className="flex flex-wrap gap-1.5">
            {collaterals.map((c, i) => {
              const active = i === collIdx
              return (
                <button
                  key={c.asset.address}
                  type="button"
                  onClick={() => setCollIdx(i)}
                  className={`px-2.5 py-1 rounded-lg border text-xs transition-colors cursor-pointer ${
                    active
                      ? 'border-primary bg-primary/10 ring-1 ring-primary'
                      : 'border-base-300 bg-base-200/50 hover:bg-base-200'
                  }`}
                >
                  {c.asset.symbol ?? c.asset.address.slice(0, 6)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <AmountInput
        label={`Collateral${collateral?.asset?.symbol ? ` (${collateral.asset.symbol})` : ''}`}
        value={collAmount}
        onChange={setCollAmount}
        // No wallet-balance plumbing here (parity with the Liquity open) —
        // presets stay disabled rather than guessing a max.
        maxAmount="0"
        decimals={collDecimals}
      />

      <AmountInput
        label={`Borrow${pool.asset?.symbol ? ` (${pool.asset.symbol})` : ''}`}
        value={borrowAmount}
        onChange={setBorrowAmount}
        // No borrow ceiling is knowable before the collateral is chosen.
        maxAmount="0"
        decimals={debtDecimals}
      />

      {/* Open-time parameters live in the term sheet: the band count (LlamaLend)
          renders here as an editable term and nowhere else. */}
      <TermsSummary
        sheet={termSheet}
        side="borrow"
        defaultOpen
        bandEdit={{ value: bandState?.bands, onChange: setBandState, mode: 'edit' }}
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
          {busy ? 'Opening…' : 'Deposit & borrow'}
        </button>
      )}

      {bandsInvalid ? (
        <div className="rounded-lg border border-error/30 bg-error/10 px-2 py-1.5 text-[11px] text-error">
          Set a band count within the allowed range before opening.
        </div>
      ) : null}

      {error ? <div className="text-error text-xs wrap-break-word">{error}</div> : null}
      {txHash ? <div className="text-success text-xs">Position opened.</div> : null}
    </div>
  )
}
