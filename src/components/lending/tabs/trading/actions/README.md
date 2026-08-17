# tabs/trading/actions/

Action forms for the advanced position-trading operations exposed by
[../index.tsx](../index.tsx) (`TradingDashboard`). Each form takes
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
- [SwapLikeAction.tsx](SwapLikeAction.tsx) — The shared swap-shaped
  form, parameterized by a `SwapLikeConfig`; collateral swap and
  debt swap are configurations of it.
- [ColSwapAction.tsx](ColSwapAction.tsx) — Collateral swap: exchange
  one deposited asset for another via a DEX route. Leads with the
  withdraw leg; supports `isAll`.
- [DebtSwapAction.tsx](DebtSwapAction.tsx) — Debt swap: exchange a
  borrowed asset for another. Leads with the repay leg.
- [RefinanceAction.tsx](RefinanceAction.tsx) — Refinance / roll-over
  of fixed-term loans as a first-class operation; lists loans on
  markets whose API-served `capabilities[]` declare `refinance` and
  opens [`RefinanceModal`](../../../shared/RefinanceModal.tsx).
- [CloseAction.tsx](CloseAction.tsx) — Close position: repay debt
  using collateral with liquidation-risk checks and final balance
  summary.
