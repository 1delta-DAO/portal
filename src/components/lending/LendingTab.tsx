// src/components/LenderTab.tsx
import React, { useMemo, useState } from "react"
import { useAccount } from "wagmi"
import { UserLenderPositionsTable } from "./UserTable"
import { LendingPoolsTable } from "./PoolsTable"
import { ChainFilterSelect } from "./ChainFilter"
import { useFlattenedPools } from "../../hooks/lending/usePoolData.js"
import { LenderOperationsBuilder } from "./LenderOperationsBuilder" // adjust path if needed
import { useMarginData } from "../../hooks/lending/useMarginData"

type SubTab = "markets" | "operations"

export function LenderTab() {
    const { address: account } = useAccount()
    const { pools } = useFlattenedPools()

    // shared chain filter state
    const [selectedChain, setSelectedChain] = useState<string>("1")

    // sub-tab state
    const [activeTab, setActiveTab] = useState<SubTab>("markets")

    // derive available chains from pools (unique + sorted)
    const chains = useMemo(() => Array.from(new Set(pools.map((p) => p.chainId))).sort(), [pools])

    const effectiveChainId = selectedChain

    const { userPositions, lenderData, isLoading, error, refetch, prices } = useMarginData(effectiveChainId, account)

    return (
        <div className="space-y-4">
            {/* Top bar: chain selector + sub-tabs */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex justify-start md:justify-start">
                    <div role="tablist" className="tabs tabs-bordered">
                        <button
                            type="button"
                            role="tab"
                            className={`tab tab-sm ${activeTab === "markets" ? "tab-active" : ""}`}
                            onClick={() => setActiveTab("markets")}
                        >
                            Markets
                        </button>
                        <button
                            type="button"
                            role="tab"
                            className={`tab tab-sm ${activeTab === "operations" ? "tab-active" : ""}`}
                            onClick={() => setActiveTab("operations")}
                        >
                            Operations
                        </button>
                    </div>
                </div>

                <div className="flex justify-end">
                    <ChainFilterSelect chains={chains} value={selectedChain} onChange={setSelectedChain} />
                </div>
            </div>

            {/* Tab content */}
            {activeTab === "markets" && (
                <div className="space-y-4">
                    {account && (
                        <UserLenderPositionsTable
                            account={account}
                            chainId={effectiveChainId}
                            userPositions={userPositions}
                            lenderData={lenderData}
                            isLoading={Boolean(isLoading)}
                            error={error}
                            refetch={refetch}
                        />
                    )}
                    <LendingPoolsTable chainId={effectiveChainId} />
                </div>
            )}

            {activeTab === "operations" && (
                <LenderOperationsBuilder
                    prices={prices}
                    chainId={effectiveChainId}
                    userPositions={userPositions}
                    lenderData={lenderData}
                    isLoading={Boolean(isLoading)}
                    error={error}
                    refetch={refetch}
                />
            )}
        </div>
    )
}
