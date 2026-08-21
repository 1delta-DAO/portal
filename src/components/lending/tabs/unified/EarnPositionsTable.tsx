import React, { useState } from 'react'
import { Logo } from '../../../common/Logo'
import { ChainBadgedLogo } from '../../../common/ChainBadgedLogo'
import { Badge } from '../../../common/Badge'
import { Chevron } from '../../../common/Chevron'
import { TableEmptyRow } from '../../../common/TableEmptyRow'
import { abbreviateUsd, EMPTY_VALUE, formatPercent, formatLeverage } from '../../../../utils/format'
import type { RawCurrency } from '../../../../types/currency'
import {
  vocabLabel,
  vocabDescription,
  isVaultPosition,
  type EarnLendingPosition,
  type EarnPosition,
  type EarnPositionLeg,
  type EarnVaultPosition,
  type EarnVocabulary,
} from '../../../../sdk/earn-helper'

interface Props {
  /** Already paginated by the container — this component does not slice. */
  items: EarnPosition[]
  vocab: EarnVocabulary
  /**
   * Token lists per chain, used only as a FALLBACK icon source. The server
   * already puts `logoURI` on a lending leg; a vault's underlying has no such
   * field, and some lender metadata carries a null logo.
   */
  tokensByChain?: Record<string, Record<string, RawCurrency>>
  /** Called with a vault row's `earnUid`, or a lending leg's, to open it. */
  onSelectEarnUid?: (earnUid: string) => void
  /** The row currently open in the detail rail, so the table shows it. */
  selectedEarnUid?: string
}

const pct = (n?: number) => (n == null || !Number.isFinite(n) ? EMPTY_VALUE : formatPercent(n))

const usd = (n?: number) => (n == null || !Number.isFinite(n) ? EMPTY_VALUE : abbreviateUsd(n))

const tokenAmount = (v: string) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 })

/**
 * Health-factor badge.
 *
 * `null` renders as an em dash and NOT as a good number: a position with no
 * debt has no health factor, and neither does one whose lender did not report
 * it — printing `∞` for both makes an unread value look safe.
 */
const HealthBadge: React.FC<{ health: number | null }> = ({ health }) => {
  if (health == null) return <span className="text-xs text-base-content/40">{EMPTY_VALUE}</span>
  // DESIGN.md bands: < 1.1 error, 1.1–1.3 warning, >= 1.3 success.
  const tone = health < 1.1 ? 'error' : health < 1.3 ? 'warning' : 'success'
  return (
    <Badge tone={tone} title="Health factor">
      {health > 100 ? '>100' : health.toFixed(2)}
    </Badge>
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
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] leading-tight ${
        isDebt ? 'bg-error/15 text-error' : 'bg-base-content/10'
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
      <span className="font-mono tabular-nums">
        {amountUsd != null
          ? `${isDebt ? '−' : ''}${abbreviateUsd(Math.abs(amountUsd))}`
          : (fallbackAmount ?? '')}
      </span>
    </span>
  )
}

const shortAddr = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '??')

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
  if (held.length === 0) return <span className="text-xs text-base-content/40">{EMPTY_VALUE}</span>

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
 *
 * Totals, partial/stale qualifiers and pagination live in the container: they
 * describe the WHOLE portfolio, not the page, and the summary strip that
 * carries them stays on screen while the user is browsing opportunities.
 */
export const EarnPositionsTable: React.FC<Props> = ({
  items,
  vocab,
  tokensByChain,
  onSelectEarnUid,
  selectedEarnUid,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (uid: string) =>
    setExpanded((cur) => {
      const next = new Set(cur)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm w-full table-fixed [&_td]:overflow-hidden [&_th]:overflow-hidden [&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:border-b [&_th]:border-base-300 [&_th]:bg-base-100">
        <thead>
          <tr>
            <th className="w-[30%]">Venue</th>
            <th className="w-[14%] text-right">Net</th>
            <th className="w-[12%] text-right">APR</th>
            <th className="w-[10%]">Health</th>
            <th className="w-[34%]">Positions</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && <TableEmptyRow colSpan={5}>No open positions</TableEmptyRow>}
          {items.map((row) =>
            isVaultPosition(row) ? (
              <VaultRow
                key={row.positionUid}
                row={row}
                vocab={vocab}
                tokens={tokensByChain?.[row.chainId]}
                onSelectEarnUid={onSelectEarnUid}
                selected={!!selectedEarnUid && selectedEarnUid === row.earnUid}
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
  )
}

/** One vault share balance. Its single asset IS its Positions tile. */
const VaultRow: React.FC<{
  row: EarnVaultPosition
  vocab: EarnVocabulary
  tokens?: Record<string, RawCurrency>
  onSelectEarnUid?: (earnUid: string) => void
  selected?: boolean
}> = ({ row, vocab, tokens, onSelectEarnUid, selected }) => {
  const token = tokens?.[row.asset.address?.toLowerCase() ?? '']
  const symbol = row.asset.symbol ?? token?.symbol ?? shortAddr(row.asset.address)
  const unpriced = (row.asset.priceUsd ?? 0) === 0

  return (
    <tr
      className={`${onSelectEarnUid ? 'hover cursor-pointer' : ''} ${selected ? 'bg-primary/10' : ''}`}
      onClick={() => onSelectEarnUid?.(row.earnUid)}
    >
      <td>
        <div className="flex items-center gap-2">
          <ChainBadgedLogo
            src={row.logoURI}
            alt={row.venue}
            chainId={row.chainId}
            size={28}
            fallbackText={row.brand ?? row.venue}
            round={false}
          />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-xs font-medium" title={row.name}>
              {row.name || row.brand || row.venue}
            </div>
            <div className="truncate text-[10px] text-base-content/50">
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
      <td className="text-right text-xs font-medium tabular-nums">
        {/* An unpriced row shows its TOKEN balance rather than $0 — a vault we
            could not price is unknown, not empty. */}
        {unpriced ? (
          <span
            className="text-base-content/50"
            title="Underlying is not priced — showing the token balance"
          >
            {tokenAmount(row.assets)}
          </span>
        ) : (
          usd(row.netUsd)
        )}
      </td>
      <td className="text-right text-xs tabular-nums">{pct(row.apr)}</td>
      <td className="text-xs text-base-content/40">{EMPTY_VALUE}</td>
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
        <td>
          <div className="flex items-center gap-2">
            {/* Chain rides the venue logo: this table interleaves positions
                from every selected chain, and the same lender on two chains is
                two positions, not one. */}
            <ChainBadgedLogo
              src={row.logoURI}
              alt={row.venue}
              chainId={row.chainId}
              size={28}
              fallbackText={row.brand ?? row.lender}
              round={false}
            />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-xs font-medium" title={row.lender}>
                {row.name || row.brand || row.lender}
              </div>
              <div className="truncate text-[10px] text-base-content/50">
                {vocabLabel(vocab, 'venueKind', row.venueKind)}
                {row.leverage > 1.01 ? ` · ${formatLeverage(row.leverage)}` : ''}
                {/* A real chevron, not a `▾` glyph — this is the only thing on
                    the row that says it opens. */}
                {multi && (
                  <span className="ml-1 inline-flex items-center gap-0.5 align-middle text-base-content/70">
                    · {row.subAccounts.length} accounts
                    <Chevron open={expanded} className="h-3 w-3" />
                  </span>
                )}
                {row.incomplete ? ' · partial' : ''}
                {row.stale ? ' · stale' : ''}
              </div>
            </div>
          </div>
        </td>
        <td className="text-right text-xs font-medium tabular-nums">{usd(row.netUsd)}</td>
        <td
          className="text-right text-xs tabular-nums"
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
            <div className="text-[10px] font-normal text-base-content/50">
              {row.aprBreakdown.intrinsic > 0 ? '+' : ''}
              {formatPercent(row.aprBreakdown.intrinsic)} intrinsic
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
            <span className="text-[10px] text-base-content/50">
              {expanded ? 'see below' : 'expand'}
            </span>
          ) : (
            <LegTiles legs={row.legs} tokens={tokens} onSelect={onSelectEarnUid} />
          )}
        </td>
      </tr>

      {multi &&
        expanded &&
        row.subAccounts.map((sub) => (
          <tr key={`${row.positionUid}:${sub.accountId}`} className="bg-base-200/40">
            <td className="pl-8 text-[10px] text-base-content/70" title={sub.accountId}>
              {sub.accountId.length > 14
                ? `${sub.accountId.slice(0, 8)}…${sub.accountId.slice(-4)}`
                : sub.accountId}
            </td>
            <td className="text-right text-xs tabular-nums">{usd(sub.netUsd)}</td>
            <td className="text-right text-xs text-base-content/40">{EMPTY_VALUE}</td>
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
