# terms/

Renders the API's `termSheet` — one structured description of every market's
lend and borrow offer, for every lender, in one shape.

The wire model lives in the sdk ([`termSheets.ts`](../../../sdk/lending-helper/termSheets.ts));
[`types.ts`](types.ts) re-exports it for this tree. API side:
`packages/margin-fetcher/src/terms/` in the lending-sdks repo.

## The one rule

**No lender-key conditionals anywhere in this directory.** Every branch keys
off a term-sheet field. That is what makes a newly integrated lender render
correctly with zero UI work — the same property the API's adapter registry
buys on the server.

If you are about to write `lenderKey === 'TELLER'` or
`marketUid.startsWith('MORPHO_MIDNIGHT')`, the fix is a field on the term
sheet, not a branch here.

## Three depths

| component         | where                              | shows                                           |
| ----------------- | ---------------------------------- | ----------------------------------------------- |
| `TermsChips`      | market tables, action-card header  | 2–3 severity-ordered tags                       |
| `TermsSummary`    | Deposit / Borrow panels            | headline + findings, expandable to every block  |
| `TermsDisclosure` | between the action button + wallet | the `critical` findings only, once, per profile |

Each depth is a strict subset of the next: a chip is one of the summary rows,
a summary row is one of the expanded rows.

## Severity (`severity.ts`)

Derived purely from the sheet's tags — no hand-maintained list of scary
markets, and identical for the `digest` and `full` forms because tags are
present in both.

- `critical` — you can lose MORE than the amount at stake, or lose it without
  doing anything wrong. Full-collateral seizure, time-based liquidation,
  redeemable-while-healthy, physical delivery, first-loss capital,
  under-collateralised credit, EOA-controlled governance.
- `warn` — it costs money or blocks you.
- `info` — everything else.

**Only `critical` gates a signature.** Disclosure fatigue is the failure mode:
a gate that fires often becomes a click-through and trains the reflex it
exists to prevent. If it fires on a plain Aave USDC deposit, it is broken —
watch the fire rate, and if it exceeds ~10 % of actions the severity rules are
wrong, not the users.

## Deposit and borrow are not symmetric

`TermsSummary` takes a `side` and changes both the row order and the row set,
because the two users ask different questions:

- **supply** — what do I earn (points on their own line, never in the
  headline) → **when can I get out** (`exit.mode` paired with `utilization`:
  at 99 % the APR is real and the money cannot leave) → what backs it → who
  can change the deal.
- **borrow** — what do I pay **and does it grow** (`debtShape`) → when is it
  due and what if I do nothing → what can take my collateral (price vs **TIME**
  is styled differently) → what exiting early costs.

## Two shapes, one component — read this before touching anything

A market row's `termSheet` is a **digest** far more often than a full sheet:
the list endpoints default to `?terms=digest`. The two differ _structurally_:

|                                           | full sheet               | digest                   |
| ----------------------------------------- | ------------------------ | ------------------------ |
| headline / tags                           | nested under `side.info` | hoisted to the side root |
| `info` object                             | present                  | **absent**               |
| `description` / `implications`            | present                  | absent                   |
| exit / liquidation / fees / oracle blocks | present                  | absent                   |
| `availability.canOpen`                    | nested                   | hoisted as `canOpen`     |

`termSheet` is `any` by the time it crosses the network, so
`sheet.supply.info.tags` is a **runtime crash, not a type error** — that
exact read shipped once and threw in `DepositAction`. Hence:

- the field is typed `AnyTermSheet`, never `TermSheet`;
- always go through **`sideInfo(sheet, side)`** for headline/tags/prose and
  **`isFullSheet(sheet)`** before touching a nested block;
- `severity.ts` derives findings from **tags**, which exist in both shapes,
  and only prefers the API's `implications[]` prose when it is actually there.

That last point is a safety property, not a nicety: severity keys the
disclosure gate, so if findings came only from `implications[]` the gate would
**silently disappear** on every digest — i.e. on the default response.
`hasCritical()` must return the same answer for a sheet and its digest.

## Rendering conventions

- **Present-but-zero is stated, not hidden.** `0` renders; only `undefined`
  hides a row. A `0.00%` fee is information; a missing row is not.
- **The corollary: never DEFAULT an unknown to zero.**
  `liquidation.penalty` shipped as `penalty ?? 0` and every market on
  `/lending/latest` read "Liquidator takes debt repaid + 0%" — the origin's
  `market_config` had no penalty column at all, so nothing was known (fixed by
  yield-tracer migration `0102`). The two states are not interchangeable: `0`
  is a promise, `undefined` is silence. Fields that can be unknown are
  optional in `types.ts` for exactly this reason.
- **`coverage.pending` renders as "not yet available"** (`<TermPending/>`).
  A missing oracle block must never read as "this market has no oracle" when
  the truth is "we have not classified it yet".
- **A negative `FeeTerm.value` is a REBATE.** Sign is load-bearing — never
  `Math.abs()` it away. Exactly is the one lender where repaying early pays
  you.
- **`governance.timelockSecs` is a NOTICE period, not a withdrawal lock.**
  That is `exit.cooldownSecs`. They must never be merged, summed, or shown as
  the same kind of thing.

## Unknown values

Every union in `types.ts` is open (`| (string & {})`); the API adds members
additively. So:

- every `switch`/lookup has a `default` that falls back to something correct
  and generic, ultimately `info.headline` (always populated by the API for
  exactly this purpose);
- `FeeTerm` renders from its own `label`/`unit`/`value`, so an unrecognised
  `id` still produces a correct row;
- unknown tags de-kebab into a neutral chip rather than being dropped.

The acceptance test: a sheet from a lender this build has never heard of, with
an unknown `rate.kind`, an unknown `FeeTerm.id`, an unknown tag and a pending
oracle block, must render with no crash, no empty card and no silently dropped
row.

## Specialist slots

Live order-book depth (`OfferLadder`, `MidnightOrderBook`) and the IRM curve
(`IrmChart`) have no term-sheet equivalent — they are live, interactive data,
not terms. They stay as separate components, selected by
`counterparty.kind` / `rate.kind` rather than by lender key.

`FixedTermDetailsRows` now takes `hideRows` for exactly this reason: its term
rows are superseded by `TermsSummary` (which covers every lender, not just the
fixed-term subset), while its ladder is still the only live-depth renderer.

## Collapsed vs expanded — what survives the fold

`TermsSummary` renders in two states, and the split between them is a safety
decision rather than a layout one.

**Always visible (collapsed):** the headline, up to three chips, the
unavailability banner, and **every `critical` finding**. Criticals are what
`useTermsAcknowledgement` gates the wallet on, so putting one behind a chevron
would trade a real safety property for tidiness.

**Expanded only:** `warn` / `info` findings, the description, and the detail
rows. Governance boilerplate — _"Parameters can be changed with no notice
period"_ — is true of most markets we serve; leaving it in the summary made it
compete with the headline while saying little.

**The toggle is conditional.** `hasExpandableDetail()` decides whether the
header is a button at all. A digest-only row whose findings are all critical has
nothing behind the chevron but _"Full terms are not loaded for this market"_ — a
dead end — so it renders as static content with no affordance.

Both rules live in `severity.ts` (`splitFindings`, `hasExpandableDetail`) rather
than inline in the component, so they are unit-tested; this package has no DOM
test harness.
