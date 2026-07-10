import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'wagmi'
import { defineChain, type Chain } from 'viem'
import { customChains } from '@1delta/providers'
import {
  mainnet,
  optimism,
  flare,
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
  xLayer,
  fantom,
  zksync,
  pulsechain,
  stable,
  hyperEvm,
  metis,
  coreDao,
  lisk,
  moonbeam,
  sei,
  soneium,
  abstract,
  morph,
  megaeth,
  mantle,
  kaia,
  base,
  plasma,
  mode,
  arbitrum,
  celo,
  hemi,
  avalanche,
  linea,
  bob,
  berachain,
  blast,
  plumeMainnet,
  taiko,
  scroll,
  katana,
  corn,
} from 'viem/chains'

// Chains not present in viem/chains. `@1delta/providers` ships some as
// `customChains`; others (Robinhood) are defined locally until the package
// includes them. Both must live in `evmChainWagmi` below, otherwise wagmi's
// `switchChainAsync` rejects them and the chain can't be selected in the UI.
const pharos = customChains.pharosMainnet as Chain

// Robinhood Chain (4663) — Arbitrum-Orbit L2, native ETH. Not yet in
// viem/chains or @1delta/providers' customChains.
const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: {
      name: 'Robinhood Explorer',
      url: 'https://explorer.mainnet.chain.robinhood.com',
    },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 1,
    },
  },
})

export const evmChainWagmi: [Chain, ...Chain[]] = [
  mainnet,       // 1
  optimism,      // 10
  flare,         // 14
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
  xLayer,        // 196
  fantom,        // 250
  zksync,        // 324
  pulsechain,    // 369
  stable,        // 988
  hyperEvm,      // 999
  metis,         // 1088
  coreDao,       // 1116
  lisk,          // 1135
  moonbeam,      // 1284
  sei,           // 1329
  pharos,        // 1672
  soneium,       // 1868
  abstract,      // 2741
  morph,         // 2818
  megaeth,       // 4326
  robinhood,     // 4663
  mantle,        // 5000
  kaia,          // 8217
  base,          // 8453
  plasma,        // 9745
  mode,          // 34443
  arbitrum,      // 42161
  celo,          // 42220
  hemi,          // 43111
  avalanche,     // 43114
  linea,         // 59144
  bob,           // 60808
  berachain,     // 80094
  blast,         // 81457
  plumeMainnet,  // 98866
  taiko,         // 167000
  scroll,        // 534352
  katana,        // 747474
  corn,          // 21000000
]

const RPC_OVERRIDES: Record<number, string> = {
  // viem's default mainnet RPC is https://eth.merkle.io which blocks browser
  // CORS — every connector bootstrap (MetaMask SDK, WC, Coinbase, …) probes
  // the first chain in `chains` on mount, so without an override every page
  // load throws a burst of CORS errors against eth.merkle.io.
  [mainnet.id]: 'https://ethereum-rpc.publicnode.com',
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
