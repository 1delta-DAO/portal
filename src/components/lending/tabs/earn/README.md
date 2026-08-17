# tabs/earn/

The "Earn" tab — a discovery-focused view of high-liquidity deposit
markets across chains with an inline deposit panel, plus the user's
positions and wallet assets, plus the vaults view. Mounted from
[../../LendingTab.tsx](../../LendingTab.tsx).

## Entry point

[index.tsx](index.tsx) exports the `EarnTab` container. It switches
between two modes — lending markets and vaults — and, in lending
mode, stacks the user's positions and wallet-asset tables above the
markets list.

## Files

- [index.tsx](index.tsx) — `EarnTab` container; lending/vaults mode
  switch and composition of the tables below.
- [MarketsView.tsx](MarketsView.tsx) — `LendingPoolsTable`: fetches
  the flattened pool list (multi-chain), applies a chain-dependent
  minimum-deposit floor and persisted filters, manages search/sort
  state and renders [MarketsTable.tsx](MarketsTable.tsx) plus the
  inline [DepositPanel.tsx](DepositPanel.tsx).
- [MarketsTable.tsx](MarketsTable.tsx) — High-liquidity markets table
  with utilization circles, exposure cells, APRs and asset popovers.
- [DepositPanel.tsx](DepositPanel.tsx) — Inline action switcher for
  the selected pool; delegates to `DepositAction`/`WithdrawAction`
  from [../../actions/](../../actions/).
- [ExposureCell.tsx](ExposureCell.tsx) — Renders collateral/debt
  token icon stacks with click-to-expand list of all unique
  exposures.
- [UserPositionsTable.tsx](UserPositionsTable.tsx) —
  `UserLenderPositionsTable`: the user's positions per lender with
  collateral toggles, health factors and APRs.
- [UserAssetsTable.tsx](UserAssetsTable.tsx) — Wallet balances table
  with token logos and asset popover.
- [poolFilters.ts](poolFilters.ts) — The tab's client-side filter +
  sort pipeline, kept pure and separate from the view: it decides
  which markets a user does and does not see, and its exemptions are
  invisible from the rendered output when they break — pure
  input → output makes them testable
  ([poolFilters.test.ts](poolFilters.test.ts)).
- [helpers.ts](helpers.ts) — `scoreToRiskLabel()`, `riskDotColor()`,
  `computePoolMetrics()` (TVL/APR aggregation),
  `collapseSmartVaults()` and `poolEntryToPoolDataItem()`.
- [vaults/](vaults/) — The vaults mode: `VaultsView`
  ([vaults/index.tsx](vaults/index.tsx)) with the vaults and
  user-vaults tables, the vault action panel, pending-withdrawals
  list and delegation picker.
