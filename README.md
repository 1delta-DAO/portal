# Portal — 1delta Allocator UI

A multi-chain DeFi lending and trading interface built with React, Vite, and the 1delta SDK suite. Connect your wallet, browse lending markets across chains, manage positions, and execute advanced operations like looping and collateral swaps.

## Getting Started

```bash
pnpm i && pnpm start
```

Set `VITE_BACKEND_BASE_URL` in `.env` to override the default API endpoint. A `VITE_WC_PROJECT_ID` (WalletConnect/Reown) is required for mobile wallet connections.

## Backend API (for integrators)

The UI talks to the 1delta backend at `https://portal.1delta.io`. The API reference is at [`https://portal.1delta.io/v1/docs`](https://portal.1delta.io/v1/docs).

**Do not call the API directly from a forked frontend.** Instead:

1. Generate an API key on the 1delta auth page: [`https://auth.1delta.io/`](https://auth.1delta.io/).
2. Stand up a thin server-side proxy that forwards requests to `https://portal.1delta.io` and attaches your API key as a header. This keeps the key off the client bundle.
3. Point `VITE_BACKEND_BASE_URL` at your proxy.

Calling the public endpoint without a key (or exposing the key in client-side code) is not supported for production integrations.

## Tech Stack

- **React 19** + **TypeScript 5.9** — UI framework
- **Vite 8** — dev server and bundler
- **Tailwind CSS 4** + **DaisyUI 5** — styling and component library
- **wagmi 2** + **viem 2** — EVM wallet interaction and contract calls
- **RainbowKit 2** — wallet connection modal
- **TanStack Query 5** — async data fetching and caching
- **react-router-dom 7** — URL-driven routing
- **react-window 2** — virtualized tables
- **1delta packages** (`@1delta/chain-registry`, `@1delta/providers`) — chain metadata and RPC providers

## Features

### Earn (`/earn`)

Browse lending pools across all supported protocols and chains. Search, filter by risk, sort by APR/deposits/liquidity, and deposit directly from a side panel.

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
| `LendingMarketTable.tsx` | Desktop table + mobile cards |
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
| `RateImpactIndicator.tsx` | Projected borrow/supply rate impact |
| `SimulationIndicator.tsx` | Simulation status pill |
| `SubAccountSelector.tsx` | Sub-account picker (AAVE-style protocols) |
| `NativeCurrencySelector.tsx` | Toggle native vs wrapped token |
| `AmountQuickButtons.tsx` | 25%/50%/100% amount shortcuts |
| `TransactionSuccess.tsx` | Post-tx confirmation view |

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
| `TradingMarketTable.tsx` | Market table with role highlights (input/output/pay) |
| `PoolSelectorDropdown.tsx` | Multi-pool picker for trade operations |
| `useTradingQuotes.ts` | Quote fetching hook |
| `QuoteCard.tsx` | Trade quote display |
| `SlippageInput.tsx` | Slippage tolerance config |
| `ErrorDisplay.tsx` | Trade error surfacing |
| `TradingTransactionSuccess.tsx` | Post-trade confirmation |

### Optimizer

Pair-level allocation optimizer surfacing best supply/borrow routes.

**Location**: `src/components/lending/Optimizer/`

### Swap (`/swap`)

Simple spot token swaps with route aggregation.

**Location**: `src/components/swap/SpotSwapPanel.tsx`

### Shared Lending Components (in `src/components/lending/`)

| Component | Purpose |
|-----------|---------|
| `YourPositions.tsx` | Position summary: deposits, debt, NAV, health, APR |
| `UserTable.tsx` | User's lending positions with collateral toggles |
| `UserAssetsTable.tsx` | User's wallet assets table |
| `RunningBlanacesOverview.tsx` | Running balances across positions |
| `ConfigMarketView.tsx` | E-Mode category view |
| `EModeAnalysisModal.tsx` | E-Mode switching impact analysis |
| `IrmChart.tsx` / `IrmDock.tsx` | Interest rate model curve visualization + draggable dock |
| `AssetPopover.tsx` | Asset detail hover card (oracle price, utilization, rates) |
| `LendingPoolSelectionModal.tsx` | Modal for picking a lending pool |
| `LenderSelector.tsx` / `LenderBadge.tsx` | Lender selection controls |
| `SearchableSelect.tsx` | Reusable searchable dropdown |
| `ChainFilter.tsx` | Chain selector dropdown |
| `RiskBadge.tsx` / `RiskSelect.tsx` | Risk score display and filter |
| `Pill.tsx` / `UsdAmount.tsx` | Small display primitives |
| `Dashboard/` | `sortPools()` helper, `LtvBadge`, `SortKey` type |

### Common UI Primitives (`src/components/common/`)

`AmountInput`, `EmptyState`, `ErrorAlert`, `ErrorBoundary`, `HealthBadge`, `Logo`, `ModalHeader`, `PresetButton`, `SortableHeader`, `TableEmptyRow`, `TablePagination`, `ToastHost`.

## Project Structure

```
src/
├── components/
│   ├── lending/                      # Core application views
│   │   ├── LendingTab.tsx            # Top-level tab router
│   │   ├── LendingActionTab.tsx      # Action tab wrapper
│   │   ├── LendingDashboard/         # Lending tab
│   │   ├── TradingDashboard/         # Looping tab (+ actions/)
│   │   ├── DashboardActions/         # Shared lending action forms
│   │   ├── MarketsView/              # Earn tab
│   │   ├── Optimizer/                # Pair optimizer
│   │   ├── Dashboard/                # Shared helpers (sortPools, LtvBadge)
│   │   └── *.tsx                     # YourPositions, IrmChart, AssetPopover, ...
│   ├── swap/SpotSwapPanel.tsx        # Spot swap
│   ├── token-selection/              # Token picker modal
│   ├── connect/                      # Wallet connect button
│   ├── common/                       # Shared UI primitives
│   ├── themeSwitcher/                # Light/dark toggle
│   └── PortalLogo.tsx
│
├── hooks/
│   ├── lending/                      # Pool/user/IRM data, RPC multicall
│   ├── balances/useBalanceQuery.ts
│   ├── prices/usePriceQuery.ts
│   ├── useChains.ts                  # Available chains from API
│   ├── useTokenLists.ts              # Token metadata (globally cached)
│   ├── useSendLendingTransaction.ts  # Tx submission with permit support
│   ├── useSpotSwapQuote.ts           # Swap quote fetching
│   ├── useSyncChain.ts               # Sync wagmi chain with selected chain
│   ├── useTablePagination.ts / useTableSort.ts
│   ├── usePersistedFilters.ts
│   └── useDebounce.ts / useIsMobile.ts
│
├── sdk/
│   ├── lending-helper/               # Backend API calls (actions, EMode, loop range, ...)
│   ├── hooks/useChainsRegistry.ts
│   └── types/
│
├── lib/
│   ├── assetLists.ts
│   ├── userTokens.ts
│   ├── data/tokenListsCache.ts
│   ├── trade-helpers/utils.ts
│   ├── lib-utils/                    # Local utilities
│   └── types/
│
├── utils/                            # format, routes, explorer, price, validation
├── contexts/SpyMode.tsx              # View-as-address context
├── config/backend.ts                 # Backend API base URL
├── types/currency.ts
├── styles/globals.css                # Tailwind directives
├── wagmi.ts                          # Wagmi + RainbowKit chain/transport config
├── rainbowkitTheme.ts                # RainbowKit DaisyUI theme
├── App.tsx                           # Root layout — navbar, providers, router
└── main.tsx                          # Entry
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

URL helpers in `src/utils/routes.ts`.

### State Management

| Layer | Tool | Examples |
|-------|------|---------|
| Server state | React Query | Pool data, user positions, balances, IRM curves |
| URL state | react-router | Tab, chain, lender selection |
| Global UI | React Context | IRM dock panels, toast notifications, spy mode |
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
| `pnpm start` | Start Vite dev server |
| `pnpm build` | Production build |
| `pnpm preview` | Preview production build |
| `pnpm format` | Format code with Prettier |

## Supported Protocols

Any lending protocol in the 1delta lender registry, including AAVE V2/V3, Morpho Blue, Euler V2, Compound V2/V3, and others.

## License

MIT — 1delta DAO
