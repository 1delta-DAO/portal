# tabs/lending/

The standard lending dashboard: a markets table plus the user's
positions plus the active action panel
(Deposit/Withdraw/Borrow/Repay). Mounted as the "Lending" tab by
[../../LendingTab.tsx](../../LendingTab.tsx).

## Entry point

[index.tsx](index.tsx) exports the `LendingDashboard` container. It:

- pulls pool configs for the selected lender/chain,
- resolves deep links via
  [../../shared/deepLink.ts](../../shared/deepLink.ts),
- applies the risk filter and sorting via
  [../../dashboard/](../../dashboard/) (`sortPools`),
- tracks the currently selected pool and action type, and
- mounts the markets table, the pool-configuration view
  ([../../shared/ConfigMarketView.tsx](../../shared/ConfigMarketView.tsx)),
  the positions summary
  ([../../shared/YourPositions.tsx](../../shared/YourPositions.tsx))
  and the action panel.

## Files

- [index.tsx](index.tsx) — `LendingDashboard` container; orchestrates
  pool selection and action routing.
- [LendingMarketTable.tsx](LendingMarketTable.tsx) — Paginated
  markets table with LTV badges, TVL, APRs and risk scores; supports
  column sorting.
- [ActionPanel.tsx](ActionPanel.tsx) — Switches between
  `DepositAction`, `WithdrawAction`, `BorrowAction` and `RepayAction`
  from [../../actions/](../../actions/) based on the selected action
  type. Also exports the mobile modal variant (`MobileActionModal`).
