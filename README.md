# Portal — 1delta Allocator UI

A multi-chain DeFi lending and trading interface built with React, Vite, and the 1delta SDK suite. Connect your wallet, browse lending markets across chains, manage positions, and execute advanced operations like looping and collateral swaps.

## Getting Started

```bash
pnpm i && pnpm start
```

Set `VITE_BACKEND_BASE_URL` in `.env` to override the default API endpoint (`https://portal.1delta.io`).

## Tech Stack

- **React 19** + **TypeScript 5.9** — UI framework
- **Vite 7** — dev server and bundler
- **Tailwind CSS 4** + **DaisyUI 5** — styling and component library
- **wagmi 3** + **viem 2** — EVM wallet interaction and contract calls
- **RainbowKit 2** — wallet connection modal
- **TanStack Query 5** — async data fetching and caching
- **react-router-dom 7** — URL-driven routing
- **1delta SDKs** (`@1delta/calldata-sdk`, `@1delta/margin-fetcher`, `@1delta/lib-utils`, etc.) — lending data, calldata encoding, and protocol registry

## Features

### Earn (`/earn`)

Browse lending pools across all supported protocols and chains. Search by asset name/symbol, sort by APR/deposits/liquidity, and deposit directly from a side panel.

**Location**: `src/components/lending/MarketsView/`

| File | Purpose |
|------|---------|
| `MarketsView.tsx` | Main browse view, lender/chain selection |
| `MarketsTable.tsx` | Searchable, sortable, paginated pool table |
| `DepositPanel.tsx` | Side panel for one-click deposits |
| `ExposureCell.tsx` | Market exposure indicator |

### Lending (`/lending/:chainId/:lender`)

Full position management dashboard. Select a lender, view positions (deposits, debt, health factor, APR), and execute deposit/withdraw/borrow/repay actions.

**Location**: `src/components/lending/LendingDashboard/`

| File | Purpose |
|------|---------|
| `LendingDashboard.tsx` | Main view: lender selector, positions, market table, action panel |
| `LendingMarketTable.tsx` | Desktop table + mobile cards, paginated (25/page) |
| `ActionPanel.tsx` | Action form wrapper (desktop sidebar + mobile modal) |

**Shared actions** in `src/components/lending/DashboardActions/`:

| File | Purpose |
|------|---------|
| `DepositAction.tsx` | Deposit form with simulation |
| `WithdrawAction.tsx` | Withdrawal form |
| `BorrowAction.tsx` | Borrow against collateral |
| `RepayAction.tsx` | Repay outstanding debt |
| `useActionExecution.ts` | Hook: simulate + execute lending transactions |
| `HealthFactorProjection.tsx` | Health factor preview before tx |
| `SubAccountSelector.tsx` | Sub-account picker (AAVE-style protocols) |
| `NativeCurrencySelector.tsx` | Toggle native vs wrapped token |
| `AmountQuickButtons.tsx` | 25%/50%/100% amount shortcuts |

### Looping (`/loop/:chainId/:lender`)

Advanced leveraged operations executed in single transactions:

| Operation | Description | File |
|-----------|-------------|------|
| **Loop** | Deposit → borrow → swap cycle for leveraged positions | `actions/LoopAction.tsx` |
| **Collateral Swap** | Exchange one collateral asset for another | `actions/ColSwapAction.tsx` |
| **Debt Swap** | Switch debt from one asset to another | `actions/DebtSwapAction.tsx` |
| **Close** | Unwind a leveraged position | `actions/CloseAction.tsx` |

**Location**: `src/components/lending/TradingDashboard/`

| File | Purpose |
|------|---------|
| `TradingDashboard.tsx` | Main view: lender selector, pool selection, operation forms |
| `TradingMarketTable.tsx` | Market table with role highlights (input/output/pay), paginated |
| `PoolSelectorDropdown.tsx` | Multi-pool picker for trade operations |
| `useTradingQuotes.ts` | Quote fetching hook |
| `QuoteCard.tsx` | Trade quote display |
| `SlippageInput.tsx` | Slippage tolerance config |

### Swap (`/swap`)

Simple spot token swaps with route aggregation.

**Location**: `src/components/swap/SpotSwapPanel.tsx`

### Shared Components (in `lending/`)

| Component | Purpose |
|-----------|---------|
| `YourPositions.tsx` | Position summary: deposits, debt, NAV, health, APR |
| `ConfigMarketView.tsx` | E-Mode category view |
| `EModeAnalysisModal.tsx` | E-Mode switching impact analysis |
| `IrmChart.tsx` | Interest rate model curve visualization |
| `IrmDock.tsx` | Draggable dock for multiple IRM chart panels |
| `AssetPopover.tsx` | Asset detail hover card (oracle price, utilization, rates) |
| `SearchableSelect.tsx` | Reusable searchable dropdown |
| `ChainFilter.tsx` | Chain selector dropdown |
| `Dashboard/` | `sortPools()` helper, `LtvBadge`, `SortKey` type |
| `UserTable.tsx` | User's lending positions with collateral toggles |
| `UserAssetsTable.tsx` | User's wallet assets table |

## Project Structure

```
src/
├── components/
│   ├── lending/                     # Core application views
│   │   ├── LendingTab.tsx           # Top-level tab router (Earn / Lending / Looping / Swap)
│   │   ├── LendingDashboard/        # Lending tab
│   │   │   ├── LendingDashboard.tsx # Main component (state, hooks, layout)
│   │   │   ├── LendingMarketTable.tsx # Market table + mobile cards
│   │   │   ├── ActionPanel.tsx      # Action forms (desktop + mobile modal)
│   │   │   └── index.ts
│   │   ├── TradingDashboard/        # Looping tab
│   │   │   ├── TradingDashboard.tsx # Main component
│   │   │   ├── TradingMarketTable.tsx # Market table with role highlights
│   │   │   ├── PoolSelectorDropdown.tsx
│   │   │   ├── useTradingQuotes.ts
│   │   │   ├── types.ts
│   │   │   ├── actions/             # Loop, ColSwap, DebtSwap, Close
│   │   │   └── index.ts
│   │   ├── DashboardActions/        # Shared lending action forms
│   │   │   ├── DepositAction.tsx / WithdrawAction.tsx / BorrowAction.tsx / RepayAction.tsx
│   │   │   ├── useActionExecution.ts
│   │   │   ├── HealthFactorProjection.tsx / SubAccountSelector.tsx / ...
│   │   │   └── index.ts
│   │   ├── MarketsView/             # Earn tab
│   │   ├── Dashboard/               # Shared helpers (sortPools, LtvBadge)
│   │   ├── YourPositions.tsx        # Position summary cards
│   │   ├── ConfigMarketView.tsx     # E-Mode config view
│   │   ├── IrmChart.tsx / IrmDock.tsx # Interest rate visualization
│   │   ├── AssetPopover.tsx         # Asset detail hover card
│   │   └── ...                      # SearchableSelect, ChainFilter, UserTable, etc.
│   ├── swap/                        # Spot swap panel
│   ├── connect/                     # Wallet connect button
│   ├── token-selection/             # Token picker modal
│   ├── common/                      # Logo, toast notifications
│   └── themeSwitcher/               # Light/dark theme toggle
│
├── hooks/
│   ├── lending/
│   │   ├── usePoolData.ts           # Fetch lending market data from backend API
│   │   ├── useUserData.ts           # Fetch user positions and sub-accounts via RPC
│   │   ├── useTokenBalances.ts      # Wallet token balances via RPC
│   │   ├── useLendingBalances.ts    # Aggregate user lending balances
│   │   ├── useIrmData.ts            # Interest rate model data
│   │   ├── useFlattenedPools.ts     # Flatten nested pool data for table display
│   │   ├── fetchUserDataRpc.ts      # Direct RPC calls for on-chain user data
│   │   └── executeRpcCalls.ts       # Batched multicall execution
│   ├── useChains.ts                 # Available chain list from API
│   ├── useTokenLists.ts             # Token metadata and logos (globally cached)
│   ├── useSendLendingTransaction.ts # Transaction submission with permit support
│   ├── useSyncChain.ts              # Sync wagmi chain with selected chain
│   ├── useSpotSwapQuote.ts          # Swap quote fetching
│   └── useDebounce.ts / useIsMobile.ts
│
├── sdk/
│   ├── lending-helper/
│   │   ├── fetchLendingAction.ts    # Build lending transactions via backend API
│   │   ├── fetchEMode.ts            # E-Mode analysis API calls
│   │   ├── fetchLoopRange.ts        # Max loop size calculation
│   │   ├── fetchNextAccount.ts      # Next available sub-account
│   │   ├── fetchFromApi.ts          # Generic API fetch wrapper
│   │   └── types.ts                 # Allocation operation types
│   └── types/                       # Shared SDK type definitions
│
├── utils/
│   ├── format.ts                    # USD/token formatting, abbreviations, TVL
│   ├── routes.ts                    # URL slug helpers (tab, lender)
│   ├── explorer.ts                  # Block explorer URL builders
│   ├── price.ts                     # Price conversion helpers
│   ├── addressValidation.ts         # EIP-55 checksum validation
│   └── inputValidation.ts           # Numeric input sanitization
│
├── lib/
│   ├── data/tokenListsCache.ts      # Token list caching with dedup
│   └── trade-helpers/utils.ts       # getCurrency helpers
│
├── config/backend.ts                # Backend API base URL
├── types/                           # Shared TypeScript definitions
├── styles/globals.css               # Tailwind directives
├── wagmi.ts                         # Wagmi + RainbowKit chain/transport config
├── rainbowkitTheme.ts              # RainbowKit DaisyUI theme
├── App.tsx                          # Root layout — navbar, IrmDockProvider, router
└── main.tsx                         # Entry: providers stack → App
```

## Architecture

### Routing

Single dynamic route: `/:tab?/:chainId?/:lender?`

| URL | Tab | View |
|-----|-----|------|
| `/earn` | Earn | Browse pools, deposit |
| `/lending/1/aave-v3` | Lending | Manage AAVE V3 positions on Ethereum |
| `/loop/42161/morpho-blue` | Looping | Leverage ops on Morpho Blue (Arbitrum) |
| `/swap` | Swap | Spot token swaps |

URL helpers in `src/utils/routes.ts`: `tabFromSlug()`, `slugToLender()`, `lenderToSlug()`, `buildPath()`.

### Provider Stack

```
WagmiProvider → QueryClientProvider → RainbowKitProvider → BrowserRouter → ToastProvider → IrmDockProvider → App
```

### State Management

| Layer | Tool | Examples |
|-------|------|---------|
| Server state | React Query | Pool data, user positions, balances, IRM curves |
| URL state | react-router | Tab, chain, lender selection |
| Global UI | React Context | IRM dock panels, toast notifications |
| Local state | useState | Form inputs, filters, selections, pagination |

### Data Flow (Lending Transaction)

1. User fills form in action component (e.g. `DepositAction`)
2. `useActionExecution` calls `fetchLendingAction()` → backend API builds tx + simulates
3. Backend returns simulated health factor and balance changes
4. User confirms → `useSendLendingTransaction` handles EIP-2612 permit + tx submission
5. On success → React Query invalidates `userData` + `tokenBalances` queries
6. UI re-renders with fresh on-chain data

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm start` | Start Vite dev server (port 3000) |
| `pnpm build` | Production build |
| `pnpm preview` | Preview production build |
| `pnpm format` | Format code with Prettier |

## Supported Protocols

Any lending protocol in `@1delta/lender-registry`, including AAVE V2/V3, Morpho Blue, Euler V2, Compound V2/V3, and others.

## License

MIT — 1delta DAO
