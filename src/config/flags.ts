// Feature flags — every build-time toggle in one place. Each is read once at
// module load from Vite env vars, so a flipped flag needs a rebuild (there is
// no runtime flag service).

/** Shows the Optimize tab. Opt-in. */
export const OPTIMIZER_ENABLED = import.meta.env.VITE_OPTIMIZER_ENABLED === 'true'

// Bridge / cross-chain swap UI ships enabled but is still flagged Beta in the
// tab bar — set VITE_BRIDGE_UI_ENABLED=false in .env to hide the tab again.
export const BRIDGE_UI_ENABLED = import.meta.env.VITE_BRIDGE_UI_ENABLED !== 'false'

// Unified Earn ships enabled — set VITE_UNIFIED_EARN_ENABLED=false in .env to
// hide the tab again.
export const UNIFIED_EARN_ENABLED = import.meta.env.VITE_UNIFIED_EARN_ENABLED !== 'false'

// Global override: when true, every chain fetches user positions via the
// prepare → client eth_call → parse flow instead of letting the API read chain
// state server-side. The per-chain lists in `hooks/lending/useUserData.ts`
// apply either way.
export const USER_POSITIONS_RPC = import.meta.env.VITE_USER_POSITIONS_RPC === 'true'

// TEST: offer Solana as a DESTINATION chain in the Cross-Chain swap panel
// (EVM wallet pays, a base58 recipient receives — Relay / Mayan / NEAR
// Intents / DZap / LI.FI routes). On by default in `vite dev` so local runs
// can exercise it; off in builds unless VITE_SOLANA_DESTINATION_ENABLED=true.
// `false` disables it everywhere, dev included.
export const SOLANA_DESTINATION_ENABLED =
  import.meta.env.VITE_SOLANA_DESTINATION_ENABLED === 'true' ||
  (import.meta.env.DEV && import.meta.env.VITE_SOLANA_DESTINATION_ENABLED !== 'false')

/** Our chain id for Solana — a string, not an EIP-155 number. */
export const SOLANA_CHAIN_ID = 'solana'
