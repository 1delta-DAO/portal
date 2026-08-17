# AGENT.md - Portal Frontend

## Quick Reference

- **Stack**: React 19 + TypeScript 5.9 + Vite 8 + Tailwind 4 + DaisyUI 5
- **Chain layer**: wagmi 2 + viem 2 + RainbowKit 2
- **Data**: TanStack React Query 5
- **Routing**: react-router-dom 7 (single dynamic route)
- **Backend**: all requests go through `src/sdk/http.ts`; base URL from
  `VITE_BACKEND_BASE_URL` (default `https://portal.1delta.io`)
- **Tests**: vitest, `pnpm test`

## Project Structure

Each feature directory carries its own `README.md`. Those are authoritative —
they move with the code. This tree only names directories, so it cannot drift
into describing files that were renamed.

```
src/
├── App.tsx                  # Root layout: navbar, IrmDockProvider, router
├── main.tsx                 # Entry: WagmiProvider → QueryClient → RainbowKit → Router → Toast
├── wagmi.ts                 # Chain config, transports, polling intervals
├── rainbowkitTheme.ts       # DaisyUI-matched wallet modal theme
│
├── sdk/                     # The backend boundary
│   ├── http.ts              # apiFetch / apiFetchEnvelope — every request goes here
│   ├── lending-helper/      # Action builders + the data model:
│   │                        #   poolTypes.ts         /lending/pools → PoolEntry
│   │                        #   marketTypes.ts       /lending/latest → PoolDataItem
│   │                        #   userPositionTypes.ts /lending/user-positions
│   ├── earn-helper/         # Earn listing, positions, merge logic
│   ├── vaults-helper/       # Vault catalog, actions, withdrawals, validators
│   └── hooks/               # useChainsRegistry
│
├── components/
│   ├── lending/
│   │   ├── LendingTab.tsx   # Tab bar + router; panels are React.lazy
│   │   ├── tabs/            # earn/ (+vaults/), lending/, trading/, optimizer/, unified/
│   │   ├── actions/         # Deposit / Withdraw / Borrow / Repay + execution hook
│   │   ├── shared/          # Cross-tab: positions, modals, badges, config market view
│   │   ├── dashboard/       # sortPools(), LtvBadge, SortKey
│   │   └── terms/           # Term sheets: types, formatting, rendering
│   ├── swap/                # SpotSwapPanel, XChainSwapPanel
│   ├── token-selection/     # Token picker modal + search ranking
│   ├── connect/ common/ themeSwitcher/ settingsMenu/
│   └── PortalLogo.tsx
│
├── hooks/
│   ├── lending/             # Pool/user/IRM data, order books, RPC multicall
│   ├── balances/ prices/    # Wallet balances, token prices
│   ├── earn/ vaults/        # Earn + vault queries
│   ├── useTableSort.ts      # nextSort() — the one definition of header-click semantics
│   ├── useTablePagination.ts / usePersistedFilters.ts / useDebounce.ts
│   └── useChains.ts / useTokenLists.ts / useSyncChain.ts / useSendLendingTransaction.ts
│
├── contexts/                # SpyMode (view-as-address), RiskMode, BatchMode
├── config/backend.ts        # Base URL + apiHeaders() — a fork's auth hook
├── lib/                     # lib-utils, token list cache, trade helpers
├── utils/                   # format, routes, explorer, price, validation
├── types/ styles/
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

### Earn Tab (`tabs/earn/`)
- `MarketsView.tsx` - Browse all lending pools across lenders
- `MarketsTable.tsx` - Searchable, sortable pool table
- `DepositPanel.tsx` - Side panel for one-click deposits
- `ExposureCell.tsx` - Market exposure indicator

### Lending Tab (`tabs/lending/`)
- `LendingDashboard.tsx` - Main view: lender selector, positions, market table, action panel
- `LendingMarketTable.tsx` - Desktop table + mobile cards, paginated (25/page)
- `ActionPanel.tsx` - Shared action form wrapper (desktop sidebar + mobile modal)

### Looping/Trading Tab (`tabs/trading/`)
- `TradingDashboard.tsx` - Main view: lender selector, pool selection, operation forms
- `TradingMarketTable.tsx` - Market table with role highlights (input/output/pay), paginated
- `PoolSelectorDropdown.tsx` - Multi-pool picker for trade operations
- `useTradingQuotes.ts` - Quote fetching hook
- `actions/LoopAction.tsx` - Leverage loop
- `actions/ColSwapAction.tsx` - Collateral swap
- `actions/DebtSwapAction.tsx` - Debt swap
- `actions/CloseAction.tsx` - Position close

### Shared Lending Actions (`actions/`)
- `DepositAction.tsx`, `WithdrawAction.tsx`, `BorrowAction.tsx`, `RepayAction.tsx`
- `useActionExecution.ts` - Hook: simulate + execute lending transactions
- `HealthFactorProjection.tsx` - Health factor preview before tx
- `SubAccountSelector.tsx` - Sub-account picker (for AAVE-style protocols)
- `NativeCurrencySelector.tsx` - Toggle native vs wrapped token
- `AmountQuickButtons.tsx` - 25%/50%/100% shortcuts
- `TransactionSuccess.tsx` - Post-tx confirmation

### Shared Components (`shared/`)
- `dashboard/` - `sortPools()` helper, `LtvBadge` component, `SortKey` type
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

### Vaults (`tabs/earn/vaults/`)
- `VaultsTable.tsx` / `UserVaultsTable.tsx` / `VaultPopover.tsx` - catalog + positions
- `VaultActionPanel.tsx` - Deposit / Withdraw form
- `PendingWithdrawals.tsx` - open request → claim/cancel list
- `DelegationPicker.tsx` - LST validator/group/pool selection (deposit only)

**Withdrawals route per *vault*, not per provider.** Deposits all go through the
auto-resolving `/vaults/deposit`, but exits split, and `savings` is the mixed
case — sUSDS exits instantly while sUSDe needs a 7-day cooldown. The
`sdk/vaults-helper` resolvers own this:

- `isAsyncVaultWithdraw(entry)` - true for lst/gmx/lagoon plus any savings vault
  whose `withdrawalMode` is `fixed-cooldown` / `request-based` / `queued` /
  `fee-or-queued`. Drives "Request Withdrawal" + share-denominated input.
- `withdrawFamily(entry)` - the route: async savings → `/vaults/savings`
  (`?action=request-withdraw`, SHARE units); instant savings → the generic
  `/vaults/withdraw` (UNDERLYING units, supports withdraw-all). Sending an
  instant savings vault to `/savings` fails — that route only speaks
  `request-withdraw|claim|deposit|cancel` and its registry only lists
  non-instant vaults. Pass the result as `family` to `useVaultActionExecution`
  / `fetchVaultAction`.
- `savingsWithdrawalMode` / `savingsWithdrawalCooldownSeconds(entry)` - read
  from the row's **`providerMeta`**, not its root.

Matured requests for every async vault (LST queues *and* savings cooldowns)
come from `/v1/data/vaults/withdrawals` and are claimed from
`PendingWithdrawals`. Protocol-native reference fields on a request round-trip
verbatim into the claim builder via `refFromRequest` — including
`withdrawQueue` / `claimToken`, which are load-bearing for Strata (each market
runs two cooldown escrows and `finalize` only settles the one it is called
against, so dropping them makes the claim a silent no-op).

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

## 1delta Package Dependencies

| Package | Purpose |
|---------|---------|
| `@1delta/chain-registry` | Chain metadata |
| `@1delta/lender-registry` | Lender protocol registry (names, logos, keys) |
| `@1delta/providers` | RPC provider configuration |

That is the whole list. Everything else the app needs from 1delta arrives over
the backend API rather than as a package — including calldata, which the
`/v1/actions/*` endpoints build and return under `actions.transactions`.

`components/lending/terms/types.ts` keeps a LOCAL copy of the term-sheet types
rather than importing `@1delta/margin-fetcher`, deliberately, for bundle cost.
`terms.test.ts` guards that copy against drift.

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
| `VITE_WC_PROJECT_ID` | — | WalletConnect/Reown project id (mobile wallets) |
| `VITE_OPTIMIZER_ENABLED` | off | `true` shows the Optimize tab |
| `VITE_BRIDGE_UI_ENABLED` | on | Cross-Chain (bridge) tab, shown by default with a "Beta" pill — set `false` to hide it |
| `VITE_UNIFIED_EARN_ENABLED` | off | `true` shows the Unified Earn tab redesign (`tabs/unified/`) |
| `VITE_USER_POSITIONS_RPC` | off | `true` fetches user positions for every chain via the client-side prepare → `eth_call` → parse flow instead of the API. Per-chain overrides in `useUserData.ts` apply either way |

## Chain Selection

Chain selection is per tab, driven by `TAB_CHAIN_MODE` in `src/utils/routes.ts`:

| Tab | Mode | Notes |
|-----|------|-------|
| Earn, Optimizer | `multi` | Up to `MAX_MULTI_CHAINS` (5) chains at once |
| Lending, Looping, Swap | `single` | One chain; `useLendingLatest` keys results by lender alone, so it can't hold two chains |
| Cross-Chain | `none` | The bridge panel picks a chain per side |

The `:chainId` route segment carries a CSV (`/earn/1,8453`); one id parses to a
one-element list, so existing links are unaffected. `useChainSelection` resolves
URL → localStorage → mainnet and remembers single/multi selections separately.

**Chain selection never touches wagmi.** It rewrites the URL and nothing else;
the wallet network is reconciled at transaction time by `useSyncChain` against
the chain of the row being acted on. See the invariant block in `src/wagmi.ts`.

### Backend multi-chain support

Verified against the live API — not every endpoint takes a chain list:

| Endpoint | Multi-chain |
|----------|-------------|
| `/lending/lenders`, `/lending/latest`, `/lending/user-positions` | `chains=` CSV |
| `/lending/user-positions/rpc-call` | `chains=` CSV (spec says `chain`; the live API rejects it) |
| `/lending/pairs/optimize` | `chainIds=` CSV — **with ≥2 chains, asset filters match asset _groups_, not addresses** |
| `/token/available`, `/token/balances/rpc-call` | `chainIds=` / `chains=` CSV |
| `/lending/pools` | **single chain only** — Earn fans out one query per chain (`useFlattenedPoolsMultiChain`) |
| `/token/balances/lending` | **single chain only** — `useLendingBalancesMultiChain` fans out |

`chains=all` is not supported: every endpoint answers it with zero rows, which
is why the chain picker has no "All chains" option.
