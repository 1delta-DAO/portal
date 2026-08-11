import React, { useState } from 'react'
import { Logo } from '../../../common/Logo'
import { TableEmptyRow } from '../../../common/TableEmptyRow'
import { abbreviateUsd } from '../../../../utils/format'
import type { RawCurrency } from '../../../../types/currency'
import {
  vocabLabel,
  vocabDescription,
  isVaultPosition,
  type EarnLendingPosition,
  type EarnPosition,
  type EarnPositionLeg,
  type EarnPositionTotals,
  type EarnVaultPosition,
  type EarnVocabulary,
} from '../../../../sdk/earn-helper'

interface Props {
  items: EarnPosition[]
  totals: EarnPositionTotals
  vocab: EarnVocabulary
  /**
   * Token lists per chain, used only as a FALLBACK icon source. The server
   * already puts `logoURI` on a lending leg; a vault's underlying has no such
   * field, and some lender metadata carries a null logo.
   */
  tokensByChain?: Record<string, Record<string, RawCurrency>>
  /** Reads were incomplete — every total is a lower bound. */
  partial?: boolean
  /** Something came from a snapshot rather than a live read. */
  stale?: boolean
  /**
   * Chains that have not answered yet.
   *
   * Non-empty ⇒ `totals` covers only the chains present. Because positions are
   * fetched per chain, adding a chain leaves the rest on screen — which is the
   * point, but it means the header figure is momentarily NOT the user's net
   * worth, and a money view may not let that pass silently.
   */
  pendingChains?: string[]
  /** Called with a vault row's `earnUid`, or a lending leg's, to open it. */
  onSelectEarnUid?: (earnUid: string) => void
}

const pct = (n?: number) => (n == null || !Number.isFinite(n) ? '—' : `${n.toFixed(2)}%`)

const usd = (n?: number) => (n == null || !Number.isFinite(n) ? '—' : abbreviateUsd(n))

const tokenAmount = (v: string) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 })

/**
 * Health-factor badge.
 *
 * `null` renders as an em dash and NOT as a good number: a position with no
 * debt has no health factor, and neither does one whose lender did not report
 * it — printing `∞` for both makes an unread value look safe.
 */
const HealthBadge: React.FC<{ health: number | null }> = ({ health }) => {
  if (health == null) return <span className="text-xs opacity-40">—</span>
  const cls = health < 1.05 ? 'badge-error' : health < 1.3 ? 'badge-warning' : 'badge-ghost'
  return (
    <span className={`badge badge-xs ${cls}`} title="Health factor">
      {health > 100 ? '>100' : health.toFixed(2)}
    </span>
  )
}

/**
 * One holding: icon, symbol, and what it is worth.
 *
 * Debt is signed (`−$2.50`) and coloured, collateral is not. The sign is what
 * carries the meaning — colour alone needs a legend, and the previous version
 * of this cell had exactly that problem: a yellow chip next to grey ones with
 * nothing on screen saying which was which.
 */
const PositionTile: React.FC<{
  logoURI?: string
  symbol: string
  /** Signed USD. Negative ⇒ debt. */
  amountUsd?: number
  /** Shown when the asset is unpriced, so the tile is never blank. */
  fallbackAmount?: string
  title?: string
  onClick?: () => void
}> = ({ logoURI, symbol, amountUsd, fallbackAmount, title, onClick }) => {
  const isDebt = amountUsd != null && amountUsd < 0
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] leading-tight ${
        isDebt ? 'bg-error/10 text-error' : 'bg-base-300/60'
      } ${onClick ? 'cursor-pointer hover:brightness-125' : ''}`}
      title={title}
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation()
              onClick()
            }
          : undefined
      }
    >
      <Logo
        src={logoURI}
        alt={symbol}
        fallbackText={symbol}
        className="token-logo h-3.5 w-3.5 shrink-0 rounded-full object-contain"
      />
      <span className="font-medium">{symbol}</span>
      <span className="font-mono tabular-nums opacity-80">
        {amountUsd != null
          ? `${isDebt ? '−' : ''}${abbreviateUsd(Math.abs(amountUsd))}`
          : (fallbackAmount ?? '')}
      </span>
    </span>
  )
}

const shortAddr = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '??')

/**
 * Positions per page.
 *
 * Smaller than the markets table's 50: a portfolio is scanned, not searched,
 * and a lending row can expand into several sub-account rows, so a page of 50
 * is far taller here than 50 market rows.
 */
const PAGE_SIZE = 25

/**
 * The legs of a lending account, as tiles.
 *
 * Only legs the account actually HOLDS are rendered. Lenders report every
 * market the account is configured in — an Aave V4 account with one USDC debt
 * reports ten — and drawing all of them made a two-position account look like a
 * ten-position one. A leg on both sides emits two tiles, because a supply and a
 * debt in the same market are two facts, not one.
 */
const LegTiles: React.FC<{
  legs: EarnPositionLeg[]
  tokens?: Record<string, RawCurrency>
  onSelect?: (uid: string) => void
}> = ({ legs, tokens, onSelect }) => {
  const held = legs.filter((l) => l.side !== 'none')
  if (held.length === 0) return <span className="text-xs opacity-40">—</span>

  const tiles: React.ReactNode[] = []
  for (const leg of held) {
    const token = tokens?.[leg.asset.address?.toLowerCase() ?? '']
    const symbol = leg.asset.symbol ?? token?.symbol ?? shortAddr(leg.asset.address)
    const logoURI = leg.asset.logoURI ?? token?.logoURI
    const open = leg.earnUid && onSelect ? () => onSelect(leg.earnUid!) : undefined
    // A `loanId` leg is a slice the server excludes from the totals to avoid
    // double-counting the aggregate leg that already contains it — say so
    // rather than letting the numbers appear not to add up.
    const loanNote = leg.loanId ? ` · loan ${leg.loanId} (already counted in the aggregate)` : ''

    if (leg.side === 'supply' || leg.side === 'both') {
      tiles.push(
        <PositionTile
          key={`${leg.marketUid}-${leg.loanId ?? ''}-s`}
          logoURI={logoURI}
          symbol={symbol}
          amountUsd={leg.depositsUsd || undefined}
          fallbackAmount={tokenAmount(leg.deposits)}
          title={`Supplied ${tokenAmount(leg.deposits)} ${symbol}${
            leg.collateralEnabled ? ' · collateral' : ''
          }${loanNote} · ${leg.marketUid}`}
          onClick={open}
        />
      )
    }
    if (leg.side === 'borrow' || leg.side === 'both') {
      tiles.push(
        <PositionTile
          key={`${leg.marketUid}-${leg.loanId ?? ''}-d`}
          logoURI={logoURI}
          symbol={symbol}
          amountUsd={-(leg.debtUsd || 0)}
          fallbackAmount={tokenAmount(leg.debt)}
          title={`Borrowed ${tokenAmount(leg.debt)} ${symbol}${loanNote} · ${leg.marketUid}`}
          onClick={open}
        />
      )
    }
  }

  return <div className="flex flex-wrap gap-1">{tiles}</div>
}

/**
 * The account's supply-side portfolio, both halves of the stack in one table.
 *
 * The two halves are rendered at DIFFERENT granularities, on purpose:
 *
 *  - a **vault** balance is one row — it is a standalone position, and its one
 *    asset is its Positions tile;
 *  - a **lending** account is ONE row per (chain, lender) however many markets
 *    it touches, because a cross-margin account is a single solvency
 *    calculation. Its held markets are the tiles in the Positions cell, and
 *    only a lender that genuinely has several sub-accounts expands.
 *
 * There is no Asset column: a cross-margin account has no single asset, so the
 * column was an em dash on most of the table. There are no Supplied/Borrowed
 * columns either — those numbers are per-position, so they live on the tiles
 * where they say WHICH asset they refer to, and the row keeps only the Net that
 * is genuinely one figure per position.
 */
export const EarnPositionsTable: React.FC<Props> = ({
  items,
  totals,
  vocab,
  tokensByChain,
  partial,
  stale,
  pendingChains,
  onSelectEarnUid,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)

  const toggle = (uid: string) =>
    setExpanded((cur) => {
      const next = new Set(cur)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })

  // Pages count POSITIONS, not rendered rows — an expanded multi-account lender
  // adds `<tr>`s without becoming more than one position, and paging on
  // rendered rows would make the page size jump around as the user expands.
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  // CLAMPED, not stored back: the list refetches every 30s and can shrink under
  // the reader (an exit, a failed source). Holding a stale page index in state
  // would show an empty table on a portfolio that still has rows.
  const safePage = Math.min(page, totalPages - 1)
  const pageItems = items.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-3 text-xs">
        <span className="opacity-70">Net</span>
        <span className="text-sm font-semibold">{usd(totals.netUsd)}</span>
        {/* The header is a sum over the rows PRESENT. While a chain is still in
            flight that is not the user's net worth, and a figure that quietly
            grows as chains land is worse than one that says it is incomplete. */}
        {pendingChains && pendingChains.length > 0 && (
          <span
            className="inline-flex items-center gap-1 text-warning"
            title={`Still loading chain ${pendingChains.join(', ')} — these totals cover the chains that have answered.`}
          >
            <span className="loading loading-spinner loading-xs" />+{pendingChains.length} chain
            {pendingChains.length === 1 ? '' : 's'} loading
          </span>
        )}
        <span className="opacity-60">
          supplied {usd(totals.suppliedUsd)}
          {totals.borrowedUsd > 0 ? ` · borrowed ${usd(totals.borrowedUsd)}` : ''}
        </span>
        <span className="opacity-60">
          lending {usd(totals.lendingUsd)} · vaults {usd(totals.vaultUsd)}
        </span>
      </div>

      {/* An incomplete read is a LOWER BOUND, and saying so is the difference
          between a partial portfolio and a wrong one. */}
      {partial && (
        <div className="alert alert-warning py-2">
          <span className="text-xs">
            Some lender reads did not complete — positions shown are at least this much, and the
            totals, APR and health factors below them are not reliable.
          </span>
        </div>
      )}
      {stale && !partial && (
        <div className="alert py-2">
          <span className="text-xs">
            Some rows were served from the last complete snapshot rather than a live read —
            internally consistent, but not current.
          </span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Venue</th>
              <th className="text-right">Net</th>
              <th className="text-right">APR</th>
              <th>Health</th>
              <th>Positions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <TableEmptyRow colSpan={5}>No open positions</TableEmptyRow>}
            {pageItems.map((row) =>
              isVaultPosition(row) ? (
                <VaultRow
                  key={row.positionUid}
                  row={row}
                  vocab={vocab}
                  tokens={tokensByChain?.[row.chainId]}
                  onSelectEarnUid={onSelectEarnUid}
                />
              ) : (
                <LendingRows
                  key={row.positionUid}
                  row={row}
                  vocab={vocab}
                  tokens={tokensByChain?.[row.chainId]}
                  expanded={expanded.has(row.positionUid)}
                  onToggle={() => toggle(row.positionUid)}
                  onSelectEarnUid={onSelectEarnUid}
                />
              )
            )}
          </tbody>
        </table>
      </div>

      {items.length > 0 && (
        <div className="flex items-center justify-between text-xs opacity-70">
          <span>
            {items.length} position{items.length === 1 ? '' : 's'}
            {/* Say WHICH rows are on screen. Without it a paged portfolio and a
                short one look identical, and the totals above — which are
                always over the WHOLE portfolio, never the page — appear not to
                match the rows underneath them. */}
            {totalPages > 1 &&
              ` · showing ${safePage * PAGE_SIZE + 1}–${safePage * PAGE_SIZE + pageItems.length}`}
          </span>
          {totalPages > 1 && (
            <div className="join">
              <button
                type="button"
                className="btn join-item btn-xs"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                «
              </button>
              <span className="btn no-animation join-item btn-xs">
                {safePage + 1} / {totalPages}
              </span>
              <button
                type="button"
                className="btn join-item btn-xs"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                »
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** One vault share balance. Its single asset IS its Positions tile. */
const VaultRow: React.FC<{
  row: EarnVaultPosition
  vocab: EarnVocabulary
  tokens?: Record<string, RawCurrency>
  onSelectEarnUid?: (earnUid: string) => void
}> = ({ row, vocab, tokens, onSelectEarnUid }) => {
  const token = tokens?.[row.asset.address?.toLowerCase() ?? '']
  const symbol = row.asset.symbol ?? token?.symbol ?? shortAddr(row.asset.address)
  const unpriced = (row.asset.priceUsd ?? 0) === 0

  return (
    <tr
      className={onSelectEarnUid ? 'hover cursor-pointer' : ''}
      onClick={() => onSelectEarnUid?.(row.earnUid)}
    >
      <td className="max-w-[18rem]">
        <div className="flex items-center gap-2">
          <span className="shrink-0 overflow-hidden rounded-full">
            <Logo
              src={row.logoURI}
              alt={row.venue}
              size={26}
              fallbackText={row.brand ?? row.venue}
              className="rounded-full"
            />
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-xs font-medium" title={row.name}>
              {row.name || row.brand || row.venue}
            </div>
            <div className="truncate text-[10px] opacity-60">
              {row.brand && row.name ? `${row.brand} · ` : ''}
              {vocabLabel(vocab, 'venueKind', row.venueKind)}
              {row.exit ? ' · ' : ''}
              {row.exit && (
                <span title={vocabDescription(vocab, 'exitMode', row.exit.mode)}>
                  {vocabLabel(vocab, 'exitMode', row.exit.mode)}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="text-right text-xs font-medium">
        {/* An unpriced row shows its TOKEN balance rather than $0 — a vault we
            could not price is unknown, not empty. */}
        {unpriced ? (
          <span className="opacity-60" title="Underlying is not priced — showing the token balance">
            {tokenAmount(row.assets)}
          </span>
        ) : (
          usd(row.netUsd)
        )}
      </td>
      <td className="text-right text-xs">{pct(row.apr)}</td>
      <td className="text-xs opacity-40">—</td>
      <td>
        <PositionTile
          logoURI={row.asset.logoURI ?? token?.logoURI}
          symbol={symbol}
          amountUsd={unpriced ? undefined : row.suppliedUsd}
          fallbackAmount={tokenAmount(row.assets)}
          title={`${tokenAmount(row.assets)} ${symbol} · ${tokenAmount(row.shares)} shares`}
        />
      </td>
    </tr>
  )
}

/**
 * One lending account.
 *
 * Emits a SINGLE row when the account is cross-margin — the common case, and
 * the whole point: one lender, one solvency calculation, one line. A lender
 * with several genuine sub-accounts renders the same header row for the
 * aggregate and expands on click, so the summary stays comparable with the
 * vault rows beside it while the detail is still reachable.
 */
const LendingRows: React.FC<{
  row: EarnLendingPosition
  vocab: EarnVocabulary
  tokens?: Record<string, RawCurrency>
  expanded: boolean
  onToggle: () => void
  onSelectEarnUid?: (earnUid: string) => void
}> = ({ row, vocab, tokens, expanded, onToggle, onSelectEarnUid }) => {
  const multi = !row.crossMargin && row.subAccounts.length > 1

  return (
    <>
      <tr className={multi ? 'hover cursor-pointer' : ''} onClick={multi ? onToggle : undefined}>
        <td className="max-w-[18rem]">
          <div className="flex items-center gap-2">
            <span className="shrink-0 overflow-hidden rounded-full">
              <Logo
                src={row.logoURI}
                alt={row.venue}
                size={26}
                fallbackText={row.brand ?? row.lender}
                className="rounded-full"
              />
            </span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-xs font-medium" title={row.lender}>
                {row.name || row.brand || row.lender}
              </div>
              <div className="truncate text-[10px] opacity-60">
                {vocabLabel(vocab, 'venueKind', row.venueKind)}
                {row.leverage > 1.01 ? ` · ${row.leverage.toFixed(2)}x` : ''}
                {multi ? ` · ${row.subAccounts.length} accounts ${expanded ? '▾' : '▸'}` : ''}
                {row.incomplete ? ' · partial' : ''}
                {row.stale ? ' · stale' : ''}
              </div>
            </div>
          </div>
        </td>
        <td className="text-right text-xs font-medium">{usd(row.netUsd)}</td>
        <td
          className="text-right text-xs"
          title={
            `market ${pct(row.aprBreakdown.market)} ` +
            `· rewards ${pct(row.aprBreakdown.rewards)} ` +
            `· intrinsic ${pct(row.aprBreakdown.intrinsic)}\n` +
            `market legs: supply ${pct(row.depositApr)} · borrow ${pct(row.borrowApr)}`
          }
        >
          <div>{pct(row.apr)}</div>
          {/* The asset's OWN yield, called out when it is what carries the
              position. On a levered carry trade the market leg is deeply
              negative and this is the entire reason the trade exists — a bare
              headline hides which of the two is doing the work. */}
          {Math.abs(row.aprBreakdown.intrinsic) >= 0.005 && (
            <div className="text-[10px] font-normal opacity-60">
              {row.aprBreakdown.intrinsic > 0 ? '+' : ''}
              {row.aprBreakdown.intrinsic.toFixed(2)}% intrinsic
            </div>
          )}
        </td>
        <td>
          <HealthBadge health={row.health} />
        </td>
        <td>
          {/* For a multi-sub lender the header aggregates accounts that do NOT
              share a solvency calculation, so its tiles would imply a single
              position that is not one. Point at the rows instead. */}
          {multi ? (
            <span className="text-[10px] opacity-60">{expanded ? 'see below' : 'expand'}</span>
          ) : (
            <LegTiles legs={row.legs} tokens={tokens} onSelect={onSelectEarnUid} />
          )}
        </td>
      </tr>

      {multi &&
        expanded &&
        row.subAccounts.map((sub) => (
          <tr key={`${row.positionUid}:${sub.accountId}`} className="bg-base-200/40">
            <td className="pl-8 text-[10px] opacity-70" title={sub.accountId}>
              {sub.accountId.length > 14
                ? `${sub.accountId.slice(0, 8)}…${sub.accountId.slice(-4)}`
                : sub.accountId}
            </td>
            <td className="text-right text-xs">{usd(sub.netUsd)}</td>
            <td className="text-right text-xs opacity-40">—</td>
            <td>
              <HealthBadge health={sub.health} />
            </td>
            <td>
              <LegTiles legs={sub.legs} tokens={tokens} onSelect={onSelectEarnUid} />
            </td>
          </tr>
        ))}
    </>
  )
}
