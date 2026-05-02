# MarketsView/

The "Earn" tab — a discovery-focused view of high-liquidity deposit
markets across chains, with an inline deposit panel. Mounted from
[../LendingTab.tsx](../LendingTab.tsx).

## Entry point

[MarketsView.tsx](MarketsView.tsx) fetches the flattened pool list,
filters by a (chain-dependent) TVL threshold, manages search/sort
state and renders [MarketsTable.tsx](MarketsTable.tsx) plus the
inline [DepositPanel.tsx](DepositPanel.tsx).

## Files

- [MarketsView.tsx](MarketsView.tsx) — Tab orchestrator; pool
  fetching, liquidity/search/sort filtering, deposit panel state.
- [MarketsTable.tsx](MarketsTable.tsx) — High-liquidity markets table
  with utilization circles, exposure cells, APRs and asset popovers.
- [DepositPanel.tsx](DepositPanel.tsx) — Inline action switcher for
  the selected pool; delegates to `DepositAction`/`WithdrawAction`
  from [../DashboardActions/](../DashboardActions/).
- [ExposureCell.tsx](ExposureCell.tsx) — Renders collateral/debt
  token icon stacks with click-to-expand list of all unique
  exposures.
- [helpers.ts](helpers.ts) — `scoreToRiskLabel()`, `riskDotColor()`
  and `computePoolMetrics()` (TVL/APR aggregation).
- [index.ts](index.ts) — Barrel export.
