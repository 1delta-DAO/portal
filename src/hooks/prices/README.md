# hooks/prices/

USD price queries for tokens.

## Files

- [usePriceQuery.ts](usePriceQuery.ts) — `usePriceQuery`: fetches
  USD prices for a list of `RawCurrency` values, grouped by chain
  (`/v1/data/token/prices`). Returns
  `Record<chainId, Record<address, { usd: number }>>` with 30s stale
  time and 60s refetch interval.

See the top-level [../README.md](../README.md) for the full hook
reference.
