import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { BRAND } from './config/brand'
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
  mainnet, // 1
  optimism, // 10
  flare, // 14
  cronos, // 25
  telos, // 40
  xdc, // 50
  bsc, // 56
  gnosis, // 100
  unichain, // 130
  polygon, // 137
  monad, // 143
  sonic, // 146
  manta, // 169
  xLayer, // 196
  fantom, // 250
  zksync, // 324
  pulsechain, // 369
  stable, // 988
  hyperEvm, // 999
  metis, // 1088
  coreDao, // 1116
  lisk, // 1135
  moonbeam, // 1284
  sei, // 1329
  pharos, // 1672
  soneium, // 1868
  abstract, // 2741
  morph, // 2818
  megaeth, // 4326
  robinhood, // 4663
  mantle, // 5000
  kaia, // 8217
  base, // 8453
  plasma, // 9745
  mode, // 34443
  arbitrum, // 42161
  celo, // 42220
  hemi, // 43111
  avalanche, // 43114
  linea, // 59144
  bob, // 60808
  berachain, // 80094
  blast, // 81457
  plumeMainnet, // 98866
  taiko, // 167000
  scroll, // 534352
  katana, // 747474
  corn, // 21000000
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

/**
 * INVARIANT: wagmi is a *wallet* layer here, never a data layer.
 *
 * Every piece of chain state the UI renders — pools, positions, balances,
 * prices, rates — comes from the backend API (or, for the prepare/parse flows,
 * from explicit one-shot eth_calls we issue ourselves). wagmi is only allowed
 * to know about the connected account, sign, and switch networks when the user
 * submits a transaction.
 *
 * Concretely that means:
 *  - `pollingInterval` below disables the cyclic block watcher, so wagmi never
 *    touches an RPC on a timer. Mainnet's viem default is eth.merkle.io, which
 *    blocks browser CORS, so a timer here is a stream of console errors too.
 *  - The app imports only `useAccount`, `useDisconnect`, `useSwitchChain` and
 *    `useWalletClient` — connector state and signing. No `useBalance`,
 *    `useReadContract`, `useBlockNumber` or ENS hooks. Adding one would put a
 *    per-chain RPC read behind a render, which is exactly what the API exists
 *    to avoid. Fetch through the backend instead.
 *  - Selecting chains in the UI is a data filter: it rewrites the URL and
 *    nothing else. The wallet's network is reconciled only at transaction
 *    time, by `useSyncChain`, against the chain of the row being acted on.
 *  - The connect button is hand-rolled (`components/connect/`) rather than
 *    RainbowKit's `<ConnectButton>`, which would fetch an ENS name, avatar and
 *    native balance on mount.
 */
export const config = getDefaultConfig({
  appName: BRAND.name,
  projectId: (import.meta.env.VITE_WC_PROJECT_ID as string | undefined) ?? 'id',
  chains: evmChainWagmi,
  transports: evmTransportsWagmi,
  ssr: false,
  pollingInterval: Number.MAX_SAFE_INTEGER,
})
