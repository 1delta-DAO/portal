// src/components/lending/LendingPoolSelectionModal.tsx
import React, { useMemo, useState } from "react"
import { lenderDisplayName, type RawCurrency } from "@1delta/lib-utils"
import { FlattenedPoolWithUserData } from "../../hooks/lending/prepareMixedData"

interface LendingPoolSelectionModalProps {
    open: boolean
    onClose: () => void
    pools: FlattenedPoolWithUserData[]
    onSelect: (pool: FlattenedPoolWithUserData) => void
}

const renderAsset = (asset: RawCurrency) => {
    const symbol = asset?.symbol ?? (asset as any)?.ticker ?? ""
    const name = asset?.name ?? (asset as any)?.label ?? symbol
    return (
        <div className="flex items-center gap-2 min-w-0">
            <div className="avatar placeholder">
                <div className="bg-base-300 text-base-content rounded-full w-8 h-8 flex items-center justify-center overflow-hidden">
                    {asset.logoURI && <img src={asset.logoURI} alt={symbol} width={24} height={24} />}
                </div>
            </div>
            <div className="flex flex-col min-w-0">
                <span className="font-medium text-sm truncate">{symbol || name}</span>
                {name && symbol && name !== symbol && <span className="text-[11px] text-base-content/60 truncate">{name}</span>}
            </div>
        </div>
    )
}

export const LendingPoolSelectionModal: React.FC<LendingPoolSelectionModalProps> = ({ open, onClose, pools, onSelect }) => {
    const [search, setSearch] = useState("")

    const filtered = useMemo(() => {
        if (!search.trim()) return pools
        const q = search.toLowerCase()
        return pools.filter((p) => {
            const asset = p.asset as RawCurrency
            const symbol = asset?.symbol ?? (asset as any)?.ticker ?? ""
            const name = asset?.name ?? (asset as any)?.label ?? ""
            return (
                symbol.toLowerCase().includes(q) ||
                name.toLowerCase().includes(q) ||
                p.lender.toLowerCase().includes(q) ||
                p.poolId.toLowerCase().includes(q)
            )
        })
    }, [pools, search])

    if (!open) return null

    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
            {/* backdrop */}
            <div className="absolute inset-0 bg-base-300/40 backdrop-blur-sm" onClick={onClose} />

            {/* modal */}
            <div className="relative z-50 bg-base-100 rounded-box shadow-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-base-300">
                    <h3 className="font-semibold text-sm">Select Lending Market</h3>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>
                        ✕
                    </button>
                </div>

                <div className="px-4 py-2 border-b border-base-300">
                    <input
                        type="text"
                        className="input input-bordered input-sm w-full"
                        placeholder="Search by asset, lender or pool id"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div className="overflow-y-auto py-2">
                    {filtered.length === 0 && <div className="px-4 py-6 text-sm text-base-content/70">No pools match your search.</div>}

                    {/* Use a simple container instead of `menu` to avoid width constraints */}
                    <div className="w-full">
                        {filtered.map((p) => {
                            const asset = p.asset as RawCurrency
                            const tvl = p.poolData.totalDepositsUSD
                            const apr = p.poolData.depositRate ?? 0

                            return (
                                <button
                                    key={`${p.chainId}-${p.lender}-${p.poolId}`}
                                    type="button"
                                    className="w-full px-4 py-3 hover:bg-base-200 hover:cursor-pointer text-left border-b border-base-200 last:border-b-0"
                                    onClick={() => {
                                        onSelect(p)
                                        onClose()
                                    }}
                                >
                                    {/* Full-width row with 25% / 50% / 25% on md+ */}
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 w-full">
                                        {/* 25% – Asset */}
                                        <div className="min-w-0 md:basis-1/4 md:max-w-[25%]">{renderAsset(asset)}</div>

                                        {/* 50% – Lender + Pool */}
                                        <div className="flex flex-col min-w-0 md:basis-1/2 md:max-w-[50%]">
                                            <span className="text-xs text-base-content/70 truncate">{lenderDisplayName(p.lender)}</span>
                                            <span className="text-[11px] text-base-content/50 truncate">Pool: {p.poolId}</span>
                                        </div>

                                        {/* 25% – TVL + APR */}
                                        <div className="flex flex-col text-xs min-w-0 md:basis-1/4 md:max-w-[25%] md:items-end">
                                            <span className="font-semibold truncate">
                                                TVL $
                                                {tvl.toLocaleString(undefined, {
                                                    maximumFractionDigits: 0,
                                                })}
                                            </span>
                                            <span className="text-base-content/70 truncate">APR {apr.toFixed(2)}%</span>
                                        </div>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}
