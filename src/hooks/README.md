# Hooks

React hooks that interact with the backend API and blockchain RPCs.

All backend calls go through `BACKEND_BASE_URL` (see `src/config/backend.ts`). Responses follow a standard envelope: `{ success, data, error? }`.

---

## Structure

- [lending/](lending/) — Lending pools, IRM, user positions, lending balances and the data-flattening layer (`prepareMixedData`). See [lending/README.md](lending/README.md).
- [prices/](prices/) — `usePriceQuery` for token USD prices.
- [balances/](balances/) — Generic `useBalanceQuery` for wallet balances.

### Top-level hooks (this directory)

Data and action hooks (documented in detail below):

- [useSendLendingTransaction.ts](useSendLendingTransaction.ts) — Low-level signer/broadcaster used by the action hooks.
- [useSpotSwapQuote.ts](useSpotSwapQuote.ts) — Spot swap quote + execution.
- [useChains.ts](useChains.ts) — Supported chain IDs.

Utility hooks (not in the reference tables below):

- [useTokenLists.ts](useTokenLists.ts) — Loads and caches token lists.
- [useDebounce.ts](useDebounce.ts) — Generic debounced-value hook.
- [useIsMobile.ts](useIsMobile.ts) — Viewport-based mobile detection.
- [useSyncChain.ts](useSyncChain.ts) — Keeps the connected wallet chain in sync with the app's selected chain.
- [usePersistedFilters.ts](usePersistedFilters.ts) — Persists user filter selections (chain, lender, risk, etc.) across reloads.
- [useTableSort.ts](useTableSort.ts) — Generic, domain-agnostic sort key/dir state for tables. Standard "click same key flips direction, new key resets to defaultDir" semantics. Pairs with `<SortableHeader>` in [components/common/](../components/common/).
- [useTablePagination.ts](useTablePagination.ts) — Generic pagination state: slices an input array, auto-resets on items.length / `resetDeps` change, clamps when items shrink. Pairs with `<TablePagination>` in [components/common/](../components/common/).

---

## Data Hooks

These hooks fetch read-only data. They are built on `@tanstack/react-query` and handle caching, polling, and pagination automatically.

### `useChains`

Returns the list of supported chain IDs.

| | |
|---|---|
| **Endpoint** | `GET /v1/data/chains` |
| **Returns** | `string[]` — chain IDs (e.g. `["1", "42161"]`) |
| **Caching** | `staleTime: 5 min`, falls back to `["1"]` |

```ts
const chains = useChains()
```

---

### `useBalanceQuery`

Fetches native/ERC-20 balances for a list of currencies, grouped by chain.

| | |
|---|---|
| **Endpoint** | `GET /v1/data/token/balances?chainId=&account=&assets=` |
| **Params** | `currencies: RawCurrency[]`, `enabled?: boolean` |
| **Returns** | `Record<chainId, Record<address, BalanceEntry>>` |
| **Caching** | `staleTime: 30s`, `refetchInterval: 60s` |

`BalanceEntry`: `{ value, raw?, balanceUSD, priceUSD }`

---

### `usePriceQuery`

Fetches USD prices for a list of currencies, grouped by chain.

| | |
|---|---|
| **Endpoint** | `GET /v1/data/token/prices?chainId=&assets=` |
| **Params** | `currencies: RawCurrency[]`, `enabled?: boolean` |
| **Returns** | `Record<chainId, Record<address, { usd: number }>>` |
| **Caching** | `staleTime: 30s`, `refetchInterval: 60s` |

---

### `useTokenBalances`

Fetches wallet balances for a specified list of asset addresses. Returns a `Map<address, TokenBalance>`.

| | |
|---|---|
| **Endpoint** | `GET /v1/data/token/balances?chainId=&account=&assets=` |
| **Params** | `chainId`, `account?`, `assets: string[]`, `enabled?` |
| **Returns** | `{ balances: Map<string, TokenBalance>, isBalancesLoading, balancesError }` |
| **Caching** | `staleTime: 30s`, `refetchInterval: 60s` |

---

### `useLendingBalances`

Fetches wallet balances for all tokens compatible with lending protocols (no asset list required).

| | |
|---|---|
| **Endpoint** | `GET /v1/data/token/balances/lending?chainId=&account=` |
| **Params** | `chainId`, `account?`, `enabled?` |
| **Returns** | `{ balances: TokenBalance[], isLoading, error }` |
| **Caching** | `staleTime: 30s`, `refetchInterval: 60s` |

---

### `useMarginPublicData`

Fetches public lending market data for a chain, grouped by lender.

| | |
|---|---|
| **Endpoint** | `GET /v1/data/lending/latest?chains=` |
| **Params** | `chainId: string` |
| **Returns** | `{ lenderData: LenderData, isPublicDataLoading, isPublicDataFetching, error }` |
| **Caching** | `staleTime: 5s`, `refetchInterval: 5 min` |

`LenderData` = `Record<lenderKey, PoolDataItem[]>`

---

### `usePoolConfigData`

Fetches pool data grouped by e-mode / configuration for a chain + lender.

| | |
|---|---|
| **Endpoint** | `GET /v1/data/lending/pools/by-config?chains=&lenders=` |
| **Params** | `chainId: string`, `lenderKey: string` |
| **Returns** | `UseQueryResult<PoolConfigGroup[]>` |
| **Caching** | `staleTime: 5s`, `refetchInterval: 5 min` |

---

### `useFlattenedPools`

Fetches all pools for a chain/lender with automatic pagination (100 items per page, auto-fetches all pages).

| | |
|---|---|
| **Endpoint** | `GET /v1/data/lending/pools?chainId=&lender=&start=&count=&includeExposures=true` |
| **Params** | `chainId?`, `lender?`, `enabled?` |
| **Returns** | `{ pools: PoolEntry[], count, isPoolsLoading, isPoolsFetching, isFetchingMore, hasMore, error }` |
| **Caching** | `staleTime: 30s`, `refetchInterval: 8 min` |

Uses `useInfiniteQuery` under the hood.

---

### `useIrmData`

Fetches interest rate model curves for a market.

| | |
|---|---|
| **Endpoint** | `GET /v1/data/lending/irm?marketUids=&dataPoints=20` |
| **Params** | `marketUid: string \| undefined` |
| **Returns** | `UseQueryResult<IrmMarket \| null>` |
| **Caching** | `staleTime: 10 min`, `refetchInterval: 30 min` |

---

### `useUserData`

Fetches user lending positions. Supports two modes: direct API fetch and RPC-based fetch (default).

| | |
|---|---|
| **Endpoint (direct)** | `GET /v1/data/lending/user-positions?chains=&account=` |
| **Endpoint (RPC)** | Three-step flow — see `fetchUserDataViaRpc` below |
| **Params** | `chainId`, `account?`, `enabled?` |
| **Returns** | `{ userData: { raw: LenderUserDataEntry[], summary }, isUserDataLoading, isUserDataFetching, error, refetch }` |
| **Caching** | `staleTime: 30s`, `refetchInterval: 5 min` |

---

## Action Hooks

These hooks build and execute on-chain transactions via the backend.

### `useSpotSwapQuote`

Fetches spot swap quotes and executes swaps.

| | |
|---|---|
| **Endpoint** | `GET /v1/actions/swap/spot?chainId=&tokenIn=&tokenOut=&amount=&slippage=&tradeType=` |
| **Params** | `SpotSwapParams` (see below) |
| **Returns** | `{ quotes, selectedIndex, permissions, loading, executing, error, fetchQuote, selectQuote, executePermission, executeSwap, reset }` |

**`SpotSwapParams`:**
| Field | Type | Note |
|---|---|---|
| `chainId` | `string` | |
| `tokenIn` | `string` | Token address |
| `tokenOut` | `string` | Token address |
| `amount` | `string` | Wei amount |
| `slippage` | `number` | **Basis points** (e.g. `50` = 0.5%) |
| `tradeType` | `0 \| 1` | 0 = exact input, 1 = exact output |
| `account?` | `string` | |

---

### `useTradingQuotes`

Generic hook for leveraged trading operations (loop, close, collateral swap, debt swap).

| | |
|---|---|
| **Endpoints** | |
| Loop | `GET /v1/actions/loop/leverage` |
| Close | `GET /v1/actions/loop/close` |
| Collateral Swap | `GET /v1/actions/loop/collateral-swap` |
| Debt Swap | `GET /v1/actions/loop/debt-swap` |

All params are passed as query-string key/value pairs. Common params across operations:

| Field | Type | Note |
|---|---|---|
| `marketUidIn` | `string` | |
| `marketUidOut` | `string` | |
| `amount` / `debtAmount` | `string` | Wei amount |
| `slippage` | `number` | **Basis points** (e.g. `30` = 0.3%) |

**Returns:** `{ quotes, permissions, transactions, selectedIndex, loading, executing, error, fetchQuotes, selectQuote, executePermission, executeTransaction, executeQuote, reset }`

---

### `useSendLendingTransaction`

Low-level hook that signs and broadcasts a transaction via the connected wallet. Used internally by `useSpotSwapQuote` and `useTradingQuotes`.

| | |
|---|---|
| **Params** | `chainId`, `account?` |
| **Returns** | `{ send(tx) → Promise<SendResult>, sending, error, clearError }` |

Handles chain switching, receipt polling, and query invalidation after confirmation.

---

## SDK Helpers

### `fetchLoopRange` / `fetchLoopRangeWithSimulation`

Standalone async functions (not hooks) that fetch the max leverage range for a loop position.

| | |
|---|---|
| **Endpoint (GET)** | `GET /v1/data/lending/range?lender=&chainId=&account=` |
| **Endpoint (POST)** | `POST /v1/data/lending/range?lender=&chainId=` with simulation body |
| **Returns** | `LoopRangeResult { success, data?: LoopRangeEntry[], error? }` |

Optional filters: `marketUidIn`, `marketUidOut`, `payAsset`, `payAmount`.

---

### `fetchUserDataViaRpc`

Three-step RPC-based fetch for user positions (used by `useUserData` by default):

1. `GET /v1/data/lending/user-positions/rpc-call?chain=&account=` — returns JSON-RPC call descriptors
2. Execute the RPC calls against the chain's RPC endpoint (via `executeRpcCallsWithRetry`)
3. `POST /v1/data/lending/user-positions/parse` — sends raw RPC results, returns parsed positions

This approach offloads RPC load to the client while keeping parsing server-side.

---

## Slippage Convention

All backend endpoints expect slippage in **basis points** (1 bp = 0.01%).

The UI (`SlippageInput` component) displays and stores slippage as a **percentage** (e.g. `0.3` = 0.3%). Conversion to basis points (`× 100`) happens at the API call site in each action component.

| UI value | Basis points sent | Meaning |
|---|---|---|
| `0.1` | `10` | 0.1% |
| `0.3` | `30` | 0.3% |
| `0.5` | `50` | 0.5% |
| `1.0` | `100` | 1.0% |
