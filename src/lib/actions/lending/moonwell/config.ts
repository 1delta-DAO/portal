import { type Hex } from "viem"
import type { DestinationActionConfig } from "../../../types/destinationAction"
import { MTOKEN_ABI } from "./mTokenAbi"
import type { MoonwellMarket } from "../../../../hooks/useMoonwellMarkets"
import { getCachedMarkets, isMarketsReady } from "../../../moonwell/marketCache"
import { SupportedChainId } from "@1delta/lib-utils"

const base: Omit<DestinationActionConfig, "functionSelectors" | "name" | "description" | "defaultFunctionSelector" | "address"> = {
    abi: MTOKEN_ABI,
    actionType: "lending",
    group: "lending",
}

const actionTemplates: Omit<DestinationActionConfig, "address">[] = [
    {
        ...base,
        name: "Mint",
        description: "Deposit asset to Moonwell",
        functionSelectors: ["0xa0712d68" as Hex],
        defaultFunctionSelector: "0xa0712d68" as Hex,
        meta: { usePermitPrecompile: true, preApproveFromUnderlying: true, preApproveAmountArgIndex: 0, enterMarketBefore: true },
    },
    {
        ...base,
        name: "Borrow",
        description: "Borrow asset from Moonwell",
        functionSelectors: ["0xc5ebeaec" as Hex],
        defaultFunctionSelector: "0xc5ebeaec" as Hex,
        meta: { usePermitPrecompile: true, enterMarketBefore: true },
    },
    {
        ...base,
        name: "Withdraw",
        description: "Withdraw asset from Moonwell",
        functionSelectors: ["0xdb006a75" as Hex],
        defaultFunctionSelector: "0xdb006a75" as Hex,
        meta: { usePermitPrecompile: true },
    },
    {
        ...base,
        name: "Repay",
        description: "Repay borrowed asset on Moonwell",
        functionSelectors: ["0x0e752702" as Hex],
        defaultFunctionSelector: "0x0e752702" as Hex,
        meta: { usePermitPrecompile: true, preApproveFromUnderlying: true, preApproveAmountArgIndex: 0 },
    },
]

/**
 * Generates destination actions for a Moonwell market
 * @param market The Moonwell market data
 * @param dstToken Optional destination token address to filter actions (e.g., Mint only when dstToken matches underlying)
 * @returns Array of destination action configs for the market
 */
export function getActionsForMarket(market: MoonwellMarket, dstToken?: string): DestinationActionConfig[] {
    const symbol = market.symbol || ""
    const underlyingLower = (market.underlying || "").toLowerCase()
    const dstLower = (dstToken || "").toLowerCase()

    const items: DestinationActionConfig[] = []

    for (const template of actionTemplates) {
        if (template.name === "Mint" && dstToken && dstLower && underlyingLower && dstLower !== underlyingLower) {
            continue
        }

        if (template.name === "Borrow" && market.borrowPaused) {
            continue
        }

        const actionName = template.name === "Mint" ? `Deposit ${symbol}`.trim() : `${template.name} ${symbol}`.trim()

        const actionDescription =
            template.name === "Mint"
                ? `Deposit ${symbol} to Moonwell`
                : template.name === "Borrow"
                ? `Borrow ${symbol} from Moonwell`
                : template.name === "Withdraw"
                ? `Withdraw ${symbol} from Moonwell`
                : `Repay borrowed ${symbol} on Moonwell`

        items.push({
            ...template,
            address: market.mToken,
            name: actionName,
            description: actionDescription,
            meta: {
                ...template.meta,
                underlying: market.underlying,
                symbol: market.symbol,
                decimals: market.decimals,
            },
        } as DestinationActionConfig)
    }

    // sort: Deposit, Borrow, Withdraw, Repay
    const priority = (n: string) =>
        n.startsWith("Deposit") ? 0 : n.startsWith("Borrow") ? 1 : n.startsWith("Withdraw") ? 2 : n.startsWith("Repay") ? 3 : 9
    return items.sort((a, b) => priority(a.name) - priority(b.name) || a.name.localeCompare(b.name))
}

export function getActions(opts?: { dstToken?: string; dstChainId?: string }): DestinationActionConfig[] {
    // Only return actions for Moonbeam (chainId 1284)
    if (opts?.dstChainId && opts.dstChainId !== SupportedChainId.MOONBEAM) {
        return []
    }

    // Check if markets are ready
    if (!isMarketsReady()) {
        return []
    }

    const markets = getCachedMarkets()
    if (!markets || markets.length === 0) {
        return []
    }

    const items: DestinationActionConfig[] = []
    for (const market of markets) {
        const actions = getActionsForMarket(market, opts?.dstToken)
        items.push(...actions)
    }

    return items
}
