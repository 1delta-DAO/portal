# lending/

DeFi lending UI: discovering markets, viewing positions, executing
deposit/borrow/withdraw/repay, and running advanced position trades
(loop, collateral swap, debt swap, refinance, close) across multiple
lenders and chains.

## Structure

[LendingTab.tsx](LendingTab.tsx) is the top-level router. It manages
the active sub-tab, the chain and lender filters, and mounts the tab
panels from [tabs/](tabs/). Panels are code-split with `lazy`, and the
flag checks sit outside the JSX, so a build with a tab disabled never
downloads its chunk — keep the flag test and the lazy element together
when adding a tab (see the comment in the file). The swap panels it
mounts live outside this tree in [../swap/](../swap/).

### Tab panels — [tabs/](tabs/)

One directory per sub-tab; the container is always `index.tsx`.

- [tabs/earn/](tabs/earn/) — "Earn" tab: discovery-focused markets
  list with an inline deposit panel, the user's positions and wallet
  assets, and the vaults view in
  [tabs/earn/vaults/](tabs/earn/vaults/). See
  [tabs/earn/README.md](tabs/earn/README.md).
- [tabs/lending/](tabs/lending/) — Standard lending dashboard:
  markets table + user positions + the Deposit/Withdraw/Borrow/Repay
  action panel. See [tabs/lending/README.md](tabs/lending/README.md).
- [tabs/trading/](tabs/trading/) — Advanced position trading (loop,
  collateral swap, debt swap, refinance, close) with quote aggregation
  and simulation. See
  [tabs/trading/README.md](tabs/trading/README.md) and
  [tabs/trading/actions/README.md](tabs/trading/actions/README.md).
- [tabs/optimizer/](tabs/optimizer/) — Flag-gated
  (`OPTIMIZER_ENABLED`) rate optimizer: token baskets, pair rate
  comparison with depth charts, combined loop/pair actions.
- [tabs/unified/](tabs/unified/) — Flag-gated
  (`UNIFIED_EARN_ENABLED`) Unified Earn tab over `GET /v1/data/earn`.
  See [tabs/unified/README.md](tabs/unified/README.md).

### Shared modules

- [actions/](actions/) — The four basic action forms
  (Deposit/Withdraw/Borrow/Repay) plus the building blocks they share
  (health-factor projection, rate impact, sub-account selector,
  execution ladder UI). Consumed by the lending and earn tabs. See
  [actions/README.md](actions/README.md).
- [shared/](shared/) — Lending-domain widgets used by more than one
  tab: selectors and filters (`LenderSelector`, `ChainFilter`,
  `RiskSelect`, `SearchableSelect`), the pool-configuration table
  (`ConfigMarketView` + its cells), the positions summary
  (`YourPositions`), IRM analytics (`IrmChart`, `IrmDock`) and e-mode
  (`EModeAnalysisModal`), badges (`RiskBadge`, `LenderBadge`,
  `OracleBadge`, `RewardBadge`), asset metadata (`AssetPopover`),
  deep-link parsing ([shared/deepLink.ts](shared/deepLink.ts)),
  fixed-term / brokered-loan pieces (`FixedTermDetails`,
  `MidnightOrderBook`, `OfferLadder`, `MakeOfferPanel`,
  `SellEarlyPanel`, `RefinanceModal`, `MigrateModal`,
  [shared/brokeredLoans.ts](shared/brokeredLoans.ts),
  [shared/fixedTerm.ts](shared/fixedTerm.ts)) and Fluid smart-market
  inputs (`SmartVault`, `SmartLegInput`, `SmartExitPanel`).
  [shared/rewards.ts](shared/rewards.ts) is a re-export shim — the
  rewards wire model lives in
  [../../sdk/lending-helper/rewards.ts](../../sdk/lending-helper/rewards.ts).
- [dashboard/](dashboard/) — Small pool-table utilities (`LtvBadge`,
  `getMaxLtv`, `sortPools`); a helper module, not a view. See
  [dashboard/README.md](dashboard/README.md).
- [terms/](terms/) — Renders the API's `termSheet` (chips, disclosure,
  rate/band setters). See [terms/README.md](terms/README.md). The wire
  types moved to
  [../../sdk/lending-helper/termSheets.ts](../../sdk/lending-helper/termSheets.ts);
  [terms/types.ts](terms/types.ts) is a re-export shim.

App-wide reusable primitives (empty/error states, modal headers,
badges, the `AmountInput` form block, the table sort/empty/pagination
helpers used by the markets tables) live in
[../common/](../common/) — see [../common/README.md](../common/README.md).
The matching table hooks live in [../../hooks/](../../hooks/)
(`useTableSort`, `useTablePagination`), alongside
[../../hooks/usePermissionLadder.ts](../../hooks/usePermissionLadder.ts),
the approvals + execute state machine every bundle-sending flow drives.
