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

/** Stable identity of a pair row, independent of page-position index. */
export const pairKey = (row: OptimizerPairRow) =>
  `${row.chainId}-${row.lenderKey}-${row.collateral.address}-${row.debt.address}`

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
      <div className="overflow-x-auto">
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
                    {fmtUsd(row.borrowLiquidityShort || row.totalLiquidityUsdShort)}
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
      {pagination && totalItems != null && (
        <TablePagination pagination={pagination} totalItems={totalItems} itemNoun="pairs" />
      )}
    </div>
  )
}
