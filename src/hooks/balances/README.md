# hooks/balances/

Wallet balance queries for native and ERC-20 tokens.

## Files

- [useBalanceQuery.ts](useBalanceQuery.ts) — `useBalanceQuery`:
  fetches balances for a caller-supplied list of `RawCurrency`
  values, grouped by chain (`/v1/data/token/balances`). Returns
  `Record<chainId, Record<address, BalanceEntry>>` where
  `BalanceEntry = { value, raw?, balanceUSD, priceUSD }`. 30s stale
  time, 60s refetch interval.

For lending-specific balance hooks (`useTokenBalances`,
`useLendingBalances`) see [../lending/](../lending/). The full hook
reference lives in [../README.md](../README.md).
