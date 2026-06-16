# Portal — Design System Reference

The canonical visual conventions for the Portal frontend. This is a **financial
terminal**: data-dense, professional, restrained. The default theme is
`bloomberg` (pure-black, amber). New UI should match what's documented here, not
re-invent it. Most rules below are the *de-facto* practice already in the
codebase, promoted to canon and backed by the research notes at the bottom.

> Philosophy: **density is value ÷ (time × space)**, not raw element count.
> Don't cram — make each pixel earn its place. Refine, don't decorate.

---

## 1. Typography scale

| Token            | Use                                                        |
| ---------------- | ---------------------------------------------------------- |
| `text-[10px]`    | Dense labels: column headers, badges, chips, micro-labels  |
| `text-xs` (12px) | **Default body / secondary text**, table cells             |
| `text-sm` (14px) | Section titles, modal titles, headers                      |
| `text-lg` (18px) | Headline values only (net worth, summary totals)           |
| `text-xl`/`3xl`  | App title (navbar) only                                    |

- **Avoid one-off sizes** (`text-[9px]`, `text-[11px]`, `text-base`). Snap to the scale.
- Weights: `font-medium` = muted/secondary, `font-semibold` = values & labels,
  `font-bold` = badges / headline numbers.
- Uppercase labels (`text-[10px] uppercase`) **always** pair with
  `tracking-wide` and `font-semibold`.

## 2. Color & hierarchy (opacity steps)

Text hierarchy uses **three** `base-content` opacity steps — nothing else:

| Step                   | Use                                  |
| ---------------------- | ------------------------------------ |
| `text-base-content`    | Primary values                       |
| `text-base-content/70` | Strong secondary (table row text)    |
| `text-base-content/50` | Standard secondary (helper text)     |
| `text-base-content/40` | Disabled / placeholder / empty cells |

Retire `/30 /35 /45 /55 /60 /80` — snap to the nearest of the four above.

### Semantic colors (financial meaning)

| Meaning                       | Token             |
| ----------------------------- | ----------------- |
| Gain / deposit / safe / yield | `success` (green) |
| Loss / debt / borrow cost     | `error` (red)     |
| Caution / fixed-term / medium | `warning` (amber) |
| Info / oracle / neutral data  | `info` (cyan)     |
| Brand accent / active / CTA   | `primary`         |

Health factor: `< 1.1` → error, `1.1–1.3` → warning, `≥ 1.3` → success.

**Never rely on color alone** (≈8% of men have red-green deficiency). Pair
gain/loss with a sign (`+` / `−`) or arrow, not just hue.

Use **theme tokens only** — no hardcoded hex/hsl in components (theme CSS excepted).

## 3. Spacing rhythm

- Card / panel padding: `p-3 sm:p-4` (large data tables may use `sm:p-6`).
- Flex gaps: `gap-2` default, `gap-1` compact, `gap-3` spacious.
- Vertical stacks: `space-y-3`, sections `space-y-3 sm:space-y-4`.

## 4. Tables  ← the core of the product

- Class baseline: `table table-sm table-fixed w-full [&_td]:overflow-hidden [&_th]:overflow-hidden`.
- **Numeric columns are right-aligned** (`text-right`) — APR, USD, %, leverage,
  counts. Text columns left-aligned. Never center numerics.
- **Numeric cells use `tabular-nums`** so digits share a fixed width and columns
  align vertically. (`font-mono tabular-nums` is fine — on-brand for terminal.)
- **Never drop precision in a cell to save space.** Abbreviate magnitude
  (`$1.2M`) only where the column is genuinely tight; keep decimals otherwise.
- Sticky headers: `[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-base-100 [&_th]:border-b [&_th]:border-base-300`.
- Sortable headers: use the shared `<SortableHeader>` — don't hand-roll arrows.
- Pagination: use the shared `<TablePagination>`.
- Empty states: `<TableEmptyRow>` inside a table, `<EmptyState>` for a whole view.
- **Zebra striping is allowed** (it aids long/static tables); just keep the
  hover state visually distinct from the stripe (handled per-theme in globals.css).

## 5. Numbers & currency  (`src/utils/format.ts`)

Route **all** number rendering through the shared utils — don't `toFixed` inline.

| Need                  | Util                                  |
| --------------------- | ------------------------------------- |
| USD, full             | `formatUsd`                           |
| USD, abbreviated      | `abbreviateUsd`                       |
| Token amount          | `formatTokenAmount`                   |
| Number, abbreviated   | `abbreviateNumber`                    |
| Percent / APR         | `formatPercent` (2dp default)         |
| Leverage / multiplier | `formatLeverage` (`2.50×`)            |
| Price (magnitude-aware)| `formatPrice`                        |
| Missing value         | `formatEmptyValue` / `EMPTY_VALUE` (`—`) |

Empty / null / non-finite → always `—` (`EMPTY_VALUE`). Never `-`, `–`, `N/A`, `0`.

## 6. Components & chrome

- Badges: `<Badge tone="success|error|warning|info|neutral">` → tinted pill
  (`bg-{tone}/15 text-{tone}`, border-0). Tint is **/15** everywhere (not /20).
- Modals: `<ModalHeader title onClose />` for the header; `modal modal-open` + `modal-box`.
  - **Mobile scroll rules** (or the modal won't scroll on iOS):
    - Size with `dvh`, never `vh` (`vh` includes the area behind the browser
      chrome, so content sits off-screen).
    - The scrollable region must be a **real scroll container with its own
      explicit `max-h-[…dvh]` + `overflow-y-auto overscroll-contain`** (see
      `SearchableSelect`, `ListMode`). Do **NOT** rely on `flex-1 min-h-0`
      inside a `position: fixed` / grid-centered `.modal`: iOS Safari fails to
      bound the flex child, the list grows to full height, the parent merely
      clips it, and the drag chains to the page instead of scrolling.
    - Lock the page with `overflow: hidden` on `<html>`/`<body>`. Do **not** pin
      `<body>` to `position: fixed`.
- Floating popovers: `bg-base-200 border border-base-300 rounded-box shadow-xl`.
- Dropdowns: `bg-base-100 border border-base-300 rounded-box shadow-lg`.
- Inputs: `input input-bordered input-sm` (forms), `input-xs` (dense grids);
  `<AmountInput>` for amounts, `<PresetButton>` for quick-amounts.

### z-index ladder (use these, nothing in between)

| Layer                          | z      |
| ------------------------------ | ------ |
| Table sticky headers           | `z-20` |
| Dropdowns / select menus       | `z-50` |
| Navbar                         | `z-50` |
| Modal backdrop / content       | `z-40` / `z-50` |
| IRM dock                       | `z-[9990]` |
| Portal popovers (asset/vault)  | `z-[9999]` |

Anything `fixed`/portaled that floats over modals must be `z-50`+; popovers `z-[9999]`.

## 7. Motion

Restraint and speed. Gate every animation behind "*should this animate at all?*"

- Durations **< 300ms** (≈150–200ms feels most responsive). The existing
  `animate-in fade-in zoom-in-95 duration-100` on popovers is the reference.
- Prefer skeletons over spinners for content loads.
- **Respect `prefers-reduced-motion`** (global rule in globals.css).
- Avoid "AI-slop" motion: pulsing, blur entrances, hover-scale-on-everything,
  stagger-spam, bouncy springs on utility actions, motion-on-mount for static content.

---

## Research basis (verified, 2026)

High-confidence, multi-source: right-align numerics + align on decimal;
`font-variant-numeric: tabular-nums` for numeric columns; sticky headers;
full numbers by default, abbreviate only when space-constrained; don't rely on
red-green alone. Explicitly **refuted** (do not adopt): rigid 40/48/56px density
tiers + density switcher; blanket zebra-striping bans; rounding away precision in
cells. See the deep-research report archived with this change.
