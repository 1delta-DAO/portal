# Portal — 1delta Allocator UI

A multi-chain DeFi lending and trading interface built with React, Vite, and the 1delta SDK suite. Connect your wallet, browse lending markets across chains, manage positions, and execute advanced operations like looping and collateral swaps.

## Getting Started

```bash
pnpm i && pnpm start
```

Set `VITE_BACKEND_BASE_URL` in `.env` to override the default API endpoint (`https://portal.1delta.io`).

## Tech Stack

- **React 19** + **TypeScript** — UI framework
- **Vite** — dev server and bundler
- **Tailwind CSS** + **DaisyUI** — styling and component library
- **wagmi** + **viem** — EVM wallet interaction and contract calls
- **RainbowKit** — wallet connection modal
- **TanStack Query** — async data fetching and caching
- **1delta SDKs** (`@1delta/calldata-sdk`, `@1delta/margin-fetcher`, `@1delta/lib-utils`, etc.) — lending data, calldata encoding, and protocol registry

## Project Structure

```
src/
├── components/
│   ├── lending/                  # Core application views
│   │   ├── LendingTab.tsx        # Top-level tab router (Earn / Lending / Looping)
│   │   ├── LendingDashboard.tsx  # Lending tab — deposit, withdraw, borrow, repay
│   │   ├── MarketsView/          # Earn tab — browse lending pools and deposit
│   │   ├── TradingDashboard/     # Looping tab — loop, col-swap, debt-swap, close
│   │   │   └── actions/          # Action forms for each trading operation
│   │   ├── DashboardActions/     # Shared action forms (deposit, withdraw, borrow, repay)
│   │   ├── Dashboard/            # Health factor display and LTV badges
│   │   ├── UserTable.tsx         # User lending positions table
│   │   ├── UserAssetsTable.tsx   # User wallet assets table
│   │   ├── YourPositions.tsx     # Position summary cards
│   │   ├── ChainFilter.tsx       # Chain selector dropdown
│   │   ├── EModeAnalysisModal.tsx # E-Mode configuration modal
│   │   └── ...                   # Searchable selects, pills, USD formatting
│   ├── connect/                  # Wallet connect button
│   ├── common/                   # Logo, toast notifications
│   └── themeSwitcher/            # Light/dark theme toggle
│
├── hooks/
│   ├── lending/
│   │   ├── usePoolData.ts        # Fetch lending market data from backend API
│   │   ├── useUserData.ts        # Fetch user positions and sub-accounts
│   │   ├── useLendingBalances.ts # Aggregate user lending balances
│   │   ├── useTokenBalances.ts   # Fetch wallet token balances via RPC
│   │   ├── useFlattenedPools.ts  # Flatten nested pool data for table display
│   │   ├── fetchUserDataRpc.ts   # Direct RPC calls for on-chain user data
│   │   └── executeRpcCalls.ts    # Batched multicall execution
│   ├── useChains.ts              # Available chain list
│   ├── useTokenLists.ts          # Token metadata and logos
│   ├── useSendLendingTransaction.ts # Transaction submission with permit support
│   ├── useSyncChain.ts           # Sync wagmi chain with selected chain
│   └── useDebounce.ts / useIsMobile.ts
│
├── sdk/
│   ├── lending-helper/
│   │   ├── fetchLendingAction.ts # Build lending transactions via backend API
│   │   ├── fetchEMode.ts         # E-Mode analysis API calls
│   │   ├── fetchFromApi.ts       # Generic API fetch wrapper
│   │   ├── toApiParams.ts        # Convert UI params to API request format
│   │   └── types.ts              # Allocation operation types and params
│   └── types/                    # Shared SDK type definitions
│
├── utils/
│   ├── format.ts                 # Number and TVL formatting
│   ├── price.ts                  # Price conversion helpers
│   ├── explorer.ts               # Block explorer URL builders
│   ├── addressValidation.ts      # Address checksum validation
│   └── inputValidation.ts        # Numeric input sanitization
│
├── lib/
│   ├── data/tokenListsCache.ts   # Token list caching layer
│   └── types/tokenList.ts        # Token list type definitions
│
├── config/
│   └── backend.ts                # Backend API base URL config
│
├── styles/
│   └── globals.css               # Tailwind directives and global styles
│
├── wagmi.ts                      # Wagmi + RainbowKit chain/transport config
├── rainbowkitTheme.ts            # RainbowKit DaisyUI theme integration
├── App.tsx                       # Root layout — navbar, theme, wallet
└── main.tsx                      # React entry point with providers
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm start` | Start Vite dev server |
| `pnpm build` | Production build |
| `pnpm preview` | Preview production build |
| `pnpm format` | Format code with Prettier |

## License

MIT — 1delta DAO