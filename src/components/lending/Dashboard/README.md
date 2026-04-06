# Dashboard/

Small shared utilities for pool tables and dashboards. Despite the
name, this is **not** the lending dashboard view (that's
[../LendingDashboard/](../LendingDashboard/)) — it's a helper module
reused by the various market/position views.

## Files

- [index.ts](index.ts) — Barrel re-exporting `LtvBadge`, `getMaxLtv`
  and `sortPools`.
- [helpers.ts](helpers.ts) — `getMaxLtv()` computes the max
  loan-to-value from a pool config; `sortPools()` filters and sorts
  pools by search string and sort key.
- [LtvBadge.tsx](LtvBadge.tsx) — Renders an LTV percentage as a badge
  (cell or inline variant, optional "up to" prefix).
