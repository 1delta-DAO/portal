# tabs/unified/ — Unified Earn

One tab over `GET /v1/data/earn`: lending markets and vaults in a single
listing, the account's whole supply-side portfolio, and the actions for both.
Opt-in behind `VITE_UNIFIED_EARN_ENABLED=true` (see
[../../LendingTab.tsx](../../LendingTab.tsx)).

## Layout

Master–detail. One list column, one persistent detail rail, the portfolio
headline pinned above both.

```
┌─ Net value · Supplied · Borrowed · Lending · Vaults · Positions ──────────┐
├───────────────────────────────────────────────┬──────────────────────────┤
│ ▾ [logo] Steakhouse USDC · Morpho      4.21%  │  identity + APR + risk   │
│ [APR|TVL|Share] [7d|30d|90d]      4.18% 12 Aug│  ⚠ illiquid / gated      │
│   ╭─╮   ▁▂▃▅▇▅▃▂▃▅▇▆▄▃▂▁▂▃▄▅▆▇▅▃▂▁▂▃▄        │  ── action ──            │
├───────────────────────────────────────────────┤  verb · pay with · amount│
│ [Opportunities 320] [Your positions 4] Rows15▾│  [ Deposit ]             │
│ kind · protocol · curator · asset · toggles   │  ▸ Rate & exit           │
│ ┌───────────────────────────────────────────┐ │  ▸ Terms                 │
│ │ table (15 rows)                           │ │                          │
│ └───────────────────────────────────────────┘ │                          │
│ 1–15 of 320                           ‹ 1/22 ›│                          │
└───────────────────────────────────────────────┴──────────────────────────┘
```

Four surfaces compete for the page — portfolio, listing, detail, action — and
the arrangement is the answer to what each one is _for_:

- **The detail is a rail, not a card in the flow.** It used to render between
  the filters and the table, so clicking a row pushed the table half a screen
  down and moved the row out from under the cursor: the one interaction the tab
  is built around was also the one that lost your place. The rail is sticky,
  scrolls on its own, and renders a placeholder when nothing is selected — so
  the first click reflows nothing. Same shape the Lending tab uses
  (`ActionPanel`), so this tab no longer looks foreign next to it.
- **The chart is a full-width band above the table, not a rail section.** A rate
  series is a shape and a shape needs horizontal room: at 18–24rem, 90 daily
  points land three to a pixel column and the line reads as noise. The band gets
  the whole list column — 700–1000px — which is the difference between "steady
  for a month" and "spiked yesterday", the question an APR sort keeps provoking
  and the table cannot answer. It is **always mounted**, with the same chart
  component standing in as its own empty state, so selecting a row swaps the
  contents instead of pushing the table down; the header collapses it, and that
  choice is persisted for anyone who wants the ~19rem back.
- **The action sits above the fine print inside the rail.** Order is by
  decision: who and what it pays → anything disqualifying → the action → the
  fine print. A panel you must scroll to act in reads as an information page.
  Rate & exit and Terms are collapsed by default so the common path is short.
  The rail never charts on desktop — one series, one chart, one request.
- **Positions and opportunities share one frame, behind a view switch.** They
  are the same question asked twice, they feed the same rail, and stacking both
  tables meant the listing began a screen below the fold. The portfolio still
  leads — as `PortfolioSummary`, the part a returning user actually checks,
  which stays on screen in _both_ views — and the tab opens on the positions
  rows when the account holds any (once per account, ref-guarded, so a 30s
  refetch never yanks the view back).
- **One pagination and one page size** for both tables, from the shared
  `useTablePagination` / `<TablePagination>`, instead of two hand-rolled
  controls at 50 and 25. Default 15, selectable 15/25/50/100, persisted.

Rejected: a modal for the detail (hides the list you are comparing against, and
comparison is the whole job); tabs _inside_ the rail (buries the action behind a
click); leaving both tables stacked (the listing never got the fold); mounting
the chart band only when a row is selected (saves ~19rem, at the cost of the
exact layout jump the rail was built to remove — the collapse toggle buys the
same space without it).

Mobile (`< md`) drops the band and the rail, and opens the detail — chart
included — as a sheet.

## Files

- [index.tsx](index.tsx) — container: fetches, owns selection/sort/view/page
  state, lays out list + rail, and routes a clicked position back into the
  catalogue row that fills the rail.
- [PortfolioSummary.tsx](PortfolioSummary.tsx) — the totals strip, plus every
  qualifier that makes the figure a lower bound (pending chain, partial read,
  snapshot).
- [FacetFilters.tsx](FacetFilters.tsx) — every control rendered from the
  server's own `facets`; no venue/provider constant lives here.
- [MultiSelectDropdown.tsx](MultiSelectDropdown.tsx) — the dropdown those
  controls are built from.
- [EarnMarketsTable.tsx](EarnMarketsTable.tsx) — the listing.
- [EarnPositionsTable.tsx](EarnPositionsTable.tsx) — the portfolio rows. Vaults
  are one row; a lending account is one row per (chain, lender) and only
  expands where the lender has genuine sub-accounts.
- [HistoryPanel.tsx](HistoryPanel.tsx) — the wide chart band: selected-row
  header, time window, collapse.
- [DetailPanel.tsx](DetailPanel.tsx) — the rail body and its placeholder.
- [EarnActionPanel.tsx](EarnActionPanel.tsx) — deposit/withdraw, driven
  entirely by `row.capabilities`; it never learns what a provider is.
- [HistoryChart.tsx](HistoryChart.tsx) — hand-rolled SVG series (no chart
  dependency in this app). Non-zero baseline, labelled at both ends; gaps stay
  gaps.
- [TermSheetPanel.tsx](TermSheetPanel.tsx) — term sheet, typed loosely so a new
  server section is additive.

## Conventions

Follows [../../../../styles/DESIGN.md](../../../../styles/DESIGN.md): shared
`<Badge>` / `<TablePagination>` / `<SortableHeader>` / `<EmptyState>` /
`<ErrorAlert>`, `text-base-content/{40,50,70}` for hierarchy (no bare
`opacity-*`), `tabular-nums` on every numeric cell, and all number rendering
through `utils/format`.
