# EIP-7702 / EIP-5792 Atomic Batch Execution Plan

Collapse multi-transaction flows (permission grants + setup txns + the action
itself) into **one atomic wallet batch** for EOAs. Motivating case: a first
Aave V4 leverage open surfaces **5 permission txns + 1 execute** (3× spoke
`setUserPositionManager`, Taker-PM `approveBorrow`, Config-PM canSet grant —
all verified genuinely required on-chain). With batching that becomes one
wallet confirmation. The win is generic: CompoundV2 3-tx sequential routes,
Venus enable-collateral, ERC20 approves before deposits — every sequential
flow benefits.

## Approach: EIP-5792, not raw type-4 txns

The dapp never crafts 7702 delegations itself. Wallets (MetaMask smart
accounts, Coinbase, OKX, Ambire, …) expose atomic batching to dapps through
**EIP-5792 `wallet_sendCalls`** and fulfill it for EOAs via their own 7702
delegation (with their own upgrade UX on first use). Contract wallets get the
same interface natively.

Stack is already sufficient — **no dependency changes**:

- `viem ^2.47` — `sendCalls` / `getCapabilities` / `waitForCallsStatus`
  (stable wallet actions, `forceAtomic` supported)
- `wagmi ^2.19` — `useCapabilities`, `useSendCalls`, `useCallsStatus`

Capability detection is dynamic (`capabilities[chainId].atomic.status`), so no
per-chain hardcoding: Avalanche C-Chain (the motivating deployment) supports
7702 post-Granite; wherever a wallet says no, we fall back to today's
sequential buttons.

## Phase 1 — core hook + trading tab (the V4 pain point)

1. **`src/hooks/useAtomicBatch.ts`** (new):
   - `useAtomicBatch(chainId)` → `{ supported, status, sendBatch }`
   - `supported`: `useCapabilities` for the connected account, chain-scoped;
     treat `atomic.status ∈ {'supported','ready'}` as batchable. `'ready'`
     means the wallet will prompt the 7702 account upgrade on first batch —
     surface a one-line hint in the UI.
   - `sendBatch(calls: LendingTx[])`: `syncChain` (reuse from
     `useSendLendingTransaction`) → `sendCalls({ calls, forceAtomic: true })`
     → `waitForCallsStatus` → on success reuse the exact
     invalidate/refetch cadence from `useSendLendingTransaction`
     (immediate invalidate + 4s/10s refetch). Calls execute **in order inside
     one tx**, so grants land before the composer call that needs them;
     atomic revert means a failed batch leaves no dangling approvals.
   - Per-call `value` passthrough (native pay amount rides on the composer
     call).
2. **`useTradingQuotes`**: add `executeAll(operation)` — calls array =
   `[...permissions, ...transactions, quotes[selectedIndex].tx]`. Keep the
   existing per-step callbacks as the fallback path.
3. **`LoopAction` / `CloseAction` / `ColSwapAction` / `DebtSwapAction`**:
   when `supported`, render one **"Approve & Execute (1 transaction)"**
   button with a collapsed list of the bundled steps; otherwise render
   today's button stack. While here, fix the known sequential-mode gap:
   `disabled={executingQuote || !allPermissionsDone}` on Execute (computed in
   the hook, currently unused).

## Phase 2 — remaining sequential flows

- `useCombinedAction` (optimizer): `steps[]` is already a flat ordered list —
  one `sendBatch(steps)` call replaces the loop when supported.
- `useActionExecution` (direct deposit/borrow/withdraw/repay): same shape
  (permissions loop + transactions loop).

## Phase 3 — modals + periphery

- `MigrateModal`, `RefinanceModal`, `EModeAnalysisModal`, vault flows
  (`useVaultActionExecution`), spot swap approval+swap.

## Edge cases / rules

- **Fallback is mandatory**: capability absent (WalletConnect relays without
  5792, older wallets, some hardware paths) → sequential buttons unchanged.
  Consider a settings toggle to force sequential mode (debugging).
- **Never mix**: a batch is all-or-nothing (`forceAtomic: true`); don't fall
  back mid-flow. If `sendCalls` throws (user rejected the upgrade), drop to
  sequential with completed=0.
- **Status**: poll `waitForCallsStatus`; bundle "confirmed" → success toast
  with tx hash from the receipt (5792 v2 returns receipts array).
- **Backend**: zero API changes — it already returns discrete
  `permissions[] / transactions[] / tx`, each state-gated server-side (only
  genuinely-missing grants are emitted, so batching them is always correct).

## Complementary (not this plan)

The 1delta composer also supports a **signature path** for all 5 V4 grants
(`AAVE_V4_PMS_BATCH_PERMIT` = one sig for all 3 PM auths via
`setUserPositionManagersWithSig`, `approveBorrowWithSig`, config-permit
`setCanSetUsingAsCollateralPermissionWithSig`) — that helps wallets without
5792 support but needs an API typed-data round-trip + calldatalib batch-permit
encoder. 7702 batching is strictly frontend and lender-agnostic, so it ships
first.

## Test matrix

- Avalanche + MetaMask (7702 smart-account upgrade prompt, then batch)
- A non-5792 wallet → sequential fallback renders and works
- Batch with an intentionally reverting call (dev) → atomic revert, no
  partial grants, clean error surface
- Native-value case: AVAX pay-in loop (value on the composer call only)
- Safe via WalletConnect: capability probe result decides; no special-casing
