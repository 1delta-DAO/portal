# tabs/trading/

Advanced position trading: looping, collateral swap, debt swap,
refinance and position close. These actions combine
borrow/repay/deposit/withdraw with a DEX swap into a single
transaction, so they need quote aggregation, simulation and
multi-pool selection — distinct from the plain forms in
[../../actions/](../../actions/).

Mounted from [../../LendingTab.tsx](../../LendingTab.tsx) as the
"Trading" tab.

## Entry point

[index.tsx](index.tsx) exports the `TradingDashboard` container. It
selects the operation type (`Loop` / `ColSwap` / `DebtSwap` /
`Refinance` / `Close`), manages the multi-role pool selection
(input/output/pay), highlights the relevant rows in the markets table
and routes to the matching action form in [actions/](actions/).

## Files

- [index.tsx](index.tsx) — `TradingDashboard` container; operation
  switching, pool selection state, action routing.
- [TradingMarketTable.tsx](TradingMarketTable.tsx) — Markets table
  with role-based row highlighting (input / output / pay).
- [PoolSelectorDropdown.tsx](PoolSelectorDropdown.tsx) — Searchable
  pool dropdown with balance display and position-type filtering. Rows
  that do not fit the slot (a collateral-only leg in the debt list, a
  lend-only row in the collateral list — `fitsSide()` in
  `sdk/lending-helper/marketSides.ts`) sink to the bottom with a tag, and
  where one asset has several rows under the lender the subtitle is the
  MARKET name, not the asset name.
- [QuoteCard.tsx](QuoteCard.tsx) — Single quote display (amounts,
  slippage, aggregator).
- [SlippageInput.tsx](SlippageInput.tsx) — Slippage tolerance input
  with preset buttons.
- [ErrorDisplay.tsx](ErrorDisplay.tsx) — Error banner with
  copy-to-clipboard for debugging.
- [TradingExecuteBlock.tsx](TradingExecuteBlock.tsx) — Approvals +
  execute stack for a fetched quote bundle; one atomic EIP-5792 batch
  where the wallet supports it.
- [TradingTransactionSuccess.tsx](TradingTransactionSuccess.tsx) —
  Success banner with operation label and tx hash.
- [useTradingQuotes.ts](useTradingQuotes.ts) — Hook fetching
  aggregated DEX quotes; also exports `buildSimulationBody()` for
  loop range simulation.
- [types.ts](types.ts) — `TradingOperation`, `PoolRole`,
  `SelectedPool`, `TableHighlight`, `Tx`, `TradingQuote` and DEX
  routing types.
- [actions/](actions/) — Per-operation action forms; see
  [actions/README.md](actions/README.md).

## One asset on both sides of a market

Morpho Midnight lets a loan asset also be a collateral leg, and the API then
serves TWO rows for the same token under one lender: `…:0xusdc-c0`
("Collateral USDC", `borrowingEnabled: false`, `collateralActive: true`) and
`…:0xusdc` ("Loan USDC", the reverse). Positions come keyed by the same uids,
so the `marketUid` join is right; what went wrong was every place that
decided "fixed-term borrow" from `terms.length > 0` alone — the collateral
leg was seen carrying a stale rate card and rendered "Fixed from 4.82 %" on a
row nobody can borrow, beside the real loan row's "Fixed from 4.86 %".

The rules, all in `sdk/lending-helper/marketSides.ts`: a rate card is a
borrow-side fact (`rawMarketToPoolDataItem` drops it when
`borrowingEnabled === false`); `isBrokeredBorrow()` is the ONLY way to ask
for the fixed-term cell or term picker; a collateral-only row renders
`CollateralOnlyCell` in the borrow column; and an address-only hand-off
resolves to the row that fits the leg (`resolveDeepLinkPool(…, side)`).
The uid's ref is the market's own key, not always an address — read it
through `sdk/lending-helper/marketUid.ts` before slicing it into a label.
