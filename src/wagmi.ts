import { getDefaultConfig } from "@rainbow-me/rainbowkit"
import { arbitrum, avalanche, base, mainnet, mantle, moonbeam, plasma, polygon } from "wagmi/chains"
import { fallback, http } from "wagmi"

export const config = getDefaultConfig({
    appName: "Moonbeamer",
    projectId: "id",
    chains: [arbitrum, avalanche, base, mainnet, mantle, moonbeam, plasma, polygon],
    transports: {
        [mainnet.id]: http("https://ethereum-rpc.publicnode.com"),
        [base.id]: http("https://base-rpc.publicnode.com"),
        [polygon.id]: http("https://polygon-bor-rpc.publicnode.com"),
        [arbitrum.id]: http("https://arbitrum-one-rpc.publicnode.com"),
        [avalanche.id]: http("https://avalanche.drpc.org"),
        [mantle.id]: http("https://mantle.drpc.org"),
        [plasma.id]: http("https://plasma.drpc.org"),
    },
    ssr: false,
})
