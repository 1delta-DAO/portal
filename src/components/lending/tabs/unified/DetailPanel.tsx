import React, { useState } from 'react'
import { Logo } from '../../../common/Logo'
import { Badge } from '../../../common/Badge'
import { Chevron } from '../../../common/Chevron'
import { EmptyState } from '../../../common/EmptyState'
import { useEarnHistory } from '../../../../hooks/earn/useEarnHistory'
import { HistoryChart } from './HistoryChart'
import { EarnActionPanel } from './EarnActionPanel'
import { TermSheetPanel } from './TermSheetPanel'
import { EMPTY_VALUE, abbreviateUsd, formatPercent, riskBand } from '../../../../utils/format'
import {
  vocabDescription,
  vocabLabel,
  type EarnMarket,
  type EarnVocabulary,
} from '../../../../sdk/earn-helper'

interface Props {
  row: EarnMarket
  vocab: EarnVocabulary
  onClose: () => void
  /**
   * Render the history section inside the panel.
   *
   * False on desktop, where `HistoryPanel` charts the same series full-width
   * above the table — a rate series needs horizontal room, and two copies of it
   * on one screen would be one too many. True in the mobile sheet, which is the
   * only surface the band does not exist on.
   */
  showHistory?: boolean
}

const WINDOWS = [7, 30, 90] as const

const pct = (v?: number) => (v == null || !Number.isFinite(v) ? EMPTY_VALUE : formatPercent(v))

const RISK_TONE = { low: 'neutral', medium: 'warning', high: 'error', unknown: 'neutral' } as const

/**
 * The inspector for one selected row: identity, what it pays, the action, then
 * the evidence.
 *
 * It is a RAIL, not a card in the flow. Rendered inline it sat between the
 * filters and the table, so clicking a row pushed the table half a screen down
 * and moved the row out from under the cursor — the one interaction this tab is
 * built around was also the one that lost your place. As a sticky column the
 * selection lands in space that is already on screen and the listing never
 * moves.
 *
 * Order is by decision, not by data volume:
 *
 *  1. **who and what it pays** — the two facts that make the row worth opening;
 *  2. **anything disqualifying** — illiquid, gated, capped;
 *  3. **the action** — kept above the fold, because a panel you have to scroll
 *     to act in is a panel that reads as an information page;
 *  4. **the evidence** — history, on the mobile sheet only: on desktop the same
 *     series is charted full-width above the table by `HistoryPanel`, where it
 *     has the horizontal room a series actually needs;
 *  5. **the fine print** — terms and the raw decomposition, collapsed by
 *     default so the common path is short.
 */
export const DetailPanel: React.FC<Props> = ({ row, vocab, onClose, showHistory = false }) => {
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30)
  // Not requested at all where the band above the table is already charting it
  // — the same series twice is one HTTP request too many, not just one chart.
  const { points, hasSharePrice, isLoading, error } = useEarnHistory(
    showHistory ? row.earnUid : undefined,
    days
  )

  // `termSheet` is typed `unknown` on purpose — the sheet is owned by
  // `margin-fetcher/terms` and mirroring it here would create a second
  // definition that falls behind. Only the one field that decides whether the
  // section exists is read; `TermSheetPanel` reads the rest.
  const hasTerms = !!(row.termSheet as { supply?: unknown } | undefined)?.supply

  const venueNote =
    row.rate.marketOwn != null && Math.abs(row.rate.total - row.rate.marketOwn) >= 0.005
      ? row.rate.passthrough
        ? 'venue pays 0%'
        : `venue ${pct(row.rate.marketOwn)}`
      : null

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* ── Identity ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {/* Circular crop matches the table: token art mixes square and round
              sources, so the shape is ours to decide, not the provider's.
              `ring` keeps a light-on-light logo from dissolving into the card. */}
          <span className="shrink-0 overflow-hidden rounded-full ring-1 ring-base-300">
            <Logo
              src={row.logoURI}
              alt={row.venue}
              size={32}
              fallbackText={row.brand ?? row.venue}
              className="rounded-full"
            />
          </span>
          <div className="min-w-0">
            {/* Market first, brand second — same ordering as the table, so the
                header does not disagree with the row that opened it. */}
            <div className="truncate text-sm font-semibold leading-tight" title={row.name}>
              {row.name || row.brand || row.venue}
            </div>
            <div className="truncate text-[10px] text-base-content/50" title={row.venue}>
              {row.curator?.name ? `${row.curator.name} · ` : ''}
              {row.protocol?.name ?? (row.name && row.brand ? row.brand : '')}
              {row.protocol?.name ? ' · ' : ''}
              {vocabLabel(vocab, 'venueKind', row.venueKind)}
              {row.asset.symbol ? ` · ${row.asset.symbol}` : ''}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-xs shrink-0"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* ── Headline ─────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-2 rounded-box bg-base-200 px-3 py-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-base-content/50">
            Total APR
          </div>
          <div className="text-lg font-semibold tabular-nums leading-tight">
            {pct(row.rate.total)}
          </div>
          {/* The venue's own share, shown ONLY when it differs from the
              headline — i.e. when part of the yield is the asset's own. */}
          {venueNote && (
            <div
              className={`text-[10px] ${
                row.rate.passthrough ? 'text-warning' : 'text-base-content/50'
              }`}
              title={
                row.rate.passthrough
                  ? 'This venue pays nothing of its own — the headline is what the asset already earns in your wallet.'
                  : `Venue ${pct(row.rate.marketOwn)} · asset ${pct(row.rate.intrinsic)}`
              }
            >
              {venueNote}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {row.risk?.score != null && (
            <Badge
              tone={RISK_TONE[riskBand(row.risk.score)]}
              title={`Risk ${row.risk.score} — worst of chain, lender and collateral risk. Higher is worse.`}
            >
              risk {row.risk.score}
            </Badge>
          )}
          <Badge title={vocabDescription(vocab, 'exitMode', row.exit.mode)}>
            {vocabLabel(vocab, 'exitMode', row.exit.mode)}
            {row.exit.cooldownSecs ? ` ${Math.round(row.exit.cooldownSecs / 86400)}d` : ''}
          </Badge>
        </div>
      </div>

      {/* ── Anything disqualifying, before the action ─────────────────── */}
      {row.risk?.illiquid && (
        <div className="rounded-lg border border-error/30 bg-error/5 px-2 py-1.5 text-xs text-error">
          Reports a same-block exit but zero liquidity — you can enter this position and be unable
          to leave it.
        </div>
      )}

      {/* Loss of principal that already happened — the score cannot say this,
          so it gets its own banner ABOVE the deposit action. */}
      {row.risk?.lostAssets != null && (
        <div className="rounded-lg border border-error/30 bg-error/5 px-2 py-1.5 text-xs text-error">
          {row.risk.lostAssets.pct != null && row.risk.lostAssets.pct >= 0.999
            ? 'This vault reports assets it does not hold — its entire reported value is unbacked.'
            : `${formatPercent(row.risk.lostAssets.pct ?? 0, 1, true)} of this vault's reported value is not backed by any position.`}{' '}
          The share price does not fall when this happens, so the TVL and price above still look normal.
        </div>
      )}

      {row.risk?.badDebt != null &&
        row.risk.badDebt.material !== false &&
        (row.risk.badDebt.ratio ?? 0) > 0 && (
          <div className="rounded-lg border border-error/30 bg-error/5 px-2 py-1.5 text-xs text-error">
            {row.risk.badDebt.attributed
              ? "This vault's share of the markets it supplies carries bad debt: "
              : 'This market carries bad debt: '}
            {formatPercent(row.risk.badDebt.ratio ?? 0, 1, true)} of size
            {!row.risk.badDebt.nominal && row.risk.badDebt.usd != null
              ? ` (${abbreviateUsd(row.risk.badDebt.usd)})`
              : ''}
            .
            {row.risk.badDebt.nominal
              ? ' The dollar amount is withheld: this market sits at full utilization, so its' +
                ' interest compounds at the rate-model ceiling and the book value is accrued' +
                ' interest rather than deposits.'
              : ''}
          </div>
        )}

      {row.risk?.stale != null && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-2 py-1.5 text-xs text-warning">
          Last observed{' '}
          {row.risk.stale.ageDays != null ? `${Math.round(row.risk.stale.ageDays)} days ago` : 'a long time ago'} —
          the rate, TVL and liquidity above describe this vault as it was, not as it is.
        </div>
      )}

      {!row.availability.canDeposit && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-2 py-1.5 text-xs text-warning">
          {row.availability.reason ?? vocabLabel(vocab, 'gating', row.availability.gating)}
        </div>
      )}

      {/* ── The action ───────────────────────────────────────────────── */}
      <EarnActionPanel row={row} vocab={vocab} />

      {/* ── The evidence ─────────────────────────────────────────────── */}
      {showHistory && (
        <Section
          title="Performance"
          defaultOpen
          right={
            <div role="tablist" className="tabs tabs-boxed tabs-xs">
              {WINDOWS.map((w) => (
                <button
                  key={w}
                  type="button"
                  role="tab"
                  className={`tab ${days === w ? 'tab-active' : ''}`}
                  onClick={(e) => {
                    // The header toggles the section; the window buttons must not.
                    e.stopPropagation()
                    setDays(w)
                  }}
                >
                  {w}d
                </button>
              ))}
            </div>
          }
        >
          <HistoryChart
            points={points}
            hasSharePrice={hasSharePrice}
            isLoading={isLoading}
            error={error}
          />
        </Section>
      )}

      {/* ── The fine print ───────────────────────────────────────────── */}
      <Section title="Rate & exit">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <Field label="Total APR" value={pct(row.rate.total)} />
          <Field
            label="Venue APR"
            value={pct(row.rate.marketOwn)}
            warn={row.rate.passthrough}
            hint={
              row.rate.passthrough
                ? 'This venue pays nothing of its own — the headline is what the asset already earns in your wallet.'
                : 'What this venue pays for taking its risk.'
            }
          />
          {row.rate.intrinsic !== undefined && (
            <Field label="Asset yield" value={pct(row.rate.intrinsic)} />
          )}
          {row.rate.rewards !== undefined && (
            <Field label="Rewards" value={pct(row.rate.rewards)} />
          )}
          <Field label="Rate type" value={vocabLabel(vocab, 'rateKind', row.rate.kind)} />
          <Field label="Source" value={vocabLabel(vocab, 'rateSource', row.rate.source)} />
          {row.utilization !== undefined && (
            <Field label="Utilization" value={formatPercent(row.utilization, 1, true)} />
          )}
          {row.risk?.yieldProfile && <Field label="Profile" value={row.risk.yieldProfile} />}
          {row.risk?.score != null && (
            <Field
              label="Risk score"
              value={`${row.risk.score}${row.risk.label ? ` · ${row.risk.label}` : ''}`}
              warn={row.risk.score >= 4}
              hint="Worst of chain, lender and collateral risk. Higher is worse; the API lists <= 4 by default."
            />
          )}
          {row.risk?.vault?.score != null && (
            <Field
              label="Vault rating"
              value={`${row.risk.vault.score}${row.risk.vault.level ? ` · ${row.risk.vault.level}` : ''}`}
              warn={(row.risk.vault.score ?? 0) >= 4}
              hint="The vault's own rating — curator, the markets it holds, withdrawability and whether its reported value is real. Separate from the venue risk score above."
            />
          )}
          {row.risk?.badDebt != null && (row.risk.badDebt.ratio ?? 0) > 0 && (
            <Field
              label="Bad debt"
              // Never the dollars when the book is rate-pinned — see the banner.
              value={`${formatPercent(row.risk.badDebt.ratio ?? 0, 1, true)}${
                !row.risk.badDebt.nominal && row.risk.badDebt.usd != null
                  ? ` · ${abbreviateUsd(row.risk.badDebt.usd)}`
                  : ''
              }`}
              warn
              hint={
                row.risk.badDebt.nominal
                  ? 'Share of the market book that is bad debt. The dollar figure is accrued interest on a defaulted, fully-utilized market, not capital, so it is not shown.'
                  : 'Share of size that is bad debt, and the amount.'
              }
            />
          )}
          {row.risk?.lostAssets != null && (
            <Field
              label="Unbacked NAV"
              value={formatPercent(row.risk.lostAssets.pct ?? 0, 1, true)}
              warn
              hint="Reported value the vault cannot account for in any position. The share price does not drop when this happens."
            />
          )}
          <Field
            label="Exit"
            value={vocabLabel(vocab, 'exitMode', row.exit.mode)}
            hint={vocabDescription(vocab, 'exitMode', row.exit.mode)}
          />
          {row.exit.cooldownSecs ? (
            <Field label="Cooldown" value={`${Math.round(row.exit.cooldownSecs / 86400)} days`} />
          ) : null}
          {row.exit.feeBps != null ? (
            <Field label="Instant-exit fee" value={`${row.exit.feeBps} bps`} />
          ) : null}
        </div>
        <div className="mt-2 text-[10px] text-base-content/40">
          {vocabDescription(vocab, 'exitMode', row.exit.mode)}
        </div>
      </Section>

      {hasTerms && (
        <Section title="Terms">
          <TermSheetPanel termSheet={row.termSheet} />
        </Section>
      )}

      <code className="break-all text-[10px] text-base-content/40" title={row.earnUid}>
        {row.earnUid}
      </code>
    </div>
  )
}

/**
 * The rail's empty state.
 *
 * Rendered rather than collapsing the column: a rail that appears on the first
 * click reflows the table underneath it, which is precisely the jump this
 * layout exists to remove.
 */
export const DetailPlaceholder: React.FC<{ hasRows: boolean }> = ({ hasRows }) => (
  <EmptyState
    title={hasRows ? 'Select a row' : 'Nothing selected'}
    description={
      hasRows
        ? 'Pick a market or a position to see its history, terms and actions here.'
        : 'Adjust the filters to bring markets into view.'
    }
    className="px-3"
  />
)

/** Collapsible block. Header is the whole click target; `right` is not. */
function Section({
  title,
  children,
  defaultOpen = false,
  right,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  right?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-base-300 pt-2">
      <div className="flex items-center justify-between gap-2">
        {/* Full-width target with a real chevron: a `▸` glyph in a 10px
            uppercase label was too small to read as a control at all. */}
        <button
          type="button"
          className="-mx-1 flex flex-1 items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] font-semibold uppercase tracking-wide text-base-content/50 hover:bg-base-200 hover:text-base-content"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <Chevron open={open} className="h-3.5 w-3.5" />
          {title}
        </button>
        {open && right}
      </div>
      {open && <div className="mt-2">{children}</div>}
    </div>
  )
}

function Field({
  label,
  value,
  warn,
  hint,
}: {
  label: string
  value: string
  warn?: boolean
  hint?: string
}) {
  return (
    <div title={hint}>
      <div className="text-[10px] text-base-content/50">{label}</div>
      <div className={`tabular-nums font-medium ${warn ? 'text-warning' : ''}`}>{value}</div>
    </div>
  )
}
