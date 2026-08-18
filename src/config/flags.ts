// Feature flags — every build-time toggle in one place. Each is read once at
// module load from Vite env vars, so a flipped flag needs a rebuild (there is
// no runtime flag service).

/** Shows the Optimize tab. Opt-in. */
export const OPTIMIZER_ENABLED = import.meta.env.VITE_OPTIMIZER_ENABLED === 'true'

// Bridge / cross-chain swap UI ships enabled but is still flagged Beta in the
// tab bar — set VITE_BRIDGE_UI_ENABLED=false in .env to hide the tab again.
export const BRIDGE_UI_ENABLED = import.meta.env.VITE_BRIDGE_UI_ENABLED !== 'false'

// Unified Earn is OPT-IN — set VITE_UNIFIED_EARN_ENABLED=true in .env to show
// it. Opt-in rather than opt-out on purpose: a flag you have to remember to
// turn OFF ships the feature by accident on the first deploy that forgets.
export const UNIFIED_EARN_ENABLED = import.meta.env.VITE_UNIFIED_EARN_ENABLED === 'true'

// Global override: when true, every chain fetches user positions via the
// prepare → client eth_call → parse flow instead of letting the API read chain
// state server-side. The per-chain lists in `hooks/lending/useUserData.ts`
// apply either way.
export const USER_POSITIONS_RPC = import.meta.env.VITE_USER_POSITIONS_RPC === 'true'
