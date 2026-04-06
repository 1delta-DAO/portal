# TradingDashboard/

Advanced position trading: looping, collateral swap, debt swap and
position close. These actions combine borrow/repay/deposit/withdraw
with a DEX swap into a single transaction, so they need quote
aggregation, simulation and multi-pool selection — distinct from the
plain actions in [../DashboardActions/](../DashboardActions/).

Mounted from [../LendingTab.tsx](../LendingTab.tsx) as the "Trading"
tab.

## Entry point

[TradingDashboard.tsx](TradingDashboard.tsx) selects the operation
type (`Loop` / `ColSwap` / `DebtSwap` / `Close`), manages the
multi-role pool selection (input/output/pay), highlights the
relevant rows in the markets table and routes to the matching action
form in [actions/](actions/).

## Files

- [TradingDashboard.tsx](TradingDashboard.tsx) — Top-level container;
  operation switching, pool selection state, action routing.
- [TradingMarketTable.tsx](TradingMarketTable.tsx) — Markets table
  with role-based row highlighting (input / output / pay).
- [PoolSelectorDropdown.tsx](PoolSelectorDropdown.tsx) — Searchable
  pool dropdown with balance display and position-type filtering.
- [QuoteCard.tsx](QuoteCard.tsx) — Single quote display (amounts,
  slippage, aggregator).
- [SlippageInput.tsx](SlippageInput.tsx) — Slippage tolerance input
  with preset buttons.
- [ErrorDisplay.tsx](ErrorDisplay.tsx) — Error banner with
  copy-to-clipboard for debugging.
- [TradingTransactionSuccess.tsx](TradingTransactionSuccess.tsx) —
  Success banner with operation label and tx hash.
- [useTradingQuotes.ts](useTradingQuotes.ts) — Hook fetching
  aggregated DEX quotes; also exports `buildSimulationBody()` for
  loop range simulation.
- [types.ts](types.ts) — `TradingOperation`, `PoolRole`,
  `SelectedPool`, `TableHighlight`, `Tx`, `TradingQuote` and DEX
  routing types.
- [actions/](actions/) — Per-operation action forms (Loop, ColSwap,
  DebtSwap, Close).
- [index.ts](index.ts) — Barrel export.
