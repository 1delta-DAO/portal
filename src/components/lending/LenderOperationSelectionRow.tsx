// src/components/lending/LenderOperationSelectionRow.tsx
import React, { useState } from "react"
import { lenderDisplayName, type RawCurrency } from "@1delta/lib-utils"
import { useLenderSelection, type LenderOperationSelection, type LenderOperationKind } from "../../contexts/LenderSelectionContext"
import { LendingPoolSelectionModal } from "./LendingPoolSelectionModal"
import { FlattenedPoolWithUserData } from "../../hooks/lending/prepareMixedData"

interface LenderOperationSelectionRowProps {
    selection: LenderOperationSelection
    pools: FlattenedPoolWithUserData[]
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

export const LenderOperationSelectionRow: React.FC<LenderOperationSelectionRowProps> = ({ selection, pools }) => {
    const { setSelectionPool, setSelectionAmount, setSelectionOperation, removeSelection } = useLenderSelection()

    const [modalOpen, setModalOpen] = useState(false)

    const pool = selection.pool
    const asset = pool?.asset as RawCurrency | undefined
    const tvl = pool?.poolData.totalDepositsUSD ?? 0
    const apr = (pool?.poolData.depositRate ?? 0).toFixed(2)

    const handleOperationChange = (op: LenderOperationKind) => {
        setSelectionOperation(selection.id, op)
    }

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
                                        TVL $
                                        {tvl.toLocaleString(undefined, {
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
                <div className="grid gap-2 items-end grid-cols-1 md:grid-cols-[25%_50%_25%]">
                    {/* 25% – Amount */}
                    <div className="form-control min-w-0">
                        <label className="label py-0">
                            <span className="label-text text-xs">Amount</span>
                        </label>
                        <input
                            type="text"
                            className="input input-bordered input-sm w-full"
                            placeholder="0.0"
                            value={selection.amount}
                            onChange={(e) => setSelectionAmount(selection.id, e.target.value)}
                        />
                    </div>

                    {/* 50% – Operation */}
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

                    {/* 25% – Info */}
                    <div className="min-w-0">
                        {pool && (
                            <div className="flex flex-col text-[11px] text-base-content/60">
                                <span className="truncate">
                                    TVL $
                                    {tvl.toLocaleString(undefined, {
                                        maximumFractionDigits: 0,
                                    })}
                                </span>
                                <span className="truncate">APR {apr}%</span>
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
