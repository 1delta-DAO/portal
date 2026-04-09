# hooks/lending/

React-Query hooks and helpers for lending data: pools, IRM curves,
user positions, balances, and the data-flattening layer that joins
public pool data with the user's positions.

For per-hook details (endpoints, params, return shapes, caching) see
the top-level [../README.md](../README.md).

## Files

### Pool / market data

- [usePoolData.ts](usePoolData.ts) — three hooks against the lending
  endpoints, all defined in one file:
  - **`useLenders(chainId)`** — lightweight per-(chain, lender)
    enumeration from `/v1/data/lending/lenders`. One entry per lender
    with `lenderInfo`, server-computed `tvlUsd`, and `lastFetched`.
    Drives the lender dropdown without paying for full per-market
    data. Defines `LenderSummary`.
  - **`useLendingLatest(chainId, lenderKeys, enabled)`** — full
    per-market data from `/v1/data/lending/latest`. Both `chains` and
    `lenders` are required by the backend, and the `lenders` list is
    capped at 20 keys per request, so the hook **chunks the input
    array internally** into batches of 20 and merges the responses
    into a single keyed map. Pass an empty `lenderKeys` array to skip
    the fetch entirely (useful while `useLenders` is still loading).
    Defines `LenderData`, `LenderInfoMap`, `PoolDataItem`.
  - **`usePoolConfigData(chainId, lenderKey, maxRiskScore?)`** — pool
    data grouped by e-mode / configuration from
    `/v1/data/lending/pools/by-config`. Defines `PoolConfigGroup`,
    `ConfigMarketItem`.
- [useFlattenedPools.ts](useFlattenedPools.ts) — Paginated
  (`useInfiniteQuery`) fetch of all pools for a chain/lender from
  `/v1/data/lending/pools`. Defines `PoolEntry`, `PoolRisk`,
  `LenderInfo`.
- [useIrmData.ts](useIrmData.ts) — Interest-rate-model curves for a
  market (`/v1/data/lending/irm`).

### User positions

- [useUserData.ts](useUserData.ts) — User lending positions. Supports
  both a direct API mode and an RPC-based mode (default). Defines
  `LenderUserDataEntry`, `UserPositionEntry`, `UserDataSummary`.
- [fetchUserDataRpc.ts](fetchUserDataRpc.ts) — RPC-based fetch
  pipeline used by `useUserData`: calls
  `/v1/data/lending/user-positions/rpc-call` for the call
  descriptors, runs them, then POSTs the raw results to
  `/v1/data/lending/user-positions/parse` for parsing.
- [executeRpcCalls.ts](executeRpcCalls.ts) — Low-level
  `executeRpcCallsWithRetry` that runs JSON-RPC `eth_call`s against
  the chain RPCs (handles both descriptor and full JSON-RPC formats,
  with retry).

### Balances

- [useTokenBalances.ts](useTokenBalances.ts) — Wallet balances for a
  caller-supplied list of asset addresses
  (`/v1/data/token/balances`). Returns a `Map<address, TokenBalance>`.
- [useLendingBalances.ts](useLendingBalances.ts) — Wallet balances
  for _all_ lending-compatible tokens on a chain
  (`/v1/data/token/balances/lending`). No asset list needed.

### Joining layer

- [prepareMixedData.ts](prepareMixedData.ts) — Pure helpers that
  flatten `LenderData` (per-pool) and stitch in the user's positions
  to produce `FlattenedPoolWithUserData[]` plus per-lender
  `PositionTotals` and `UserConfigs`. This is what the dashboards
  consume.
