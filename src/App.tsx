import { ConnectButton } from "@rainbow-me/rainbowkit"
import { useAccount } from "wagmi"
import { useEffect, useState } from "react"
import type { Hex } from "viem"
import { TradeSdkWalletSync } from "./sdk/trade-helpers/walletClient"
import { LenderTab } from "./components/lending/LendingTab"
import { ThemeSwitcher } from "./components/themeSwitcher"
import { WalletConnect } from "./components/connect"
import { fetchLenderMetaFromDirAndInitialize } from "@1delta/margin-fetcher"
import { fetchLenderLabels } from "@1delta/lib-utils"

export default function App() {
    const { address, isConnected } = useAccount()
    const [activeTab, setActiveTab] = useState<"transactions" | "lending">("lending")
    const [transactionHash, setTransactionHash] = useState<Hex | null>(null)

    const handleTransactionExecuted = (hash: Hex) => setTransactionHash(hash)
    const handleReset = () => setTransactionHash(null)

    useEffect(() => {
        fetchLenderLabels()
        fetchLenderMetaFromDirAndInitialize()
    }, [])

    return (
        <div className="min-h-screen bg-base-200 text-base-content">
            <TradeSdkWalletSync />

            <div className="navbar bg-base-100 shadow-lg">
                <div className="flex flex-row p-2 flex-grow">
                    <div className="flex-1">
                        <div className="flex items-center space-x-2">
                            {/* Use theme primary instead of fixed gradient */}
                            <h1 className="text-3xl font-bold text-primary">Allocator</h1>
                        </div>
                    </div>
                    <div className="flex-none flex gap-3 items-center">
                        <div className="flex-none flex gap-3 items-center">
                            <ThemeSwitcher />
                        </div>
                        <div className="flex-none flex gap-3 items-center">
                            <WalletConnect />
                        </div>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                <div className="space-y-4 flex flex-col items-center">
                    <div className="w-full min-w-[300px] flex items-center justify-between">
                        <div className="join">
                            <button
                                className={`btn btn-sm join-item ${activeTab === "lending" ? "btn-primary" : "btn-ghost"}`}
                                onClick={() => setActiveTab("lending")}
                            >
                                Lending
                            </button>
                            <button
                                className={`btn btn-sm join-item ${activeTab === "transactions" ? "btn-primary" : "btn-ghost"}`}
                                onClick={() => setActiveTab("transactions")}
                            >
                                Transactions
                            </button>
                        </div>
                    </div>

                    <div className="w-full min-w-[300px]">
                        {/* use theme base classes instead of fixed hex */}
                        <div className="card bg-base-100 shadow-xl rounded-2xl">
                            <div className="card-body p-4 sm:p-6">
                                {activeTab === "lending" && <LenderTab />}

                                {transactionHash && (
                                    <div>
                                        <div className="flex items-center justify-between mb-6">
                                            <h2 className="card-title text-2xl">Transaction Executed</h2>
                                            <div className="badge badge-success badge-lg">Success</div>
                                        </div>

                                        <div className="space-y-6">
                                            <div className="card bg-base-200 shadow-md">
                                                <div className="card-body">
                                                    <h3 className="card-title text-lg">Transaction Hash</h3>
                                                    <div className="flex flex-row gap-2 items-center pt-2">
                                                        <p className="flex-1 font-mono text-xs w-10/11 bg-base-100 text-base-content border border-base-300 rounded-md p-2">
                                                            {transactionHash}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="card-actions justify-between">
                                                <button onClick={handleReset} className="btn btn-outline btn-secondary">
                                                    Reset
                                                </button>
                                                <button onClick={handleReset} className="btn btn-primary btn-lg">
                                                    Create New Transaction
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
