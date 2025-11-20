// src/components/lending/LenderOperationSelectionRow.tsx
import React, { useState } from "react"
import { lenderDisplayName, type RawCurrency } from "@1delta/lib-utils"
import { useLenderSelection, type LenderOperationSelection, type LenderOperationKind } from "../../contexts/LenderSelectionContext"
import { LendingPoolSelectionModal } from "./LendingPoolSelectionModal"
import { FlattenedPoolWithUserData } from "../../hooks/lending/prepareMixedData"
import { ValuePill } from "./Pill"
import type { SimulatedActionState } from "../../contexts/Simulation/simulateLenderSelections"
import { DepositAmountInput } from "./Actions/Deposit"
import { WithdrawAmountInput } from "./Actions/Withdraw"
import { RepayAmountInput } from "./Actions/Repay"
import { BorrowAmountInput } from "./Actions/Borrow"

interface LenderOperationSelectionRowProps {
    selection: LenderOperationSelection
    pools: FlattenedPoolWithUserData[]
    simulated?: SimulatedActionState
    /** spot price of the asset in USD, used by action inputs */
    price?: number
}

const renderAssetCompact = (asset: RawCurrency) => {
    const symbol = asset?.symbol ?? (asset as any)?.ticker ?? ""
    const name = asset?.name ?? (asset as any)?.label ?? symbol
    return (
        <div className="flex items-center gap-2 min-w-0">
            <div className="avatar placeholder">
                <div className="bg-base-300 text-base-content rounded-full w-7 h-7 flex items-center justify-center overflow-hidden">
                    {asset.logoURI && <img src={asset.logoURI} alt={symbol} width={20} height={20} />}
                </div>
            </div>
            <div className="flex flex-col min-w-0">
                <span className="font-medium text-sm truncate">{symbol || name}</span>
                {name && symbol && name !== symbol && <span className="text-[11px] text-base-content/60 truncate">{name}</span>}
            </div>
        </div>
    )
}

/** Even more compact: icon + symbol only, for inline balance display */
const renderAssetMini = (asset: RawCurrency) => {
    const symbol = asset?.symbol ?? (asset as any)?.ticker ?? ""
    return (
        <div className="flex items-center gap-1 min-w-0">
            <div className="avatar placeholder">
                <div className="bg-base-300 text-base-content rounded-full w-5 h-5 flex items-center justify-center overflow-hidden">
                    {asset.logoURI && <img src={asset.logoURI} alt={symbol} width={16} height={16} />}
                </div>
            </div>
            {symbol && <span className="text-[11px] font-medium truncate">{symbol}</span>}
        </div>
    )
}

export const LenderOperationSelectionRow: React.FC<LenderOperationSelectionRowProps> = ({ selection, pools, simulated, price = 0 }) => {
    const { setSelectionPool, setSelectionAmount, setSelectionOperation, removeSelection } = useLenderSelection()

    const [modalOpen, setModalOpen] = useState(false)

    const pool = selection.pool
    const asset = pool?.asset as RawCurrency | undefined
    const tvl = pool?.poolData.totalDepositsUSD ?? 0
    const apr = (pool?.poolData.depositRate ?? 0).toFixed(2)

    const handleOperationChange = (op: LenderOperationKind) => {
        setSelectionOperation(selection.id, op)
    }

    // --- user data projection ---
    const userPositionsMap = (pool?.userPosition as Record<string, any> | undefined) ?? undefined

    const userEntries =
        userPositionsMap != null
            ? Object.entries(userPositionsMap).filter(([, pos]) => {
                  const dep = pos?.depositsUSD ?? 0
                  const debt = pos?.debtUSD ?? 0
                  const debtStable = pos?.debtStableUSD ?? 0
                  return dep > 0 || debt > 0 || debtStable > 0
              })
            : []

    const singleZeroOnly = userEntries.length === 1 && userEntries[0]?.[0] === "0"

    // --- simulated totals for this row ---
    const borrowCapacityBefore =
        simulated != null ? simulated.balanceBefore.borrowDiscountedCollateral - simulated.balanceBefore.adjustedDebt : undefined

    const borrowCapacityAfter =
        simulated != null ? simulated.balanceAfter.borrowDiscountedCollateral - simulated.balanceAfter.adjustedDebt : undefined

    const depositsAfter = simulated != null ? simulated.balanceAfter.deposits : undefined

    // per-step asset balance (if the simulation tracked it)
    const assetBalanceAfter = simulated?.assetBalanceAfter

    return (
        <>
            {/* Row container */}
            <div className="flex flex-col gap-2 rounded-box border border-base-300 p-3 bg-base-100">
                <div className="flex items-center gap-2">
                    {/* Pool selection trigger */}
                    <button
                        type="button"
                        className="flex-1 flex items-center gap-3 px-2 py-1 rounded-btn border border-base-300 hover:border-primary/70 hover:bg-base-200/60 text-left"
                        onClick={() => setModalOpen(true)}
                    >
                        {pool && asset ? (
                            <>
                                {renderAssetCompact(asset)}
                                <div className="flex flex-col text-[11px] text-base-content/60 truncate">
                                    <span className="truncate">{lenderDisplayName(pool.lender)}</span>
                                    <span className="truncate">
                                        TVL{" "}
                                        {tvl.toLocaleString(undefined, {
                                            style: "currency",
                                            currency: "USD",
                                            maximumFractionDigits: 0,
                                        })}{" "}
                                        · APR {apr}%
                                    </span>
                                </div>
                            </>
                        ) : (
                            <span className="text-xs text-base-content/60">Select lending market…</span>
                        )}
                    </button>

                    {/* Remove button: minus symbol */}
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => removeSelection(selection.id)} title="Remove operation">
                        −
                    </button>
                </div>

                {/* Amount + operation + info */}
                <div className="grid gap-2 items-start grid-cols-1 md:grid-cols-[25%_10%_65%]">
                    {/* 25% – Amount (action-specific) */}
                    <div className="min-w-0">
                        {selection.operation === "deposit" && (
                            <DepositAmountInput
                                selection={selection}
                                pool={pool}
                                price={price}
                                simulated={simulated}
                                onChangeAmount={(val) => setSelectionAmount(selection.id, val)}
                            />
                        )}
                        {selection.operation === "withdraw" && (
                            <WithdrawAmountInput
                                selection={selection}
                                pool={pool}
                                price={price}
                                simulated={simulated}
                                onChangeAmount={(val) => setSelectionAmount(selection.id, val)}
                            />
                        )}
                        {selection.operation === "repay" && (
                            <RepayAmountInput
                                selection={selection}
                                pool={pool}
                                price={price}
                                simulated={simulated}
                                onChangeAmount={(val) => setSelectionAmount(selection.id, val)}
                            />
                        )}
                        {selection.operation === "borrow" && (
                            <BorrowAmountInput
                                selection={selection}
                                pool={pool}
                                price={price}
                                simulated={simulated}
                                onChangeAmount={(val) => setSelectionAmount(selection.id, val)}
                            />
                        )}
                    </div>

                    {/* 10% – Operation */}
                    <div className="form-control min-w-0">
                        <label className="label py-0">
                            <span className="label-text text-xs">Operation</span>
                        </label>
                        <select
                            className="select select-bordered select-sm w-full"
                            value={selection.operation}
                            onChange={(e) => handleOperationChange(e.target.value as any)}
                        >
                            <option value="deposit">Deposit</option>
                            <option value="withdraw">Withdraw</option>
                            <option value="borrow">Borrow</option>
                            <option value="repay">Repay</option>
                        </select>
                    </div>

                    {/* 65% – Info + user position + simulated totals + per-asset balance */}
                    <div className="min-w-0">
                        {pool && (
                            <div className="flex flex-col text-[11px] text-base-content/60 gap-1">
                                {/* user position blocks */}
                                {userEntries.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {userEntries.map(([subId, pos]) => {
                                            const dep = pos.depositsUSD ?? 0
                                            const debtTotal = (pos.debtUSD ?? 0) + (pos.debtStableUSD ?? 0)

                                            const label = singleZeroOnly && subId === "0" ? undefined : `Sub ${subId}`

                                            return (
                                                <div
                                                    key={subId}
                                                    title={`Deposits: $${dep.toLocaleString()} | Debt: $${debtTotal.toLocaleString()}`}
                                                    className="flex flex-col gap-0.5 max-w-36"
                                                >
                                                    {label && <span className="font-semibold uppercase truncate w-full">{label}</span>}
                                                    {(dep > 0 || debtTotal > 0) && (
                                                        <span className="font-semibold uppercase truncate w-full">Position</span>
                                                    )}
                                                    {dep > 0 && (
                                                        <ValuePill label="Deposits" value={dep} prefix="$" tone="success" maximumFractionDigits={0} />
                                                    )}
                                                    {debtTotal > 0 && (
                                                        <ValuePill label="Debt" value={debtTotal} prefix="$" tone="error" maximumFractionDigits={0} />
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}

                                {/* simulated balances summary */}
                                {simulated && (
                                    <div className="mt-1 flex flex-col gap-0.5">
                                        <span className="font-semibold uppercase truncate w-full">Simulated totals</span>
                                        <div className="flex flex-wrap gap-1">
                                            <ValuePill
                                                label="NAV"
                                                value={simulated.balanceAfter.nav}
                                                prefix="$"
                                                tone="primary"
                                                maximumFractionDigits={1}
                                            />
                                            {depositsAfter !== undefined && (
                                                <ValuePill
                                                    label="Deposits"
                                                    value={depositsAfter}
                                                    prefix="$"
                                                    tone="success"
                                                    maximumFractionDigits={1}
                                                />
                                            )}
                                            <ValuePill
                                                label="Debt"
                                                value={simulated.balanceAfter.debt}
                                                prefix="$"
                                                tone="error"
                                                maximumFractionDigits={1}
                                            />
                                            {borrowCapacityAfter !== undefined && (
                                                <ValuePill
                                                    label="Borrow capacity"
                                                    value={borrowCapacityAfter}
                                                    prefix="$"
                                                    tone="warning"
                                                    maximumFractionDigits={1}
                                                />
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* per-step asset running balance (token + USD) */}
                                {asset && assetBalanceAfter && (
                                    <div className="mt-2 flex items-center gap-2 p-1 rounded-md bg-base-200/60">
                                        {renderAssetMini(asset)}
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[11px] font-semibold truncate">
                                                {assetBalanceAfter.amount.toLocaleString(undefined, {
                                                    maximumFractionDigits: 6,
                                                })}{" "}
                                                {(asset.symbol ?? (asset as any)?.ticker ?? "") as string}
                                            </span>
                                            <span className="text-[10px] text-base-content/70 truncate">
                                                ≈{" "}
                                                {assetBalanceAfter.amountUsd.toLocaleString(undefined, {
                                                    style: "currency",
                                                    currency: "USD",
                                                    maximumFractionDigits: 2,
                                                })}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Selection modal */}
            <LendingPoolSelectionModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                pools={pools}
                onSelect={(p) => setSelectionPool(selection.id, p)}
            />
        </>
    )
}
