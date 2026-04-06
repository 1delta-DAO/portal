# DashboardActions/

Reusable action forms for the four basic lending operations —
**Deposit**, **Withdraw**, **Borrow**, **Repay** — plus the shared
building blocks they all need (amount input helpers, health-factor
projection, rate impact, sub-account selection, simulation hook,
success banner).

These are consumed by:
- [../LendingDashboard/ActionPanel.tsx](../LendingDashboard/ActionPanel.tsx)
  in the standard lending dashboard, and
- [../MarketsView/DepositPanel.tsx](../MarketsView/DepositPanel.tsx)
  in the Earn tab.

For the more complex composite operations (loop, collateral swap,
debt swap, close), see
[../TradingDashboard/actions/](../TradingDashboard/actions/).

## Action forms

All four forms render the amount input via the shared
[`AmountInput`](../../common/AmountInput.tsx) primitive (label +
presets + decimal input + error row). Withdraw and Repay pass an
`onMaxClick` callback so the **Max** preset flips an `isAll` flag in
the parent instead of just filling the field; Repay also computes its
dual-error message in the parent (wallet-overflow takes precedence
over debt-overflow).

- [DepositAction.tsx](DepositAction.tsx) — Deposit form with native
  token selector, sub-account routing, HF projection and success
  modal.
- [WithdrawAction.tsx](WithdrawAction.tsx) — Withdraw form with
  `isAll` flow and sub-account selector.
- [BorrowAction.tsx](BorrowAction.tsx) — Borrow form with HF
  projection and rate impact display.
- [RepayAction.tsx](RepayAction.tsx) — Repay form with
  `isAll` flow, native token selector, and dual wallet/debt
  overflow validation.

## Shared building blocks

- [useActionExecution.ts](useActionExecution.ts) — Submission hook:
  fetches quotes, simulates, debounces and sends the transaction.
  The single state machine that all four action forms share.
- [HealthFactorProjection.tsx](HealthFactorProjection.tsx) — Current
  vs. projected health factor with color-coded status.
- [RateImpactIndicator.tsx](RateImpactIndicator.tsx) — APR and
  utilization before/after the action with delta colors.
- [SimulationIndicator.tsx](SimulationIndicator.tsx) — Loop
  simulation results display (HF, balance changes).
- [SubAccountSelector.tsx](SubAccountSelector.tsx) — Sub-account
  dropdown for multi-account lenders; supports creating new
  accounts.
- [NativeCurrencySelector.tsx](NativeCurrencySelector.tsx) — Toggle
  between native and wrapped token (e.g. ETH ↔ WETH).
- [AmountQuickButtons.tsx](AmountQuickButtons.tsx) — 25 / 50 / 75 /
  Max quick-fill buttons. Wrapped by
  [`AmountInput`](../../common/AmountInput.tsx) for the four basic
  forms; still used directly by the trading-action forms in
  [../TradingDashboard/actions/](../TradingDashboard/actions/).
- [TransactionSuccess.tsx](TransactionSuccess.tsx) — Success banner
  with action label, amount and tx hash.

## Utilities

- [format.ts](format.ts) — Amount-string math
  (`compareAmountStrings`, `multiplyAmountString`) and re-exports of
  `formatUsd` / `formatTokenAmount`.
- [helpers.ts](helpers.ts) — `lenderSupportsSubAccounts()`
  (currently INIT and EULER_V2).
- [types.ts](types.ts) — `ActionType` enum, `ActionPanelProps`,
  `ActionState`.
- [index.ts](index.ts) — Barrel export of action components and
  `ActionType`.
