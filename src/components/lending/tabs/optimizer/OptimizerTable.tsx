import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  riskLabelFromScore,
  type OptimizerAuction,
  type OptimizerPairRow,
} from '../../../../hooks/lending/useOptimizerPairs'
import type { LenderInfo } from '../../../../sdk/lending-helper/poolTypes'
import { TableEmptyRow } from '../../../common/TableEmptyRow'
import { TablePagination } from '../../../common/TablePagination'
import { buildPath, OPTIMIZER_DEEPLINK_KEYS } from '../../../../utils/routes'
import { LenderBadge } from '../../shared/LenderBadge'
import { AssetPopover } from '../../shared/AssetPopover'
import { UsdAmount } from '../../../common/UsdAmount'
import { Logo } from '../../../common/Logo'
import { getChainName } from '../../../../lib/lib-utils'
import { RiskBadge } from '../../shared/RiskBadge'
import { riskDotColor } from '../earn/helpers'

/** Small colored dot for an asset's own token risk. Rendered only when the
 *  backend actually scored the token (low/medium/high) — skipped for
 *  unknown/absent to avoid implying an assessment we don't have. */
function AssetRiskDot({ label }: { label?: string }) {
  if (!label || label === 'unknown') return null
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${riskDotColor(label)}`}
      title={`Token risk: ${label}`}
      aria-label={`Token risk: ${label}`}
    />
  )
}

/**
 * Pair-level risk, sitting with the lender it mostly describes.
 *
 * The dots on the Collateral / Debt cells only cover the two tokens; the
 * protocol (lender), chain and market-config dimensions have no other home in
 * this table, even though they're exactly what the `maxLenderRiskScore` /
 * `maxChainRiskScore` / `maxConfigRiskScore` filters act on — so a row filtered
 * out by them gave no visible reason. The label is the worst dimension (same
 * convention as the Earn/Lending tables); the popover breaks it down per
 * dimension. Skipped entirely when nothing on the pair is scored, rather than
 * rendering an "unknown" badge on every row.
 */
function PairRiskBadge({ row }: { row: OptimizerPairRow }) {
  if (row.riskScore <= 0 || row.riskBreakdown.length === 0) return null
  return (
    <RiskBadge label={riskLabelFromScore(row.riskScore)} breakdown={row.riskBreakdown} size="sm" />
  )
}

interface OptimizerPaginationState {
  page: number
  totalPages: number
  start: number
  end: number
  hasPrev: boolean
  hasNext: boolean
  next: () => void
  prev: () => void
}

interface Props {
  rows: OptimizerPairRow[]
  /** Show the "Max debt" column (a collateral amount was submitted). */
  showMaxDebt?: boolean
  /** Show the "Min collateral" column (a debt amount was submitted). */
  showMinCollateral?: boolean
  /**
   * Optional token-unit amount to hand off to the Lending/Loop panel via the
   * deep link. Collateral amount is preferred; only carried when it's in token
   * units (single-asset), never USD.
   */
  amount?: number
  /** Optional lender enumeration so we can show real names + logos in the badge. */
  lenderInfoMap?: Record<string, LenderInfo>
  /** Tag each row with its chain. Defaults on — this tab is multi-chain. */
  showChain?: boolean
  /** Server-side pagination state, shaped to match `<TablePagination>`'s expectations. */
  pagination?: OptimizerPaginationState
  /** Total row count from the API (not just the current page). */
  totalItems?: number
  /** Open the inline action panel (deposit-and-borrow / withdraw-and-repay / loop) for a row. */
  onSelectPair?: (row: OptimizerPairRow) => void
  /** Stable key of the currently-open pair, to highlight its row. */
  selectedKey?: string
}

/**
 * Stable identity of a pair row, independent of page-position index.
 *
 * Keyed on the collateral/debt *market* UIDs (not just the token addresses):
 * a single lender can expose several markets for the same asset pair (e.g.
 * multiple Euler V2 WETH/USDC vaults), which are identical on
 * chain+lender+collateral+debt but distinct markets. Without the UIDs they
 * share a key and selecting one highlights all of them. `eModeConfigId`
 * further disambiguates the same market under different e-modes. Falls back to
 * token addresses when a market UID is missing.
 */
export const pairKey = (row: OptimizerPairRow) =>
  `${row.chainId}-${row.lenderKey}-${row.marketLongUid ?? row.collateral.address}-${
    row.marketShortUid ?? row.debt.address
  }-${row.eModeConfigId ?? ''}`

const fmtPct = (n: number | undefined) =>
  n == null || Number.isNaN(n) ? '–' : `${(n * 100).toFixed(2)}%`
/** Signed delta (e.g. the reward uplift over base). Never renders "+-x%". */
const fmtDeltaPct = (n: number | undefined) =>
  n == null || Number.isNaN(n) ? '–' : `${n < 0 ? '−' : '+'}${(Math.abs(n) * 100).toFixed(2)}%`
const fmtLev = (n: number | undefined) => (n == null || Number.isNaN(n) ? '–' : `${n.toFixed(2)}×`)
const fmtTok = (n: number | undefined, sym?: string) =>
  n == null
    ? '–'
    : `${n.toLocaleString(undefined, { maximumFractionDigits: 4 })}${sym ? ` ${sym}` : ''}`

/** Rewards are folded into the legs by the backend: `depositAprLong` already
 *  INCLUDES `rewardAprLong`, and `borrowAprShort` is already NET of
 *  `rewardAprShort`. So the leg line is reward-inclusive at 1×, while
 *  `aprTotal − aprBase` is that same reward amplified by the loop — the
 *  collateral leg maxLev×, the debt leg (maxLev−1)×. Rendering the two next to
 *  each other without saying so is what makes a 2.36% incentive read as "+57% rwd".
 */
function rewardSplit(row: OptimizerPairRow) {
  const lev = row.maxLeverage
  const dep = row.rewardAprLong || 0
  const brw = row.rewardAprShort || 0
  return {
    dep,
    brw,
    levDep: lev > 0 ? lev * dep : dep,
    levBrw: lev > 1 ? (lev - 1) * brw : 0,
    lev,
  }
}

const hasRwd = (n: number) => Math.abs(n) > 0.0002

/** Per-leg rates for ONE unit of collateral — never leveraged. */
function LegRates({ row }: { row: OptimizerPairRow }) {
  // A negative borrow rate means the incentive exceeds the interest: the debt
  // leg pays you. Colouring that red reads as a cost.
  const rebate = row.borrowAprShort < 0
  const organicBorrow = row.borrowAprShort + row.rewardAprShort
  return (
    <>
      <span
        className="text-success"
        title={
          hasRwd(row.rewardAprLong)
            ? `Deposit APR at 1×, rewards included: ${fmtPct(
                row.depositAprLong - row.rewardAprLong
              )} organic + ${fmtPct(row.rewardAprLong)} rewards`
            : 'Deposit APR at 1× (no leverage applied)'
        }
      >
        {fmtPct(row.depositAprLong)}
      </span>
      {' / '}
      <span
        className={rebate ? 'text-success' : 'text-error'}
        title={
          hasRwd(row.rewardAprShort)
            ? `Borrow APR at 1×, already net of rewards: ${fmtPct(
                organicBorrow
              )} interest − ${fmtPct(row.rewardAprShort)} rewards${
                rebate ? ' — negative, so the debt leg currently pays you' : ''
              }`
            : 'Borrow APR at 1× (no leverage applied)'
        }
      >
        {fmtPct(row.borrowAprShort)}
      </span>
    </>
  )
}

/** The "rwd in legs" + "base … · rwd @ lev" sublines. Rendered as block-level
 *  divs so this drops into both the flex-col table cell and the card's
 *  text-right stack. */
function RewardLines({ row }: { row: OptimizerPairRow }) {
  const { dep, brw, levDep, levBrw, lev } = rewardSplit(row)
  const uplift = row.aprTotal - row.aprBase
  const showUplift = Math.abs(uplift) > 0.0002
  const showLegs = hasRwd(dep) || hasRwd(brw)
  if (!showUplift && !showLegs) return null
  return (
    <>
      {showLegs && (
        <div
          className="text-[10px] text-warning/80"
          title="Reward incentives already contained in the 1× leg rates above — the deposit reward is added to the deposit APR, the borrow reward is subtracted from the borrow APR."
        >
          rwd in legs:{' '}
          {[
            hasRwd(dep) ? `${fmtDeltaPct(dep)} dep` : null,
            // Borrow rewards reduce the borrow cost, so they read as negative
            // here — same convention as the lending/earn tables.
            hasRwd(brw) ? `${fmtDeltaPct(-brw)} brw` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      )}
      {showUplift && (
        <div
          className="text-[10px] text-base-content/50"
          title={
            showLegs
              ? `Net APR excluding rewards — the sustainable rate; incentives are typically transient. The ${fmtDeltaPct(
                  uplift
                )} uplift is the leg rewards amplified by the loop: ${fmtLev(lev)} · ${fmtDeltaPct(
                  dep
                )} deposit = ${fmtDeltaPct(levDep)}${
                  hasRwd(brw)
                    ? `, ${fmtLev(Math.max(lev - 1, 0))} · ${fmtPct(brw)} borrow = ${fmtDeltaPct(
                        levBrw
                      )}`
                    : ''
                }.`
              : 'Net APR excluding rewards — the sustainable rate. Reward incentives are typically transient.'
          }
        >
          base{' '}
          <span className={row.aprBase < 0 ? 'text-error' : 'text-success'}>
            {fmtPct(row.aprBase)}
          </span>
          <span className="text-warning">
            {' '}
            · {fmtDeltaPct(uplift)} rwd
            {lev > 1 ? ` @ ${fmtLev(lev)}` : ''}
          </span>
        </div>
      )}
    </>
  )
}

const ExternalLinkIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="w-3 h-3 shrink-0 opacity-70"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
)

/** Right-aligned token amount (+ USD subline) for the Max-debt / Min-collateral columns. */
function AmountCell({ tok, usd, sym }: { tok?: number; usd?: number; sym?: string }) {
  if (tok == null && usd == null) return <td className="text-right">–</td>
  return (
    <td className="text-right">
      <div className="flex flex-col items-end leading-tight">
        <span>
          {tok != null ? fmtTok(tok, sym) : usd != null ? <UsdAmount value={usd} /> : '–'}
        </span>
        {tok != null && usd != null && (
          <span className="mt-0.5">
            <UsdAmount value={usd} />
          </span>
        )}
      </div>
    </td>
  )
}

/** Days-to-maturity label. Sub-day terms render "<1d", never a bare "0d". */
const fmtMaturityDays = (d: number) => (d < 1 ? '<1d' : `${Math.round(d)}d`)

/**
 * True when the row's headline Net APR is not obtainable right now.
 *
 * An auction-cleared market between rounds has no borrow rate at all, so the
 * backend's leveraged net is computed against a 0% borrow cost and comes out
 * enormous (a 10x-levered collateral yield with a free debt leg). The number is
 * arithmetically consistent and completely unactionable, and it sorts to the
 * top of the table — so it has to read as indicative, not as an offer.
 */
const aprIsIndicative = (row: OptimizerPairRow) => row.auction != null && !row.auction.canBorrow

const INDICATIVE_APR_TITLE =
  'Indicative only — this market originates loans through periodic sealed-bid auctions ' +
  'and none is open, so there is no borrow rate to pay right now. The figure assumes a ' +
  '0% debt leg and is not obtainable until the next auction clears.'

/** "3d 4h" / "5h 20m" / "12m" — coarse, because these windows run for days. */
function fmtCountdown(secs: number): string {
  if (secs <= 0) return '0m'
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}

/**
 * Origination window for auction-cleared fixed-term markets (Term Finance).
 *
 * These markets don't borrow continuously — bids go into a periodic sealed-bid
 * round, and between rounds nothing can be borrowed at all. That state is
 * indistinguishable from "no offers right now" unless we say so, which is why
 * a closed row previously looked like an ordinary market whose Deposit & Borrow
 * simply did nothing. Rendered only for markets that HAVE a window (`auction`
 * is undefined on every other lender).
 */
function AuctionTag({ auction }: { auction?: OptimizerAuction }) {
  if (!auction) return null
  const now = Math.floor(Date.now() / 1000)
  if (auction.status === 'open') {
    const left = auction.revealTime != null ? auction.revealTime - now : null
    return (
      <span
        className="text-[10px] text-success shrink-0"
        title={
          `Auction open — sealed bids accepted until ` +
          (auction.revealTime != null
            ? new Date(auction.revealTime * 1000).toLocaleString()
            : 'the reveal') +
          `. Borrowing this market is only possible inside this window.`
        }
      >
        · auction open{left != null && left > 0 ? ` · ${fmtCountdown(left)} left` : ''}
      </span>
    )
  }
  if (auction.status === 'upcoming') {
    const until = auction.startTime != null ? auction.startTime - now : null
    return (
      <span
        className="text-[10px] text-info shrink-0"
        title="An auction round is scheduled but not yet accepting bids."
      >
        · auction in {until != null ? fmtCountdown(until) : 'soon'}
      </span>
    )
  }
  if (auction.status === 'revealing') {
    return (
      <span
        className="text-[10px] text-warning shrink-0"
        title="Bidding has closed for this round; sealed prices are being revealed and the auction is clearing. No new submissions are accepted."
      >
        · auction clearing
      </span>
    )
  }
  return (
    <span
      className="text-[10px] text-base-content/40 shrink-0"
      title="No auction round is currently listed for this market. Borrowing opens again when the next round is scheduled — lending against existing repo tokens may still be possible."
    >
      · auction closed
    </span>
  )
}

const CHAIN_LOGO_BASE = 'https://raw.githubusercontent.com/1delta-DAO/chains/main'

/**
 * Which chain a pair lives on. Rows can come from any selected chain, and the
 * pair is only actionable on its own — so the chain is part of the row's
 * identity, not decoration. Always rendered on this (multi-chain) tab, even for
 * a one-chain selection: the selection is a filter, not context the row carries,
 * and a deep-linked or shared row otherwise reads as chain-less.
 */
function ChainTag({ chainId, show = true }: { chainId: string; show?: boolean }) {
  if (!show) return null
  return (
    <span
      className="inline-flex items-center gap-1 min-w-0 text-[10px] text-base-content/50"
      title={getChainName(chainId)}
    >
      <Logo
        src={`${CHAIN_LOGO_BASE}/${chainId}.webp`}
        alt={getChainName(chainId)}
        fallbackText={getChainName(chainId)}
        className="w-3 h-3 rounded-full shrink-0"
      />
      <span className="truncate">{getChainName(chainId)}</span>
    </span>
  )
}

/**
 * Asset cell. Clicking the *logo* opens a detail popover (address / price /
 * chain + market IRM); clicking the symbol/name falls through to the row's
 * open-panel handler — so row selection stays the primary, obvious action and
 * the popover is a small deliberate affordance on the icon. `marketUid` + the
 * side's rate light up the "Mkt ID" and IRM rows.
 */
function AssetCell({
  asset,
  marketUid,
  depositRate,
  borrowRate,
}: {
  asset: OptimizerPairRow['collateral']
  marketUid?: string
  /** Deposit rate for this market, in PERCENT (collateral side only). */
  depositRate?: number
  /** Borrow rate for this market, in PERCENT (debt side only). */
  borrowRate?: number
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {/* Logo-only popover trigger; stopPropagation so it doesn't also select
          the row. The label beside it stays a row-select target. */}
      <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <AssetPopover
          address={asset.address}
          name={asset.name ?? asset.symbol ?? ''}
          symbol={asset.symbol ?? ''}
          logoURI={asset.logoURI}
          chainId={asset.chainId}
          priceUsd={asset.priceUsd}
          marketUid={marketUid}
          marketName={asset.symbol}
          currentDepositRate={depositRate}
          currentBorrowRate={borrowRate}
        />
      </span>
      <div className="min-w-0">
        <div className="font-medium text-sm flex items-center gap-1.5">
          <span className="truncate">{asset.symbol ?? asset.address.slice(0, 6)}</span>
          <AssetRiskDot label={asset.riskLabel} />
        </div>
        <div className="text-[10px] text-base-content/50 truncate">{asset.name}</div>
      </div>
    </div>
  )
}

/** Compact "collateral → debt" header used on the mobile card. Tapping a side's
 *  logo opens the same asset detail popover as the desktop table; the symbol
 *  next to it stays a card-select target (opens the action panel). */
function AssetPair({ row }: { row: OptimizerPairRow }) {
  const chip = (
    asset: OptimizerPairRow['collateral'],
    marketUid?: string,
    depositRate?: number,
    borrowRate?: number
  ) => (
    <span className="inline-flex items-center gap-1 min-w-0">
      <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <AssetPopover
          address={asset.address}
          name={asset.name ?? asset.symbol ?? ''}
          symbol={asset.symbol ?? ''}
          logoURI={asset.logoURI}
          chainId={asset.chainId}
          priceUsd={asset.priceUsd}
          marketUid={marketUid}
          marketName={asset.symbol}
          currentDepositRate={depositRate}
          currentBorrowRate={borrowRate}
        />
      </span>
      <span className="font-medium text-sm truncate flex items-center gap-1">
        {asset.symbol ?? asset.address.slice(0, 6)}
        <AssetRiskDot label={asset.riskLabel} />
      </span>
    </span>
  )
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {chip(row.collateral, row.marketLongUid, row.depositAprEffective * 100)}
      <span className="text-base-content/40 shrink-0">→</span>
      {chip(row.debt, row.marketShortUid, undefined, row.borrowAprEffective * 100)}
    </div>
  )
}

/** Labelled stat used inside the mobile card's grid. */
function CardStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-base-content/40">{label}</div>
      <div className="truncate">{value}</div>
    </div>
  )
}

/**
 * Mobile card for a single pair row. Mirrors the desktop table row (same
 * click-to-open-panel and "Details" deep link) but stacks the columns so the
 * data stays readable without a horizontally-scrolling table.
 */
function PairCard({
  row,
  showMaxDebt,
  showMinCollateral,
  lenderInfoMap,
  showChain,
  selected,
  onSelect,
  onDetails,
}: {
  row: OptimizerPairRow
  showMaxDebt?: boolean
  showMinCollateral?: boolean
  lenderInfoMap?: Record<string, LenderInfo>
  showChain?: boolean
  selected: boolean
  onSelect?: () => void
  onDetails: () => void
}) {
  const maxDebt: ReactNode =
    row.maxDebtAmount != null ? (
      fmtTok(row.maxDebtAmount, row.debt.symbol)
    ) : row.maxDebtAmountUsd != null ? (
      <UsdAmount value={row.maxDebtAmountUsd} />
    ) : (
      '–'
    )
  const minColl: ReactNode =
    row.minCollateralAmount != null ? (
      fmtTok(row.minCollateralAmount, row.collateral.symbol)
    ) : row.minCollateralAmountUsd != null ? (
      <UsdAmount value={row.minCollateralAmountUsd} />
    ) : (
      '–'
    )
  return (
    <li
      className={`p-3 ${onSelect ? 'cursor-pointer active:bg-base-200' : ''} ${
        selected ? 'bg-primary/10' : ''
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <AssetPair row={row} />
        <div className="text-right shrink-0 leading-tight">
          <div
            className={`font-semibold ${
              aprIsIndicative(row)
                ? 'text-base-content/40 italic'
                : row.aprTotal < 0
                  ? 'text-error'
                  : 'text-success'
            }`}
            title={aprIsIndicative(row) ? INDICATIVE_APR_TITLE : undefined}
          >
            {fmtPct(row.aprTotal)}
            {aprIsIndicative(row) ? '*' : ''}
          </div>
          <div className="text-[10px] text-base-content/50">
            <LegRates row={row} />
            {row.originationFeeShort ? (
              <span
                className="ml-1 text-warning"
                title="This borrow cost is a one-time origination / mint fee paid UPFRONT when you open the position — not an ongoing rate. Shown amortized over 1 year (Net APR uses the same)."
              >
                · {fmtPct(row.originationFeeShort)} upfront fee
              </span>
            ) : null}
          </div>
          <RewardLines row={row} />
          {row.netAprAtAmount != null && (
            <div
              className="text-[10px] text-info"
              title="Net APR at your entered amount (incl. rewards)"
            >
              @ size {fmtPct(row.netAprAtAmount)}
              {row.netAprAtAmountBase != null &&
                Math.abs(row.netAprAtAmountBase - row.netAprAtAmount) > 0.0002 && (
                  <span className="text-base-content/50">
                    {' '}
                    · base {fmtPct(row.netAprAtAmountBase)}
                  </span>
                )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <LenderBadge
            lenderKey={row.lenderKey}
            name={lenderInfoMap?.[row.lenderKey]?.name}
            logoURI={lenderInfoMap?.[row.lenderKey]?.logoURI}
            bare
          />
          <ChainTag chainId={row.chainId} show={showChain} />
          <AuctionTag auction={row.auction} />
          <PairRiskBadge row={row} />
        </span>
        {row.maturityDays != null && (
          <span
            className="text-[10px] text-warning shrink-0"
            title={`Fixed rate to maturity (~${fmtMaturityDays(row.maturityDays)})`}
          >
            · fixed {fmtMaturityDays(row.maturityDays)}
          </span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <CardStat label="LTV / Lev" value={`${fmtPct(row.ltv)} · ${fmtLev(row.maxLeverage)}`} />
        <CardStat label="Util." value={fmtPct(row.utilizationShort)} />
        <CardStat
          label="Borrow liq."
          value={<UsdAmount value={row.borrowLiquidityUsdShort || row.totalLiquidityUsdShort} />}
        />
        {showMaxDebt && <CardStat label="Max debt" value={maxDebt} />}
        {showMinCollateral && <CardStat label="Min collateral" value={minColl} />}
      </div>

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          className="btn btn-xs btn-ghost gap-1"
          title={`Open ${row.collateral.symbol ?? 'this pair'} / ${row.debt.symbol ?? ''} in the Loop tab`}
          onClick={(e) => {
            e.stopPropagation()
            onDetails()
          }}
        >
          Details
          <ExternalLinkIcon />
        </button>
      </div>
    </li>
  )
}

export function OptimizerTable({
  rows,
  showMaxDebt,
  showMinCollateral,
  amount,
  lenderInfoMap,
  showChain,
  pagination,
  totalItems,
  onSelectPair,
  selectedKey,
}: Props) {
  const navigate = useNavigate()
  // Base columns (Collateral, Debt, Lender, Net APR, LTV/Lev, Util., Borrow
  // liq., Details) = 8, plus whichever amount columns are active.
  const colSpan = 8 + (showMaxDebt ? 1 : 0) + (showMinCollateral ? 1 : 0)

  const baseQuery = (row: OptimizerPairRow) => ({
    // Market UIDs first — they name exactly one market each, which token
    // addresses cannot do on vault lenders (Euler: many vaults per underlying).
    // The addresses ride along as the fallback for rows without UIDs.
    [OPTIMIZER_DEEPLINK_KEYS.colMarket]: row.marketLongUid,
    [OPTIMIZER_DEEPLINK_KEYS.debtMarket]: row.marketShortUid,
    [OPTIMIZER_DEEPLINK_KEYS.collateral]: row.collateral.address,
    [OPTIMIZER_DEEPLINK_KEYS.debt]: row.debt.address,
    // The config the row's LTV and leverage were computed against — without it
    // the receiving tab falls back to its own default and shows different
    // numbers than the row the user clicked.
    [OPTIMIZER_DEEPLINK_KEYS.config]: row.eModeConfigId,
    // The caller only passes `amount` when it's in token units.
    [OPTIMIZER_DEEPLINK_KEYS.amount]: amount,
  })

  // Single hand-off: open the pair in the Loop tab. The optimizer ranks pairs
  // by the return on a LEVERAGED position — a row only means anything as a
  // loop, so the destination is the loop builder, not the per-market lending
  // view. (Earn is the tab that hands off into Lending, where a single asset is
  // the whole subject.)
  const goLoop = (row: OptimizerPairRow) => {
    navigate(
      buildPath('trading', row.chainId, row.lenderKey, {
        ...baseQuery(row),
        [OPTIMIZER_DEEPLINK_KEYS.action]: 'loop',
      })
    )
  }

  return (
    <div className="rounded-box border border-base-300 overflow-hidden">
      {/* Desktop / tablet: full table. Hidden on mobile, where a wide,
          horizontally-scrolling table traps vertical page scroll (an
          `overflow-x-auto` box becomes a two-axis scroll container). */}
      <div className="hidden md:block overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Collateral</th>
              <th>Debt</th>
              <th>Lender</th>
              <th className="text-right">Net APR</th>
              <th className="text-right">LTV / Lev</th>
              <th className="text-right">Util.</th>
              <th className="text-right">Borrow liq.</th>
              {showMaxDebt && <th className="text-right">Max debt</th>}
              {showMinCollateral && <th className="text-right">Min collateral</th>}
              <th className="text-right">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <TableEmptyRow colSpan={colSpan}>No pairs</TableEmptyRow>}
            {rows.map((row, i) => {
              const pk = pairKey(row)
              const key = `${pk}-${i}`
              return (
                <tr
                  key={key}
                  className={`hover ${onSelectPair ? 'cursor-pointer' : ''} ${
                    selectedKey === pk ? 'bg-primary/10' : ''
                  }`}
                  onClick={onSelectPair ? () => onSelectPair(row) : undefined}
                >
                  <td>
                    <AssetCell
                      asset={row.collateral}
                      marketUid={row.marketLongUid}
                      depositRate={row.depositAprEffective * 100}
                    />
                  </td>
                  <td>
                    <AssetCell
                      asset={row.debt}
                      marketUid={row.marketShortUid}
                      borrowRate={row.borrowAprEffective * 100}
                    />
                  </td>
                  <td>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <LenderBadge
                        lenderKey={row.lenderKey}
                        name={lenderInfoMap?.[row.lenderKey]?.name}
                        logoURI={lenderInfoMap?.[row.lenderKey]?.logoURI}
                        bare
                      />
                      <span className="flex items-center gap-1 min-w-0">
                        <ChainTag chainId={row.chainId} show={showChain} />
                        <AuctionTag auction={row.auction} />
                      </span>
                      <PairRiskBadge row={row} />
                    </div>
                  </td>
                  <td className="text-right">
                    <div className="flex flex-col items-end leading-tight">
                      <span
                        className={`font-semibold ${
                          aprIsIndicative(row)
                            ? 'text-base-content/40 italic'
                            : row.aprTotal < 0
                              ? 'text-error'
                              : 'text-success'
                        }`}
                        title={aprIsIndicative(row) ? INDICATIVE_APR_TITLE : undefined}
                      >
                        {fmtPct(row.aprTotal)}
                        {aprIsIndicative(row) ? '*' : ''}
                      </span>
                      <span className="text-[10px] text-base-content/50">
                        <LegRates row={row} />
                        {row.maturityDays != null && (
                          <span
                            className="ml-1 text-warning"
                            title={`Fixed rate to maturity (~${fmtMaturityDays(row.maturityDays)})`}
                          >
                            · fixed {fmtMaturityDays(row.maturityDays)}
                          </span>
                        )}
                        {row.originationFeeShort ? (
                          <span
                            className="ml-1 text-warning"
                            title="This borrow cost is a one-time origination / mint fee paid UPFRONT when you open the position — not an ongoing rate. Shown amortized over 1 year (Net APR uses the same)."
                          >
                            · {fmtPct(row.originationFeeShort)} upfront fee
                          </span>
                        ) : null}
                      </span>
                      <RewardLines row={row} />
                      {row.netAprAtAmount != null && (
                        <span
                          className="text-[10px] text-info"
                          title="Net APR at your entered amount — the rate curves re-priced at the position size (incl. rewards)"
                        >
                          @ size {fmtPct(row.netAprAtAmount)}
                          {row.netAprAtAmountBase != null &&
                            Math.abs(row.netAprAtAmountBase - row.netAprAtAmount) > 0.0002 && (
                              <span className="text-base-content/50">
                                {' · base '}
                                {fmtPct(row.netAprAtAmountBase)}
                              </span>
                            )}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="text-right">
                    <div className="flex flex-col items-end leading-tight">
                      <span>{fmtPct(row.ltv)}</span>
                      <span className="text-[10px] text-base-content/50">
                        {fmtLev(row.maxLeverage)}
                      </span>
                    </div>
                  </td>
                  <td className="text-right">{fmtPct(row.utilizationShort)}</td>
                  <td className="text-right">
                    <UsdAmount value={row.borrowLiquidityUsdShort || row.totalLiquidityUsdShort} />
                  </td>
                  {showMaxDebt && (
                    <AmountCell
                      tok={row.maxDebtAmount}
                      usd={row.maxDebtAmountUsd}
                      sym={row.debt.symbol}
                    />
                  )}
                  {showMinCollateral && (
                    <AmountCell
                      tok={row.minCollateralAmount}
                      usd={row.minCollateralAmountUsd}
                      sym={row.collateral.symbol}
                    />
                  )}
                  <td className="text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="btn btn-xs btn-ghost gap-1"
                      title={`Open ${row.collateral.symbol ?? 'this pair'} / ${row.debt.symbol ?? ''} in the Loop tab`}
                      onClick={(e) => {
                        e.stopPropagation()
                        goLoop(row)
                      }}
                    >
                      Details
                      <ExternalLinkIcon />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards instead of the table. */}
      <div className="md:hidden">
        {rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-base-content/50">No pairs</div>
        ) : (
          <ul className="divide-y divide-base-300">
            {rows.map((row, i) => {
              const pk = pairKey(row)
              return (
                <PairCard
                  key={`${pk}-${i}`}
                  row={row}
                  showMaxDebt={showMaxDebt}
                  showMinCollateral={showMinCollateral}
                  lenderInfoMap={lenderInfoMap}
                  showChain={showChain}
                  selected={selectedKey === pk}
                  onSelect={onSelectPair ? () => onSelectPair(row) : undefined}
                  onDetails={() => goLoop(row)}
                />
              )
            })}
          </ul>
        )}
      </div>

      {pagination && totalItems != null && (
        <TablePagination pagination={pagination} totalItems={totalItems} itemNoun="pairs" />
      )}
    </div>
  )
}
