import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'wagmi'
import type { Chain } from 'viem'
import {
  mainnet,
  optimism,
  cronos,
  telos,
  xdc,
  bsc,
  gnosis,
  unichain,
  polygon,
  monad,
  sonic,
  manta,
  fantom,
  hyperEvm,
  metis,
  coreDao,
  moonbeam,
  sei,
  soneium,
  morph,
  mantle,
  kaia,
  base,
  plasma,
  mode,
  arbitrum,
  celo,
  avalanche,
  hemi,
  linea,
  berachain,
  blast,
  taiko,
  scroll,
  katana,
} from 'viem/chains'

export const evmChainWagmi: [Chain, ...Chain[]] = [
  mainnet,       // 1
  optimism,      // 10
  cronos,        // 25
  telos,         // 40
  xdc,           // 50
  bsc,           // 56
  gnosis,        // 100
  unichain,      // 130
  polygon,       // 137
  monad,         // 143
  sonic,         // 146
  manta,         // 169
  fantom,        // 250
  hyperEvm,      // 999
  metis,         // 1088
  coreDao,       // 1116
  moonbeam,      // 1284
  sei,           // 1329
  soneium,       // 1868
  morph,         // 2818
  mantle,        // 5000
  kaia,          // 8217
  base,          // 8453
  plasma,        // 9745
  mode,          // 34443
  arbitrum,      // 42161
  celo,          // 42220
  avalanche,     // 43114
  hemi,          // 43111
  linea,         // 59144
  berachain,     // 80094
  blast,         // 81457
  taiko,         // 167000
  scroll,        // 534352
  katana,        // 747474
]

const RPC_OVERRIDES: Record<number, string> = {
  [bsc.id]: 'https://bsc-dataseed1.bnbchain.org',
  [metis.id]: 'https://metis-andromeda.rpc.thirdweb.com',
}

export const evmTransportsWagmi = Object.assign(
  {},
  ...evmChainWagmi.map(({ id }) => {
    return {
      [id]: http(RPC_OVERRIDES[id], { batch: true }),
    }
  })
)

export const config = getDefaultConfig({
  appName: 'Portal',
  projectId: (import.meta.env.VITE_WC_PROJECT_ID as string | undefined) ?? 'id',
  chains: evmChainWagmi,
  transports: evmTransportsWagmi,
  ssr: false,
  // Effectively disable wagmi's cyclic block-watcher polling. We drive our own
  // refetches via react-query in the relevant hooks; wagmi shouldn't be hitting
  // chain RPCs on a timer (especially mainnet, whose default RPC is eth.merkle.io
  // and returns CORS errors in the browser).
  pollingInterval: Number.MAX_SAFE_INTEGER,
})
