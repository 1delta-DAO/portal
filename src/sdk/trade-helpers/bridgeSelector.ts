import { fetchBridgeTrade } from "@1delta/trade-sdk"
import { Bridge, getBridges } from "@1delta/bridge-configs"
import type { GenericTrade, RawCurrency } from "@1delta/lib-utils"
import type { BridgeInput, BaseBridgeInput } from "@1delta/trade-sdk/dist/types"
import type { SimpleSquidCall } from "@1delta/trade-sdk"
import type { Address } from "viem"
import { getPricesCallback } from "./prices"
import { getCurrency as getCurrencyRaw } from "./utils"
import { simpleSquidCallsFromMessage } from "./destinationActions"
import type { Hex } from "viem"

function toBridgeInput(bridge: Bridge, input: BaseBridgeInput): BridgeInput {
    if (bridge === Bridge.AXELAR) {
        const explicitAdditional = (input as any)?.additionalCalls as
            | Array<{ callType: 0; target: string; value?: bigint; callData: Hex }>
            | undefined
        const additionalCalls =
            explicitAdditional && explicitAdditional.length > 0
                ? explicitAdditional
                : input.message && typeof input.message === "string"
                ? simpleSquidCallsFromMessage(input.message as Hex)
                : undefined
        return {
            bridge,
            input: {
                ...input,
                additionalCalls,
            } as any,
        } as BridgeInput
    }
    return {
        bridge,
        input,
    } as BridgeInput
}

function getCurrency(chainId: string | undefined, tokenAddress: string | undefined): RawCurrency {
    if (!chainId || !tokenAddress) {
        throw new Error("Invalid currency parameters")
    }
    const currency = getCurrencyRaw(chainId, tokenAddress as Address)
    if (!currency) {
        throw new Error(`Currency not found for ${chainId}:${tokenAddress}`)
    }
    return currency
}

type ExtendedBridgeInput = BaseBridgeInput & { additionalCalls?: SimpleSquidCall[] }

export async function fetchAllBridgeTrades(
    input: ExtendedBridgeInput,
    controller?: AbortController
): Promise<Array<{ bridge: string; trade: GenericTrade }>> {
    let availableBridges = getBridges()
    const hasComposedCalls = Boolean(input.additionalCalls && input.additionalCalls.length > 0)
    const hasComposedMessage = Boolean(input.message && (input.message as string).length > 2)
    if (hasComposedCalls || hasComposedMessage) {
        availableBridges = [Bridge.AXELAR]
    }
    console.debug(
        hasComposedCalls || hasComposedMessage ? "Fetching from bridges (forced Axelar due to composed calls):" : "Fetching from bridges:",
        availableBridges.map((b) => (b.toString ? b.toString() : String(b)))
    )
    if (availableBridges.length === 0) return []

    const results = await Promise.all(
        availableBridges.map(async (bridge: Bridge) => {
            try {
                const trade = await fetchBridgeTrade(
                    toBridgeInput(bridge, input),
                    getPricesCallback,
                    getCurrency,
                    controller || new AbortController()
                )
                if (trade) return { bridge: bridge.toString(), trade }
            } catch (error) {
                console.debug("Error fetching trade from ${bridge}:", {
                    bridge,
                    error,
                    input,
                })
            }
            return undefined
        })
    )

    const trades = (results.filter(Boolean) as Array<{ bridge: string; trade: GenericTrade }>).filter(({ trade }) => {
        const hasAssemble = typeof (trade as any)?.assemble === "function"
        const hasTx = Boolean((trade as any)?.transaction)
        return hasAssemble || hasTx
    })

    return trades.sort((a, b) => b.trade.outputAmountRealized - a.trade.outputAmountRealized)
}

