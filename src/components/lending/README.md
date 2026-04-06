# lending/

DeFi lending UI: discovering markets, viewing positions, executing
deposit/borrow/withdraw/repay, and running advanced position trades
(loop, collateral swap, debt swap, close) across multiple lenders and
chains.

## Structure

[LendingTab.tsx](LendingTab.tsx) is the top-level router. It manages
the active sub-tab (Earn / Lending / Trading), chain and lender
filters, and composes the sub-dashboards:

- [MarketsView/](MarketsView/) — "Earn" tab. Discovery-focused list
  of high-liquidity deposit markets with an inline deposit panel.
- [LendingDashboard/](LendingDashboard/) — Standard lending dashboard
  combining a markets table, the user's positions and the
  Deposit/Withdraw/Borrow/Repay action panel.
- [TradingDashboard/](TradingDashboard/) — Advanced position trading
  (loop, collateral swap, debt swap, close) with quote aggregation
  and simulation.
- [DashboardActions/](DashboardActions/) — Reusable action forms
  (Deposit/Withdraw/Borrow/Repay) and shared building blocks (health
  factor projection, rate impact, sub-account selector, simulation
  hook). Used by `LendingDashboard` and `MarketsView`.
- [Dashboard/](Dashboard/) — Small shared utilities (LTV badge, pool
  sorting/filtering helpers) reused across dashboards.

App-wide reusable primitives (empty/error states, modal headers, badges,
the `AmountInput` form block, the table sort/empty/pagination helpers
used by the markets tables) live in
[../common/](../common/) — see [../common/README.md](../common/README.md).
The matching table hooks live in [../../hooks/](../../hooks/)
(`useTableSort`, `useTablePagination`).

## Top-level files

These are reusable widgets and view fragments shared by the
sub-dashboards above.

### Orchestration / view fragments
- [LendingTab.tsx](LendingTab.tsx) — Main router; tab navigation and
  global chain/lender filtering.
- [LendingActionTab.tsx](LendingActionTab.tsx) — Unified action panel
  that dispatches to Deposit/Withdraw/Borrow/Repay.
- [YourPositions.tsx](YourPositions.tsx) — Summary card for active
  user positions (HF, APR, NAV) with sub-account selector.
- [ConfigMarketView.tsx](ConfigMarketView.tsx) — Paginated pool
  configuration table with risk badges and pool selection.
- [UserTable.tsx](UserTable.tsx) — User positions per lender with
  collateral toggles, health factors and APRs.
- [UserAssetsTable.tsx](UserAssetsTable.tsx) — Wallet balances table
  with token logos and asset popover.
- [RunningBlanacesOverview.tsx](RunningBlanacesOverview.tsx) — Signed
  balance changes preview (assets received / paid).

### Selectors and filters
- [LenderSelector.tsx](LenderSelector.tsx) — Lender dropdown with TVL
  display.
- [ChainFilter.tsx](ChainFilter.tsx) — Chain selector built on
  `SearchableSelect`.
- [RiskSelect.tsx](RiskSelect.tsx) — Maximum-risk filter dropdown.
- [SearchableSelect.tsx](SearchableSelect.tsx) — Generic searchable
  dropdown with icons (used by chain/risk selectors).
- [LendingPoolSelectionModal.tsx](LendingPoolSelectionModal.tsx) —
  Virtualized pool picker modal.
- [AssetPopover.tsx](AssetPopover.tsx) — Asset metadata popover
  (address, chain, copy-to-clipboard).

### IRM / e-mode
- [IrmChart.tsx](IrmChart.tsx) — SVG IRM (interest rate model) curve.
- [IrmDock.tsx](IrmDock.tsx) — Context provider and dock UI for the
  IRM analytics modal.
- [EModeAnalysisModal.tsx](EModeAnalysisModal.tsx) — Modal + badge for
  inspecting and switching e-mode categories.

### Small display primitives
- [Pill.tsx](Pill.tsx) — Generic value pill with tone styling.
- [RiskBadge.tsx](RiskBadge.tsx) — Risk score badge with breakdown
  popover.
- [UsdAmount.tsx](UsdAmount.tsx) — Compact USD formatter (K/M/B).
