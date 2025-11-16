import { type Address, zeroAddress } from "viem"
import { VenusLensAbi } from "../abi/compV2"
import { erc20Abi } from "viem"
import { getRpcSelectorEvmClient, SupportedChainId } from "@1delta/lib-utils"

export type MoonwellMarket = {
    mToken: Address
    underlying: Address
    symbol?: string
    decimals?: number
    isListed: boolean
    mintPaused: boolean
    borrowPaused: boolean
}

export const MOONWELL_LENS = "0xe76C8B8706faC85a8Fbdcac3C42e3E7823c73994" as Address
export const MOONWELL_COMPTROLLER = "0x8e00d5e02e65a19337cdba98bba9f84d4186a180" as Address

// underlying -> Moonwell mToken (Moonbeam)
export const MOONWELL_UNDERLYING_TO_MTOKEN: Record<string, Address> = {
    "0x0000000000000000000000000000000000000000": "0x091608f4e4a15335145be0a279483c0f8e4c7955", // GLMR
    "0xffffffff1fcacbd218edc0eba20fc2308c778080": "0xd22da948c0ab3a27f5570b604f3adef5f68211c3",
    "0x30d2a9f5fdf90ace8c17952cbb4ee48a55d916a7": "0xc3090f41eb54a7f18587fd6651d4d3ab477b07a4",
    "0x1dc78acda13a8bc4408b207c9e48cdbc096d95e0": "0x24a9d8f1f350d59cb0368d3d52a77db29c833d1d",
    "0x8f552a71efe5eefc207bf75485b356a0b3f01ec9": "0x02e9081dfadd37a852f9a73c4d7d69e615e61334",
    "0x322e86852e492a7ee17f28a78c663da38fb33bfb": "0x1c55649f73cda2f72cef3dd6c5ca3d49efcf484c",
    "0xab3f0245b83feb11d15aaffefd7ad465a59817ed": "0xb6c94b3a378537300387b57ab1cc0d2083f9aeac",
    "0xe57ebd2d67b462e9926e04a8e33f01cd0d64346d": "0xaaa20c5a584a9fecdfedd71e46da7858b774a9ce",
    "0x931715fee2d06333043d11f658c8ce934ac61d0c": "0x744b1756e7651c6d57f5311767eafe5e931d615b",
    "0x692c57641fc054c2ad6551ccc6566eba599de1ba": "0x298f2e346b82d69a473bf25f329bdf869e17dec8",
    "0xffffffffea09fb06d082fd1275cd48b191cbcd1d": "0x42a96c0681b74838ec525adbd13c37f66388f289",
    "0xffffffff7d2b0b761af01ca8e25242976ac0ad7d": "0x22b1a40e3178fe7c7109efcc247c5bb2b34abe32",
}

let cachedMarkets: MoonwellMarket[] | undefined = undefined
let isLoading = false
let error: string | undefined = undefined
let isInitialized = false

type StateChangeListener = () => void
const listeners = new Set<StateChangeListener>()

function notifyListeners() {
    listeners.forEach((listener) => listener())
}

export function subscribeToCacheChanges(listener: StateChangeListener) {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

export function getCachedMarkets(): MoonwellMarket[] | undefined {
    return cachedMarkets
}

export function isMarketsLoading(): boolean {
    return isLoading
}

export function isMarketsReady(): boolean {
    return !isLoading && cachedMarkets !== undefined && error === undefined
}

export function hasMarketsError(): boolean {
    return error !== undefined
}

export function getMarketsError(): string | undefined {
    return error
}

export function getMarketByMToken(mToken: Address): MoonwellMarket | undefined {
    if (!cachedMarkets) return undefined
    return cachedMarkets.find((m) => m.mToken.toLowerCase() === mToken.toLowerCase())
}

export function getMarketByUnderlying(underlying: Address): MoonwellMarket | undefined {
    if (!cachedMarkets) return undefined
    return cachedMarkets.find((m) => m.underlying.toLowerCase() === underlying.toLowerCase())
}

export async function initializeMoonwellMarkets(chainId: string = SupportedChainId.MOONBEAM): Promise<void> {
    if (isInitialized && cachedMarkets !== undefined) {
        return
    }

    if (isLoading) {
        return
    }

    if (chainId !== SupportedChainId.MOONBEAM) {
        error = "Only moonbeam supported"
        notifyListeners()
        return
    }

    isLoading = true
    error = undefined
    notifyListeners()

    try {
        const client = await getRpcSelectorEvmClient(chainId)
        if (!client) {
            throw new Error("No client for chain")
        }

        const results: MoonwellMarket[] = []

        for (const [underlyingRaw, mToken] of Object.entries(MOONWELL_UNDERLYING_TO_MTOKEN)) {
            const underlying = underlyingRaw as Address

            // getMarketInfo(mToken) returns Market struct (see ABI)
            const info = (await client.readContract({
                address: MOONWELL_LENS,
                abi: VenusLensAbi as any,
                functionName: "getMarketInfo",
                args: [mToken],
            })) as any
            const underlyingFromLens = (info?.[18]?.token || info?.underlying || info?.underlyingAssetAddress || undefined) as Address | undefined
            const resolvedUnderlying = (underlying && underlying !== ("" as Address) ? underlying : underlyingFromLens) as Address

            let symbol: string | undefined
            let decimals: number | undefined
            try {
                if (resolvedUnderlying && resolvedUnderlying.toLowerCase() !== zeroAddress.toLowerCase()) {
                    symbol = (await client.readContract({
                        address: resolvedUnderlying,
                        abi: erc20Abi,
                        functionName: "symbol",
                    })) as string
                    decimals = (await client.readContract({
                        address: resolvedUnderlying,
                        abi: erc20Abi,
                        functionName: "decimals",
                    })) as number
                } else {
                    // fallback to mToken symbol
                    symbol = (await client.readContract({
                        address: mToken,
                        abi: erc20Abi,
                        functionName: "symbol",
                    })) as string
                    decimals = 18
                }
            } catch {}

            results.push({
                mToken,
                underlying: resolvedUnderlying || underlying,
                symbol,
                decimals,
                isListed: Boolean(info?.isListed),
                mintPaused: Boolean(info?.mintPaused),
                borrowPaused: Boolean(info?.borrowPaused),
            })
        }

        cachedMarkets = results
        isInitialized = true
        error = undefined
    } catch (e) {
        error = e instanceof Error ? e.message : "Failed to fetch Moonwell markets"
        cachedMarkets = undefined
    } finally {
        isLoading = false
        notifyListeners()
    }
}

/**
 * Force refresh the markets data
 */
export async function refreshMoonwellMarkets(chainId: string = SupportedChainId.MOONBEAM): Promise<void> {
    isInitialized = false
    cachedMarkets = undefined
    await initializeMoonwellMarkets(chainId)
}
