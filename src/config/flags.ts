// Feature flags — every build-time toggle in one place. Each is read once at
// module load from Vite env vars, so a flipped flag needs a rebuild (there is
// no runtime flag service).

/** Shows the Optimize tab. Opt-in. */
export const OPTIMIZER_ENABLED = import.meta.env.VITE_OPTIMIZER_ENABLED === 'true'

// Bridge / cross-chain swap UI ships enabled but is still flagged Beta in the
// tab bar — set VITE_BRIDGE_UI_ENABLED=false in .env to hide the tab again.
export const BRIDGE_UI_ENABLED = import.meta.env.VITE_BRIDGE_UI_ENABLED !== 'false'

// Global override: when true, every chain fetches user positions via the
// prepare → client eth_call → parse flow instead of letting the API read chain
// state server-side. The per-chain lists in `hooks/lending/useUserData.ts`
// apply either way.
export const USER_POSITIONS_RPC = import.meta.env.VITE_USER_POSITIONS_RPC === 'true'
