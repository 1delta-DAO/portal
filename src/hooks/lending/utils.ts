import { getRpcSelectorEvmClient, RpcAction } from "@1delta/lib-utils"
import { SupportedChainId } from "@1delta/lib-utils"
import { getLenderUserDataResult, LenderUserQuery } from "@1delta/margin-fetcher"
import { getEvmClient } from "@1delta/providers"

// Batch config per chain
const CHAIN_CONFIGS: any = {
    [SupportedChainId.BASE]: {
        maxBatchSize: 1000,
        throttleMs: 250,
        maxParallelRequests: 1,
    },
    [SupportedChainId.ETHEREUM_MAINNET]: {
        maxBatchSize: 1000,
        throttleMs: 50,
        maxParallelRequests: 1,
    },
    [SupportedChainId.POLYGON_MAINNET]: {
        maxBatchSize: 1500,
        throttleMs: 30,
        maxParallelRequests: 1,
    },
    [SupportedChainId.ARBITRUM_ONE]: {
        maxBatchSize: 2000,
        throttleMs: 25,
        maxParallelRequests: 1,
    },
} as const

const DEFAULT_CHAIN_CONFIG = {
    maxBatchSize: 2000,
    throttleMs: 150,
    maxParallelRequests: 3,
}

function getChainConfig(chainId: string) {
    return CHAIN_CONFIGS[chainId as any] || DEFAULT_CHAIN_CONFIG
}

// Chunked fetching
export async function fetchChainDataWithChunking(chainId: string, queries: LenderUserQuery[]) {
    const config = getChainConfig(chainId)
    // const startTime = performance.now();
    const optimizedClient = await getRpcSelectorEvmClient(chainId, RpcAction.MULTICALL)
    const evmClientFunction = optimizedClient ? () => optimizedClient : getEvmClient

    if (queries.length <= config.maxBatchSize) {
        const result = await getLenderUserDataResult(chainId, queries, evmClientFunction, false)
        // const duration = performance.now() - startTime;
        return result
    }

    // Chunk queries
    const chunks: LenderUserQuery[][] = []
    for (let i = 0; i < queries.length; i += config.maxBatchSize) {
        chunks.push(queries.slice(i, i + config.maxBatchSize))
    }

    const results: any[] = []
    let chunkIndex = 0

    for (const chunk of chunks) {
        // const chunkStartTime = performance.now();
        try {
            const chunkResult = await getLenderUserDataResult(chainId, chunk, evmClientFunction)
            results.push(...chunkResult)

            // const chunkDuration = performance.now() - chunkStartTime;
            // Sleep between chunks
            if (chunkIndex < chunks.length - 1 && config.throttleMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, config.throttleMs))
            }
        } catch (chunkError) {
            console.error(`Chain ${chainId} chunk ${chunkIndex + 1} failed:`, chunkError)
            // Continue with other chunks instead of failing entirely
        }

        chunkIndex++
    }
    // const totalDuration = performance.now() - startTime;

    return results
}
