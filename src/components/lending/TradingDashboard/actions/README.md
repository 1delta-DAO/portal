# TradingDashboard/actions/

Action forms for the advanced position-trading operations exposed by
[../TradingDashboard.tsx](../TradingDashboard.tsx). Each form takes
the selected pool(s) and position data via props, fetches quotes via
[`useTradingQuotes`](../useTradingQuotes.ts), runs simulation and
submits the resulting transaction.

The active action is chosen by `TradingDashboard` based on the
user's selected `TradingOperation` (see
[../types.ts](../types.ts)).

## Files

- [LoopAction.tsx](LoopAction.tsx) — Recursive loop: borrow → swap →
  deposit. Includes loop-range input, quote selection and
  simulation.
- [ColSwapAction.tsx](ColSwapAction.tsx) — Collateral swap: exchange
  one deposited asset for another via a DEX route.
- [DebtSwapAction.tsx](DebtSwapAction.tsx) — Debt swap: exchange a
  borrowed asset for another; shows debt balances and rate impact.
- [CloseAction.tsx](CloseAction.tsx) — Close position: repay debt
  using collateral with liquidation-risk checks and final balance
  summary.
