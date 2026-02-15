import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'wagmi'
import { getAvailableChainIds, SupportedChainId } from '@1delta/lib-utils'
import { getEvmChain } from '@1delta/providers'

// auto-inititalize chains based on state
export const evmChainWagmi: any[] = getAvailableChainIds()
  .filter((a) => a !== SupportedChainId.FUEL)
  .map((chainId) => getEvmChain(chainId))

const RPC_OVERRIDES = {
  [SupportedChainId.BNB_SMART_CHAIN_MAINNET]: 'https://bsc-dataseed1.bnbchain.org',
  [SupportedChainId.METIS_ANDROMEDA_MAINNET]: 'https://metis-andromeda.rpc.thirdweb.com',
}

export const evmTransportsWagmi = Object.assign(
  {},
  ...evmChainWagmi.map(({ id }) => {
    return {
      // @ts-ignore
      [id]: http(RPC_OVERRIDES[String(id)], { batch: true }),
    }
  })
)

export const config = getDefaultConfig({
  appName: 'Portal',
  projectId: 'id',
  chains: evmChainWagmi as any,
  transports: evmTransportsWagmi,
  ssr: false,
  pollingInterval: 30_000,
})
