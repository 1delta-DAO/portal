# LendingDashboard/

The standard lending dashboard: a markets table plus the user's
positions plus the active action panel
(Deposit/Withdraw/Borrow/Repay). Used as the "Lending" tab inside
[../LendingTab.tsx](../LendingTab.tsx).

## Entry point

[LendingDashboard.tsx](LendingDashboard.tsx) is the container. It:

- pulls pools for the selected lender/chain,
- applies the risk filter and sorting via
  [../Dashboard/helpers.ts](../Dashboard/helpers.ts),
- tracks the currently selected pool and action type, and
- mounts the markets table, positions summary and action panel.

## Files

- [LendingDashboard.tsx](LendingDashboard.tsx) — Top-level container
  for the lending tab; orchestrates pool selection and action
  routing.
- [LendingMarketTable.tsx](LendingMarketTable.tsx) — Paginated
  markets table with LTV badges, TVL, APRs and risk scores; supports
  column sorting.
- [ActionPanel.tsx](ActionPanel.tsx) — Switches between
  `DepositAction`, `WithdrawAction`, `BorrowAction` and `RepayAction`
  from [../DashboardActions/](../DashboardActions/) based on the
  selected action type. Includes a mobile modal variant.
- [index.ts](index.ts) — Barrel export for `LendingDashboard`.
