# Term Sheets in the UI — display plan

**Status:** plan / design. Nothing implemented yet.

The API-side counterpart is
[`~/lending-sdks/TERM_SHEET_PLAN.md`](../lending-sdks/TERM_SHEET_PLAN.md), which
adds a structured `termSheet` (`supply` / `borrow`) to every `marketUid` and
every vault. This doc is how the portal shows it — specifically at the two
moments that matter most: **when someone deposits, and when someone borrows.**

---

## Table of contents

- [1. The problem, in this codebase](#1-the-problem-in-this-codebase)
- [2. Three surfaces, three depths](#2-three-surfaces-three-depths)
- [3. The severity model](#3-the-severity-model)
- [4. Deposit and borrow are not symmetric](#4-deposit-and-borrow-are-not-symmetric)
- [5. Components](#5-components)
- [6. The disclosure gate](#6-the-disclosure-gate)
- [7. What this consolidates](#7-what-this-consolidates)
- [8. Data fetching](#8-data-fetching)
- [9. Extensibility on the UI side](#9-extensibility-on-the-ui-side)
- [10. Vaults / Earn tab](#10-vaults--earn-tab)
- [11. Testing](#11-testing)
- [12. Rollout](#12-rollout)
- [13. Risks and open questions](#13-risks-and-open-questions)

---

## 1. The problem, in this codebase

Two findings from reading the current implementation.

**a) The UI has the same fragmentation as the API.** Every distinct protocol
concept grew its own component, each gated on lender-specific conditionals:

| component                                                                        | lines | reads                    |
| -------------------------------------------------------------------------------- | ----- | ------------------------ |
| `shared/FixedTermDetails.tsx` + `fixedTerm.ts`                                   | 237   | `fixedTerm`, `terms[]`   |
| `shared/BrokeredAprCell.tsx` + `brokeredLoans.ts`                                | 209   | Lista broker terms       |
| `shared/OracleBadge.tsx`                                                         | 335   | `oracleInfo`             |
| `shared/RiskBadge.tsx`                                                           | 408   | risk scores / governance |
| `shared/EModeAnalysisModal.tsx`                                                  | 402   | `config` categories      |
| `shared/ComparableRatesPill.tsx`                                                 | 445   | `/lending/comparables`   |
| `shared/MidnightOrderBook` · `OfferLadder` · `SellEarlyPanel` · `MakeOfferPanel` | 782   | order-book markets       |
| `shared/IrmDock.tsx` + `IrmChart.tsx`                                            | 498   | `/lending/irm`           |

That is ~3,300 lines of display logic whose branching mirrors the scattered API
fields one-for-one. The term sheet is the chance to make most of it
**data-driven** instead of lender-driven.

**b) There is no disclosure step at all.** `ActionExecuteBlock.tsx` (96 lines)
goes straight from the action button to the wallet — permission txs, then the
main tx. Nothing in the flow states what the user is agreeing to.

Concretely: a user can borrow on Teller today and the UI never tells them that
a missed payment past a window **observed as low as 300 seconds** lets a
liquidator seize their **entire** escrowed collateral — roughly 2× the borrowed
value at 50 % LTV, with no oracle and no health factor involved. The health
factor bar on screen stays green the whole time, because Teller has no price
trigger. That is the gap this plan closes.

---

## 2. Three surfaces, three depths

One data source, three renderings, matched to what the user is doing:

| surface       | where                                             | depth                                                          | API level                          |
| ------------- | ------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------- |
| **Scan**      | market/pool tables, `ConfigMarketView`, Earn list | `TermsChips` — 2–3 tags, severity-ordered                      | `?terms=digest`                    |
| **Compose**   | Deposit / Borrow action panels                    | `TermsSummary` — headline + 4–6 side-relevant rows, expandable | `?terms=full` for the one market   |
| **Commit**    | between the action button and the wallet          | `TermsDisclosure` — the `critical` implications only           | already loaded                     |
| _(on demand)_ | any of the above                                  | `TermsDrawer` — every block, all rows                          | + `/term-sheets?uids=` for backing |

The rule that keeps this coherent: **each depth is a strict subset of the next.**
A chip is one of the summary rows; a summary row is one of the drawer rows.
Nothing appears at a shallower depth that cannot be drilled into.

---

## 3. The severity model

Space is the binding constraint at every depth, so ranking has to be
principled rather than per-lender taste. `severity.ts` derives it purely from
structured term-sheet fields — no hand-maintained list of scary markets:

```ts
type Severity = 'critical' | 'warn' | 'info'
```

**`critical` — you can lose more than the amount at stake, or lose it without
doing anything wrong:**

- `borrow.liquidation.seizure === 'full-collateral'` (Teller)
- `borrow.maturity.atMaturity === 'default-seizure' | 'physical-delivery' | 'liquidatable'`
- `borrow.liquidation.trigger` includes `'time'` — a healthy, over-collateralized
  position can still be liquidated
- `borrow.liquidation.redeemable` (Liquity/River: your collateral can be taken at
  par while perfectly healthy)
- `supply.principal.risks` includes `'first-loss'` or `'physical-delivery'`
- `oracle.band === 'CRITICAL'`, or `oracle.flags` includes `'wrong-asset'`
- `governance.mutability === 'governed'` && `controllerKind === 'EOA'`

**`warn` — it costs money, or blocks you:**

- exit is not `instant` (cooldown / queue / request-based), or
  `exit.priceRisk === 'may-be-impossible'`
- any `FeeTerm` with `when: 'late'` or a non-trivial `when: 'exit'`
- `utilization >= 0.98` with `supply.exit.liquidity.assets ≈ 0`
- `availability.blockedBy === 'cap-full'`
- `governance.mutability === 'governed'` && `(timelockSecs ?? 0) === 0`
- `backedBy.worstRiskScore >= 4` or `worstOracleBand` is `HIGH`
- reward APR is `indicative` (points) and material relative to the headline

Everything else is `info`.

Then: chips show the top 2 · summary shows all `critical` + `warn` · the
disclosure gate fires **only** on `critical`. §13 covers why that last line is
load-bearing.

---

## 4. Deposit and borrow are not symmetric

The same component with a `side` prop, but a different row order and a
different set — because the two users are asking different questions.

### Deposit / supply

| #   | question                         | fields                                                                                                                                                                                                                                                    |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **What do I earn?**              | `rate.components` split base / rewards / intrinsic; `rate.rewards[]` for token identity and claim mechanism. **Points shown on their own line, never inside the headline** (`indicative: true`)                                                           |
| 2   | **When can I get my money out?** | `exit.mode`, `cooldownSecs`, `exit.liquidity`, and `utilization` — the exit-risk link. At 99 % utilization the APR is real and the money cannot leave; that pairing is the whole point                                                                    |
| 3   | **What backs it?**               | `backedBy` — top 3 exposures with their own oracle band and `quality.riskScore`, plus `topWeightPct` as the concentration signal. Rendered only when `weightBasis !== 'unweighted'`; pooled lenders get "accepted collateral (N assets)" with no fake pie |
| 4   | **Who can change the deal?**     | `governance.controllerKind` + `timelockSecs` as a plain sentence: _"a 3-of-5 multisig can change parameters with no delay"_                                                                                                                               |
| 5   | fees                             | `fees[]` where `when` is `ongoing` / `exit` / `performance`                                                                                                                                                                                               |

### Borrow

| #   | question                                      | fields                                                                                                                                                                                                                        |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **What do I pay, and does it grow?**          | `rate` + **`debtShape`**. `static-face` vs `accruing` is the single biggest misconception carried over from variable-rate lending, and it deserves an explicit line: _"you owe 10,412 USDC at maturity — this does not grow"_ |
| 2   | **When is it due, and what if I do nothing?** | `maturity.kind`, `maturityIso`, `atMaturity`, `graceSecs`. Perpetual markets say so explicitly rather than omitting the row                                                                                                   |
| 3   | **What can take my collateral?**              | `liquidation.trigger` (**price vs TIME** — badge them differently), `seizure`, `penalty`, `redeemable`, and the oracle pricing _my_ collateral via `acceptedCollateral.items[].oracle`                                        |
| 4   | **What does it cost to get out early?**       | `exit.earlyRepay` — and note this has three signs across our lenders: free, penalty, and _discount_ (Exactly rebates). A UI that assumes "early = penalty" is wrong on Exactly and wrong in the other direction on Term       |
| 5   | modes                                         | `borrow.modes[]` — the e-mode picker, showing the LTV each unlocks and the collateral it restricts you to                                                                                                                     |

---

## 5. Components

```
src/components/lending/terms/
├── TermsChips.tsx        # scan: 2–3 severity-ordered tags
├── TermsSummary.tsx      # compose: side-aware card, collapsible → drawer
├── TermsDrawer.tsx       # full sheet, every block
├── TermsDisclosure.tsx   # commit: the gate (§6)
├── rows/
│   ├── RateRows.tsx        MaturityRows.tsx     ExitRows.tsx
│   ├── LiquidationRows.tsx FeeRows.tsx          BackingRows.tsx
│   ├── GovernanceRows.tsx  OracleRows.tsx       UtilizationRows.tsx
│   └── ModeRows.tsx
├── severity.ts           # pure: sheet → ranked implications
├── format.ts             # FeeTerm → string, maturity → "in 34 days", timelock → prose
├── slots.ts              # counterparty.kind → specialist renderer
├── useTermSheet.ts       # fetch + cache
└── fixtures/             # one sheet per profileId (§11)
```

Two conventions carried from the existing code, because they already work:

- **Label→value rows**, exactly the `flex justify-between` + `tabular-nums`
  pattern `FixedTermDetailsRows` uses. No new visual language.
- **Present-but-zero is stated, not hidden.** `FixedTermDetails` already gets
  this right ("Fee rows are shown WHEN PRESENT (even at 0.00%), so 'no fee' is
  stated explicitly rather than looking like missing data"). Generalize it: a
  `0` renders, an `undefined` hides, and a `coverage.pending` entry renders as
  an explicit _"not yet available"_ — never silently absent. That last case is
  what stops a missing `oracle` block from reading as "this market has no
  oracle".

**Specialist components become slots, not branches.** `MidnightOrderBook`,
`OfferLadder`, `SellEarlyPanel`, `MakeOfferPanel` and `IrmChart` stay as they
are but are selected by `slots.ts` keyed on `counterparty.kind` /
`rate.kind`, never on a lender key:

```ts
// counterparty.kind → the depth/pricing widget for this market
orderbook → <OfferLadder/>   auction → <AuctionWindow/>
pool + variable-curve → <IrmChart/>   broker → <TermMenu/>
```

---

## 6. The disclosure gate

The missing step. Inserted in `ActionExecuteBlock` between the action button
and the wallet call, **only when `severity === 'critical'` implications exist**
for the side being acted on.

Design:

- A distinct review state in the existing button block — not a modal on top of
  a modal, and not a new route.
- Shows the `critical` implications verbatim from `info.implications[]`,
  which the API already emits ordered most-important-first for Teller and Term
  and will emit for every lender.
- **One explicit action to proceed** (`Review terms → I understand, continue`).
  Not a checkbox per item, and never a pre-checked box — that is a dark pattern
  and it also trains users to click through.
- Remembers acknowledgement per `(marketUid, side, profileId)` in
  `localStorage`. Keying on `profileId` means the gate **re-arms when the terms
  actually change**, which is the behaviour that makes it worth having.
- Fully keyboard-operable; the proceed button is not focused by default.

What it must not become: a generic "DeFi is risky" interstitial. If it fires on
a plain Aave USDC deposit, it is broken. Expected fire rate is roughly the
Teller / Midnight / TermMax / Liquity-redeemable / junior-tranche population —
single-digit percent of markets.

---

## 7. What this consolidates

| today                                                                         | after                                                                |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `FixedTermDetails.tsx` + `fixedTerm.ts` (237)                                 | `MaturityRows` + `ExitRows` + `FeeRows`, driven by fields not lender |
| `BrokeredAprCell` + `brokeredLoans.ts` (209)                                  | `RateRows` reading `rate.menu`                                       |
| `OracleBadge` (335)                                                           | `OracleRows` + the drawer; badge kept for tables                     |
| `EModeAnalysisModal` (402)                                                    | `ModeRows` reading `borrow.modes[]`                                  |
| ad-hoc conditional rows inside `DepositAction` (730 lines) and `BorrowAction` | one `<TermsSummary side="supply"/>` / `side="borrow"`                |

**U1 must replace, not add** (§13). The action panels are already 730 and 430
lines; bolting a card on top of the existing inline rows makes the file worse
and duplicates information on screen.

The hard rule that makes it work: **no lender-key conditionals anywhere under
`terms/`.** Every branch keys off a term-sheet field. Enforced by a CI grep
(§11) — and it is what makes a newly-integrated lender render correctly with
zero UI work, which is the same property the API-side adapter registry buys.

---

## 8. Data fetching

`useTermSheet.ts`, a thin TanStack Query wrapper matching the API's three
levels:

- **Scan** — `termSheet` digest already rides on the pool/market rows the tables
  fetch (`?terms=digest`). No extra request.
- **Compose** — one `?terms=full` fetch for the single market the panel is on,
  keyed `['termSheet', marketUid, side]`, `staleTime` ~60 s. Governance and
  oracle move far slower than rates, so a long stale window is correct.
- **Drawer** — resolves `backedBy.items[].marketUid` through
  `/v1/data/term-sheets?uids=…` in one batched call, only when the drawer opens.

Two timestamps to respect: the envelope `asOf` for rates, and
`governance.asOfScreen` for the governance block. The drawer footer should show
the screen date rather than implying the governance data is as fresh as the
APR.

---

## 9. Extensibility on the UI side

Mirrors §13 of the API plan — the UI is where an open enum either pays off or
crashes.

- **Every `switch` has a `default`** that falls back to `info.headline`, which
  is always populated. A term sheet from a lender this build has never heard of
  must still render a correct, if generic, card.
- **`FeeTerm` renders itself.** It carries `label`, `unit`, `basis` and
  `value`, so an unrecognized `id` still produces a correct row. Same for
  `GovernancePower`, `TermTag` and `principal.risks[]` — unknown members render
  as a neutral chip with their raw label rather than being dropped.
- **`coverage.pending` renders explicitly**, so a not-yet-wired block is
  visible as pending rather than absent.
- **No `Lender.*` imports under `terms/`.** CI-enforced.

The acceptance test for all of this: a synthetic term sheet with
`rate.kind: 'some-future-model'`, an unknown `FeeTerm.id`, an unknown tag and a
`pending` oracle block must render with no crash, no empty card, and no silently
dropped row.

---

## 10. Vaults / Earn tab

The Earn tab's deposit panel takes the **same `TermsSummary side="supply"`**
with no vault-specific component — that is the payoff of the API modelling
vaults as the borrow-less case rather than a separate shape.

Two vault-specific behaviours worth naming:

- `exit.mode` is the headline fact for a savings vault, not the APR. A 10-day
  `fixed-cooldown` on sNUSD or the soulbound-receipt flow on apyUSD belongs
  above the fold, and today lives in `providerMeta` where the UI has to go
  looking for it.
- `utilization` is **absent** on savings/LST vaults by design (no debt
  accumulator). `ExitRows` must render `instantLiquidityRatio` in its place, not
  a blank utilization row.

---

## 11. Testing

1. **Fixture set** — one term sheet per `profileId` (~40), checked in under
   `terms/fixtures/`. Every component renders every fixture at every depth.
   These double as the design review artifact.
2. **No-lender-conditionals lint** — CI greps `src/components/lending/terms/`
   for `Lender.`, `AAVE_`, `TELLER`, `startsWith('`, `lenderKey ===`. Any hit
   fails. This is the single check that keeps the consolidation from eroding.
3. **Unknown-value resilience** — the §9 acceptance test.
4. **Disclosure-gate snapshots** for the known-surprising markets: Teller
   (full-collateral seizure, 300 s grace), Midnight (past-due is itself the
   trigger), TermMax (physical delivery), Exactly (164 %/yr late penalty),
   Liquity (redeemable while healthy), a junior Strata tranche (first-loss), and
   sUSDe (10-day cooldown). Assert the gate fires, and assert it does **not**
   fire on Aave USDC.
5. **Severity purity** — `severity.ts` is a pure function over the sheet;
   table-driven unit tests, no React.
6. **Accessibility** — keyboard traversal of the gate; proceed not
   auto-focused; no pre-checked acknowledgement.

---

## 12. Rollout

| phase  | scope                                                                                                                                          | size |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| **U0** | `useTermSheet` + `severity.ts` + `format.ts` + fixtures. Pure logic, no UI, fully unit-tested.                                                 | S    |
| **U1** | `TermsSummary` in `DepositAction` + `BorrowAction`, **replacing** the ad-hoc inline rows                                                       | M    |
| **U2** | `TermsChips` in the market tables + `ConfigMarketView`; `TermsDrawer`                                                                          | M    |
| **U3** | `TermsDisclosure` gate in `ActionExecuteBlock`                                                                                                 | S    |
| **U4** | Consolidation: retire `FixedTermDetails` / `BrokeredAprCell` / `EModeAnalysisModal` into rows; move order-book + IRM widgets behind `slots.ts` | M    |
| **U5** | Earn tab / vaults (same components, `side="supply"`)                                                                                           | S    |

U0 can start now — it only needs the schema, not the endpoint. U1–U3 need the
API's phase 4. U4 is pure refactor and can trail.

---

## 13. Risks and open questions

1. **Disclosure fatigue is the failure mode.** If the gate fires often it
   becomes a click-through and actively harms users by training the reflex.
   Gate on `critical` only, never `warn`, and treat the fire rate as a metric
   to watch — if it exceeds ~10 % of actions, the severity rules are wrong, not
   the users.
2. **U1 must delete as much as it adds.** Otherwise two sources of truth appear
   on the same screen, which is worse than the status quo.
3. **The demo UI is also the reference implementation.** Integrators copy these
   patterns, which raises the stakes on the no-lender-conditionals rule and on
   getting the deposit/borrow asymmetry (§4) right rather than shipping one
   generic card.
4. **Open — does `TermsChips` belong in the tables at all?** The market tables
   are already dense and carry `RiskBadge`, `OracleBadge` and
   `ComparableRatesPill`. Chips may be better as a hover/popover on the existing
   row than as new columns. Leaning popover; needs a look at the live table
   before committing.
5. **Open — where does the gate live for batched EIP-7702 flows?**
   `ActionExecuteBlock` renders "one atomic confirmation where the wallet
   supports it" (see also `EIP7702_BATCH_PLAN.md`). A batch spanning several
   markets has several term sheets. Options: gate once on the union of
   `critical` implications, or per-leg. Union is probably right, but the
   grouping needs design.
6. **Open — do we show `backedBy` at all for pooled lenders?** With
   `weightBasis: 'unweighted'` there is no split to show, only a count and a
   worst-case. A bare _"30 accepted collaterals, worst oracle band HIGH"_ may be
   more alarming than informative. Leaning: show the worst-case line only, and
   put the list in the drawer.
