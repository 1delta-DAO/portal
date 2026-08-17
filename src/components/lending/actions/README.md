# actions/

Reusable action forms for the four basic lending operations —
**Deposit**, **Withdraw**, **Borrow**, **Repay** — plus the shared
building blocks they all need (amount input helpers, health-factor
projection, rate impact, sub-account selection, the approvals +
execute block, success banner).

These are consumed by:

- [../tabs/lending/ActionPanel.tsx](../tabs/lending/ActionPanel.tsx)
  in the standard lending dashboard, and
- [../tabs/earn/DepositPanel.tsx](../tabs/earn/DepositPanel.tsx)
  in the Earn tab.

For the more complex composite operations (loop, collateral swap,
debt swap, refinance, close), see
[../tabs/trading/actions/](../tabs/trading/actions/).

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

Two lender families cannot open a position through the borrow form
(opening needs collateral, debt and rate/band parameters in one call),
so the Borrow panel swaps in a dedicated view for them:

- [LiquityOpenPanel.tsx](LiquityOpenPanel.tsx) — Opens a
  Liquity-family trove; the interest rate is edited inside the term
  sheet, not the form.
- [LlamaLendOpenNotice.tsx](LlamaLendOpenNotice.tsx) — Notice shown
  when the user has no LlamaLend loan yet; points to
  deposit-and-borrow.

## Execution

- [useActionExecution.ts](useActionExecution.ts) — Submission hook
  shared by all four forms: fetches the action bundle, debounces,
  simulates, and exposes the ladder state. The approvals + execute
  state machine itself was extracted to
  [../../../hooks/usePermissionLadder.ts](../../../hooks/usePermissionLadder.ts)
  so refinance, migrate, vault and earn flows drive the same logic;
  this hook embeds it and keeps its public API unchanged.
- [ExecutionLadder.tsx](ExecutionLadder.tsx) — The ladder UI:
  step-by-step approvals (one at a time, in order) then the action
  button, or a single atomic EIP-5792 batch where the wallet supports
  it. Takes a structural `LadderView`, so any hook embedding the
  ladder can drive it.
- [ActionExecuteBlock.tsx](ActionExecuteBlock.tsx) — Thin wrapper
  around `ExecutionLadder` that adds the term-sheet gate: when the
  market carries `critical` terms the user has not acknowledged, the
  [`TermsDisclosure`](../terms/TermsDisclosure.tsx) replaces the
  execute button until they do.

## Shared building blocks

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
  [../tabs/trading/actions/](../tabs/trading/actions/).
- [TransactionSuccess.tsx](TransactionSuccess.tsx) — Success banner
  with action label, amount and tx hash.

## Utilities

- [format.ts](format.ts) — Amount-string math
  (`compareAmountStrings`, `multiplyAmountString`, `isOverMax`,
  `sanitizeAmountInput`, input formatting) and re-exports of
  `formatUsd` / `formatTokenAmount`.
- [helpers.ts](helpers.ts) — `lenderSupportsSubAccounts()` (INIT,
  EULER_V2, DOLOMITE, the FLUID families, …).
- [types.ts](types.ts) — The `ActionType` union
  (`'Deposit' | 'Withdraw' | 'Borrow' | 'Repay'`) and
  `ActionPanelProps`.
- [index.ts](index.ts) — Barrel export of the four action forms and
  the types.
