import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { OptimizerPairRow } from '../../../../hooks/lending/useOptimizerPairs'
import type { LenderInfo } from '../../../../hooks/lending/useFlattenedPools'
import { abbreviateUsd } from '../../../../utils/format'
import { TableEmptyRow } from '../../../common/TableEmptyRow'
import { TablePagination } from '../../../common/TablePagination'
import { buildPath, OPTIMIZER_DEEPLINK_KEYS } from '../../../../utils/routes'
import { LenderBadge } from '../../shared/LenderBadge'
import { Logo } from '../../../common/Logo'

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
const fmtLev = (n: number | undefined) => (n == null || Number.isNaN(n) ? '–' : `${n.toFixed(2)}×`)
const fmtUsd = (n: number | undefined) => (n == null ? '–' : abbreviateUsd(n))
const fmtTok = (n: number | undefined, sym?: string) =>
  n == null
    ? '–'
    : `${n.toLocaleString(undefined, { maximumFractionDigits: 4 })}${sym ? ` ${sym}` : ''}`

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
        <span>{tok != null ? fmtTok(tok, sym) : fmtUsd(usd)}</span>
        {tok != null && usd != null && (
          <span className="text-[10px] text-base-content/50">{fmtUsd(usd)}</span>
        )}
      </div>
    </td>
  )
}

function AssetCell({ asset }: { asset: OptimizerPairRow['collateral'] }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Logo
        src={asset.logoURI}
        alt={asset.symbol ?? asset.address}
        fallbackText={asset.symbol ?? asset.address}
        className="w-5 h-5 rounded-full shrink-0"
      />
      <div className="min-w-0">
        <div className="font-medium text-sm truncate">
          {asset.symbol ?? asset.address.slice(0, 6)}
        </div>
        <div className="text-[10px] text-base-content/50 truncate">{asset.name}</div>
      </div>
    </div>
  )
}

/** Compact "collateral → debt" header used on the mobile card. */
function AssetPair({ row }: { row: OptimizerPairRow }) {
  const chip = (asset: OptimizerPairRow['collateral']) => (
    <span className="inline-flex items-center gap-1 min-w-0">
      <Logo
        src={asset.logoURI}
        alt={asset.symbol ?? asset.address}
        fallbackText={asset.symbol ?? asset.address}
        className="w-5 h-5 rounded-full shrink-0"
      />
      <span className="font-medium text-sm truncate">
        {asset.symbol ?? asset.address.slice(0, 6)}
      </span>
    </span>
  )
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {chip(row.collateral)}
      <span className="text-base-content/40 shrink-0">→</span>
      {chip(row.debt)}
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
  selected,
  onSelect,
  onDetails,
}: {
  row: OptimizerPairRow
  showMaxDebt?: boolean
  showMinCollateral?: boolean
  lenderInfoMap?: Record<string, LenderInfo>
  selected: boolean
  onSelect?: () => void
  onDetails: () => void
}) {
  const maxDebt =
    row.maxDebtAmount != null ? fmtTok(row.maxDebtAmount, row.debt.symbol) : fmtUsd(row.maxDebtAmountUsd)
  const minColl =
    row.minCollateralAmount != null
      ? fmtTok(row.minCollateralAmount, row.collateral.symbol)
      : fmtUsd(row.minCollateralAmountUsd)
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
          <div className={`font-semibold ${row.aprTotal < 0 ? 'text-error' : 'text-success'}`}>
            {fmtPct(row.aprTotal)}
          </div>
          <div className="text-[10px] text-base-content/50">
            <span className="text-success">{fmtPct(row.depositAprLong)}</span>
            {' / '}
            <span className="text-error">{fmtPct(row.borrowAprShort)}</span>
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <LenderBadge
          lenderKey={row.lenderKey}
          name={lenderInfoMap?.[row.lenderKey]?.name}
          logoURI={lenderInfoMap?.[row.lenderKey]?.logoURI}
        />
        {row.maturityDays != null && (
          <span
            className="text-[10px] text-warning shrink-0"
            title={`Fixed rate to maturity (~${Math.round(row.maturityDays)}d)`}
          >
            · fixed {Math.round(row.maturityDays)}d
          </span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <CardStat label="LTV / Lev" value={`${fmtPct(row.ltv)} · ${fmtLev(row.maxLeverage)}`} />
        <CardStat label="Util." value={fmtPct(row.utilizationShort)} />
        <CardStat
          label="Borrow liq."
          value={fmtUsd(row.borrowLiquidityUsdShort || row.totalLiquidityUsdShort)}
        />
        {showMaxDebt && <CardStat label="Max debt" value={maxDebt} />}
        {showMinCollateral && <CardStat label="Min collateral" value={minColl} />}
      </div>

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          className="btn btn-xs btn-ghost gap-1"
          title={`Open ${row.collateral.symbol ?? 'this pair'} / ${row.debt.symbol ?? ''} in the lender tab`}
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
    [OPTIMIZER_DEEPLINK_KEYS.collateral]: row.collateral.address,
    [OPTIMIZER_DEEPLINK_KEYS.debt]: row.debt.address,
    [OPTIMIZER_DEEPLINK_KEYS.config]: row.eModeConfigId,
    // The caller only passes `amount` when it's in token units.
    [OPTIMIZER_DEEPLINK_KEYS.amount]: amount,
  })

  // Single hand-off: open the pair in the full lender (Lending) tab.
  const goLender = (row: OptimizerPairRow) => {
    navigate(buildPath('lending', row.chainId, row.lenderKey, baseQuery(row)))
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
                    <AssetCell asset={row.collateral} />
                  </td>
                  <td>
                    <AssetCell asset={row.debt} />
                  </td>
                  <td>
                    <LenderBadge
                      lenderKey={row.lenderKey}
                      name={lenderInfoMap?.[row.lenderKey]?.name}
                      logoURI={lenderInfoMap?.[row.lenderKey]?.logoURI}
                    />
                  </td>
                  <td className="text-right">
                    <div className="flex flex-col items-end leading-tight">
                      <span
                        className={`font-semibold ${
                          row.aprTotal < 0 ? 'text-error' : 'text-success'
                        }`}
                      >
                        {fmtPct(row.aprTotal)}
                      </span>
                      <span className="text-[10px] text-base-content/50">
                        <span className="text-success">{fmtPct(row.depositAprLong)}</span>
                        {' / '}
                        <span className="text-error">{fmtPct(row.borrowAprShort)}</span>
                        {row.maturityDays != null && (
                          <span
                            className="ml-1 text-warning"
                            title={`Fixed rate to maturity (~${Math.round(row.maturityDays)}d)`}
                          >
                            · fixed {Math.round(row.maturityDays)}d
                          </span>
                        )}
                      </span>
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
                    {fmtUsd(row.borrowLiquidityUsdShort || row.totalLiquidityUsdShort)}
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
                      title={`Open ${row.collateral.symbol ?? 'this pair'} / ${row.debt.symbol ?? ''} in the lender tab`}
                      onClick={(e) => {
                        e.stopPropagation()
                        goLender(row)
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
                  selected={selectedKey === pk}
                  onSelect={onSelectPair ? () => onSelectPair(row) : undefined}
                  onDetails={() => goLender(row)}
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
