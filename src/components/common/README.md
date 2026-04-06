# common/

App-wide reusable primitives. Anything in here is **domain-agnostic** —
it knows nothing about lending, pools, or specific asset types. If you
need a building block from more than one feature, it lives here.

Most of these were extracted during the visual-polish pass to kill
duplicated empty/error/badge/header recipes that had been drifting apart
across the lending UI.

## Forms

- [AmountInput.tsx](AmountInput.tsx) — Label row + 25/50/75/Max preset
  buttons + sanitized decimal input + error message. Used by all four
  basic action forms (Deposit/Withdraw/Borrow/Repay). The optional
  `onMaxClick` prop routes the **Max** preset to the parent instead of
  filling the field — Withdraw/Repay use this to flip an `isAll` flag.
  The parent owns validation; pass the message via `error`.

## Modals & overlays

- [ModalHeader.tsx](ModalHeader.tsx) — Title bar with circular ghost
  close button. Use for any dialog or docked panel that has a title.
  Single source of truth for modal headers (was three different styles
  before).

## Status & feedback

- [EmptyState.tsx](EmptyState.tsx) — `title` + optional `icon` /
  `description` / `action`. `size="sm"` is the compact variant for use
  inside table cells, popovers and dropdowns. Replaces the mix of
  `alert alert-info`, plain "No matches" text, and bespoke
  flex-column-with-svg empty states.
- [ErrorAlert.tsx](ErrorAlert.tsx) — Red-bordered card with the error
  message and a copy-to-clipboard button. Accepts `string | Error |
  null` and renders nothing when the error is falsy, so callers can
  drop it in unconditionally. Generalizes the older
  `TradingDashboard/ErrorDisplay` (which is now a thin alias).
- [ToastHost.tsx](ToastHost.tsx) — Toast context + provider. Exposes
  `useToast()` with `show / showError / showSuccess / showInfo /
  showWarning`. Mount the host once near the app root.

## Badges & buttons

- [HealthBadge.tsx](HealthBadge.tsx) — Health-factor badge with the
  standard tone scale (red < 1.1, yellow < 1.3, green ≥ 1.3). Pass
  `size` for the DaisyUI badge sizing token.
- [PresetButton.tsx](PresetButton.tsx) — Compact ghost button used for
  preset values (amount %, slippage %). Replaces the duplicated
  `btn btn-ghost btn-xs px-1.5 py-0 h-5 min-h-0 text-[10px]` recipe in
  `AmountQuickButtons` + `SlippageInput`.

## Tables

The 5 lending tables don't share a single `<DataTable>` wrapper — they
diverge too much in column count, row structure, sort/search ownership
and mobile fallback strategy. Instead they share these small pieces:

- [SortableHeader.tsx](SortableHeader.tsx) — `<th>` with click-to-sort
  behavior and an inline arrow indicator. Generic over the sort key
  type. Pairs with [`useTableSort`](../../hooks/useTableSort.ts).
- [TableEmptyRow.tsx](TableEmptyRow.tsx) — Single-row "no results"
  state for `<tbody>`. Replaces the bespoke `<tr><td colSpan>...`
  boilerplate scattered across the lending tables.
- [TablePagination.tsx](TablePagination.tsx) — Bottom-of-table
  "X–Y of Z" + prev/next bar. Bound to the state object returned by
  [`useTablePagination`](../../hooks/useTablePagination.ts). Renders
  nothing when `totalPages <= 1`.

The matching hooks live in [src/hooks/](../../hooks/):
`useTableSort`, `useTablePagination`.

## Logos

- [Logo.tsx](Logo.tsx) — `<img>` with a graceful text fallback when
  the source 404s. Used wherever we display a token / chain / lender
  logo from a remote URL.
