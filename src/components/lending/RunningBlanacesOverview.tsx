// src/components/lending/RunningBalancesOverview.tsx
import React from "react"
import type { RawCurrency } from "@1delta/lib-utils"

export interface RunningBalanceItem {
    asset: RawCurrency
    amount: number // + = user receives, - = user pays
    amountUsd: number // signed as well
}

interface RunningBalancesOverviewProps {
    items: RunningBalanceItem[]
    className?: string
    title?: string
}

const renderAssetMini = (asset: RawCurrency) => {
    const symbol = asset?.symbol ?? (asset as any)?.ticker ?? ""
    const name = asset?.name ?? (asset as any)?.label ?? symbol

    return (
        <div className="flex items-center gap-2 min-w-0 w-30">
            <div className="avatar placeholder">
                <div className="bg-base-300 text-base-content rounded-full w-6 h-6 flex items-center justify-center overflow-hidden">
                    {asset.logoURI && <img src={asset.logoURI} alt={symbol} width={20} height={20} />}
                </div>
            </div>
            <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-medium truncate">{symbol || name}</span>
                {name && symbol && name !== symbol && <span className="text-[10px] text-base-content/60 truncate">{name}</span>}
            </div>
        </div>
    )
}

export const RunningBalancesOverview: React.FC<RunningBalancesOverviewProps> = ({ items, className = "", title = "Running Balances" }) => {
    if (!items || items.length === 0) return null

    return (
        <div className={`mt-3 rounded-box border border-base-300 p-3 bg-base-100 ${className}`}>
            <div className="flex items-center justify-between mb-2">
                <span className="font-semibold uppercase text-[11px]">{title}</span>
                {/* Legend */}
                {/* <div className="flex items-center gap-2 text-[10px] text-base-content/70">
                    <span className="inline-flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-success" />
                        <span>you receive</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-error" />
                        <span>you pay</span>
                    </span>
                </div> */}
            </div>

            <div className="flex flex-col gap-1.5">
                {items.map(({ asset, amount, amountUsd }) => {
                    if (amount === 0) return null
                    const symbol = (asset.symbol ?? (asset as any)?.ticker ?? "") as string
                    const isPositive = amount > 0
                    const absAmount = Math.abs(amount)
                    const absAmountUsd = Math.abs(amountUsd)

                    const badgeClass = isPositive ? "bg-success/10 text-success border-success/40" : "bg-error/10 text-error border-error/40"
                    const badgeLabel = isPositive ? "Receive" : "Pay"

                    return (
                        <div
                            key={`${(asset as any)?.chainId ?? ""}-${(asset as any)?.address ?? asset.symbol ?? ""}`}
                            className="flex items-center gap-2 p-1 rounded-md hover:bg-base-200/60 transition-colors"
                        >
                            {renderAssetMini(asset)}

                            <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-[11px] font-semibold truncate">
                                    {absAmount.toLocaleString(undefined, {
                                        maximumFractionDigits: 6,
                                    })}{" "}
                                    {symbol}
                                </span>
                                <span className="text-[10px] text-base-content/70 truncate">
                                    ≈{" "}
                                    {absAmountUsd.toLocaleString(undefined, {
                                        style: "currency",
                                        currency: "USD",
                                        maximumFractionDigits: 2,
                                    })}
                                </span>
                            </div>

                            {/* Direction badge */}
                            <span
                                className={`
                  ml-2 px-2 py-0.5 rounded-full border text-[10px]
                  whitespace-nowrap ${badgeClass}
                `}
                            >
                                {badgeLabel}
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
