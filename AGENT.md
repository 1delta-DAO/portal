# AGENT.md - Portal Frontend

## Quick Reference

- **Stack**: React 19 + TypeScript 5.9 + Vite 7 + Tailwind 4 + DaisyUI 5
- **Chain layer**: wagmi 3 + viem 2 + RainbowKit 2
- **Data**: TanStack React Query 5
- **Routing**: react-router-dom 7 (single dynamic route)
- **Backend**: `VITE_BACKEND_BASE_URL` (default `https://portal.1delta.io`)

## Project Structure

```
src/
├── App.tsx                  # Root layout: navbar, IrmDockProvider, router
├── main.tsx                 # Entry: WagmiProvider → QueryClient → RainbowKit → BrowserRouter → ToastProvider → App
├── wagmi.ts                 # Chain config, transports, polling intervals
├── rainbowkitTheme.ts       # DaisyUI-matched wallet modal theme
│
├── components/
│   ├── lending/             # Core feature area (see Feature Map below)
│   ├── swap/                # Spot swap panel
│   ├── connect/             # Wallet connect button + dropdown
│   ├── common/              # Logo, ToastHost
│   ├── themeSwitcher/       # Light/dark toggle
│   ├── token-selection/     # Token picker modal + selector
│   └── PortalLogo.tsx       # Animated SVG logo
│
├── hooks/
│   ├── lending/             # Pool data, user data, balances, IRM, RPC helpers
│   ├── balances/            # Wallet balance queries
│   ├── prices/              # Token price queries
│   ├── useChains.ts         # Fetch available chains from API
│   ├── useSyncChain.ts      # Sync wallet chain with UI selection
│   ├── useTokenLists.ts     # Token metadata + logos (cached)
│   ├── useSendLendingTransaction.ts  # Tx submission with permit support
│   ├── useSpotSwapQuote.ts  # Swap quote fetching
│   ├── useDebounce.ts       # Input debounce
│   └── useIsMobile.ts       # Viewport detection
│
├── sdk/
│   └── lending-helper/      # Backend API clients
│       ├── fetchLendingAction.ts   # Build deposit/withdraw/borrow/repay txs
│       ├── fetchEMode.ts           # E-Mode analysis
│       ├── fetchLoopRange.ts       # Max loop size
│       ├── fetchNextAccount.ts     # Next sub-account ID
│       └── fetchFromApi.ts         # Generic API wrapper
│
├── lib/
│   ├── data/tokenListsCache.ts     # Global token list cache with dedup
│   └── trade-helpers/utils.ts      # getCurrency helpers
│
├── utils/
│   ├── format.ts            # USD/token formatting, abbreviations, TVL
│   ├── routes.ts            # URL slug helpers (tab, lender)
│   ├── explorer.ts          # Block explorer URL builders
│   ├── addressValidation.ts # EIP-55 checksum
│   ├── inputValidation.ts   # Numeric input sanitization
│   └── price.ts             # Price conversion
│
├── config/
│   └── backend.ts           # Backend base URL from env
│
├── types/                   # Shared TypeScript definitions
└── styles/                  # Global CSS + Tailwind
```

## Routing

Single dynamic route: `/:tab?/:chainId?/:lender?`

| URL slug | Internal tab | View |
|----------|-------------|------|
| `earn`   | earn        | Browse pools, simple deposit |
| `lending`| lending     | Manage positions (deposit/withdraw/borrow/repay) |
| `loop`   | trading     | Advanced ops (loop/col-swap/debt-swap/close) |
| `swap`   | swap        | Spot token swaps |

Lender slugs: `AAVE_V3` <-> `aave-v3` (dash-separated in URL).
Helpers in `src/utils/routes.ts`: `tabFromSlug()`, `slugToLender()`, `lenderToSlug()`, `buildPath()`.

## Feature Map

All primary features live under `src/components/lending/`:

### Earn Tab (`MarketsView/`)
- `MarketsView.tsx` - Browse all lending pools across lenders
- `MarketsTable.tsx` - Searchable, sortable pool table
- `DepositPanel.tsx` - Side panel for one-click deposits
- `ExposureCell.tsx` - Market exposure indicator

### Lending Tab (`LendingDashboard/`)
- `LendingDashboard.tsx` - Main view: lender selector, positions, market table, action panel
- `LendingMarketTable.tsx` - Desktop table + mobile cards, paginated (25/page)
- `ActionPanel.tsx` - Shared action form wrapper (desktop sidebar + mobile modal)

### Looping/Trading Tab (`TradingDashboard/`)
- `TradingDashboard.tsx` - Main view: lender selector, pool selection, operation forms
- `TradingMarketTable.tsx` - Market table with role highlights (input/output/pay), paginated
- `PoolSelectorDropdown.tsx` - Multi-pool picker for trade operations
- `useTradingQuotes.ts` - Quote fetching hook
- `actions/LoopAction.tsx` - Leverage loop
- `actions/ColSwapAction.tsx` - Collateral swap
- `actions/DebtSwapAction.tsx` - Debt swap
- `actions/CloseAction.tsx` - Position close

### Shared Lending Actions (`DashboardActions/`)
- `DepositAction.tsx`, `WithdrawAction.tsx`, `BorrowAction.tsx`, `RepayAction.tsx`
- `useActionExecution.ts` - Hook: simulate + execute lending transactions
- `HealthFactorProjection.tsx` - Health factor preview before tx
- `SubAccountSelector.tsx` - Sub-account picker (for AAVE-style protocols)
- `NativeCurrencySelector.tsx` - Toggle native vs wrapped token
- `AmountQuickButtons.tsx` - 25%/50%/100% shortcuts
- `TransactionSuccess.tsx` - Post-tx confirmation

### Shared Components (in `lending/`)
- `Dashboard/` - `sortPools()` helper, `LtvBadge` component, `SortKey` type
- `YourPositions.tsx` - Position summary: deposits, debt, NAV, health, APR
- `ConfigMarketView.tsx` - E-Mode category view
- `EModeAnalysisModal.tsx` - E-Mode switching impact analysis
- `IrmChart.tsx` - Interest rate model curve (Recharts)
- `IrmDock.tsx` - Draggable dock for multiple IRM chart panels
- `AssetPopover.tsx` - Asset detail popover (oracle price, utilization, rates)
- `SearchableSelect.tsx` - Reusable searchable dropdown
- `ChainFilter.tsx` - Chain selector dropdown
- `UserTable.tsx` - User's lending positions table with collateral toggles
- `UserAssetsTable.tsx` - User's wallet assets

### Swap Tab (`swap/`)
- `SpotSwapPanel.tsx` - Token swap interface with route selection

## State Management

1. **Server state** - TanStack React Query. Key queries:
   - `['chains']` - available chains
   - `['poolData', chainId]` - lending markets
   - `['userData', chainId, account]` - user positions (RPC)
   - `['tokenBalances', chainId, account]` - wallet balances (RPC)
   - `['irmData', marketUid]` - interest rate curves

2. **URL-driven state** - Tab, chain, lender selection via `useParams()` / `useNavigate()`

3. **React Context** - `IrmDockContext` (chart panels), `ToastContext` (notifications)

4. **Local state** - Component-level `useState` for forms, filters, selections

## Data Flow (Lending Action)

1. User fills form in `DepositAction` (or Withdraw/Borrow/Repay)
2. `useActionExecution` calls `fetchLendingAction()` -> backend API builds tx
3. Backend returns simulated results (new health factor, balance changes)
4. User confirms -> `useSendLendingTransaction` handles permit + tx submission
5. On success -> React Query invalidates `userData` + `tokenBalances` queries
6. UI re-renders with fresh data

## 1delta SDK Dependencies

| Package | Purpose |
|---------|---------|
| `@1delta/calldata-sdk` | Transaction calldata encoding |
| `@1delta/margin-fetcher` | On-chain lending data via RPC |
| `@1delta/trade-sdk` | Trading operation builders |
| `@1delta/providers` | RPC provider configuration |
| `@1delta/lib-utils` | Utilities (lender names, chain IDs, isWNative) |
| `@1delta/data-sdk` | Data service clients |
| `@1delta/bridge-configs` | Cross-chain configuration |
| `@1delta/lender-registry` | Lender protocol registry |

## Dev Commands

```bash
pnpm start      # Dev server on port 3000
pnpm build      # Production build
pnpm format     # Prettier
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_BACKEND_BASE_URL` | `https://portal.1delta.io` | Backend API base URL |
