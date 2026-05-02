import { useNavigate } from 'react-router-dom'
import type { OptimizerDirection, OptimizerPairRow } from '../../../../hooks/lending/useOptimizerPairs'
import type { LenderInfo } from '../../../../hooks/lending/useFlattenedPools'
import { abbreviateUsd } from '../../../../utils/format'
import { TableEmptyRow } from '../../../common/TableEmptyRow'
import { TablePagination } from '../../../common/TablePagination'
import {
  buildPath,
  OPTIMIZER_DEEPLINK_KEYS,
  type LendingDeepLinkAction,
} from '../../../../utils/routes'
import { LenderBadge } from '../../shared/LenderBadge'

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
  direction: OptimizerDirection
  hasAmount: boolean
  /** Optional amount the user typed in the optimizer — propagated to the action panel. */
  amount?: number
  /**
   * True when the user's amount input was interpreted as USD (multi-asset
   * selection) rather than token units. Determines which deep-link param
   * the receiving panel reads.
   */
  amountIsUsd?: boolean
  /** Optional lender enumeration so we can show real names + logos in the badge. */
  lenderInfoMap?: Record<string, LenderInfo>
  /** Server-side pagination state, shaped to match `<TablePagination>`'s expectations. */
  pagination?: OptimizerPaginationState
  /** Total row count from the API (not just the current page). */
  totalItems?: number
}

const fmtPct = (n: number | undefined) => (n == null || Number.isNaN(n) ? '–' : `${(n * 100).toFixed(2)}%`)
const fmtLev = (n: number | undefined) => (n == null || Number.isNaN(n) ? '–' : `${n.toFixed(2)}×`)
const fmtUsd = (n: number | undefined) => (n == null ? '–' : abbreviateUsd(n))
const fmtTok = (n: number | undefined, sym?: string) =>
  n == null ? '–' : `${n.toLocaleString(undefined, { maximumFractionDigits: 4 })}${sym ? ` ${sym}` : ''}`

function AssetCell({ asset }: { asset: OptimizerPairRow['collateral'] }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {asset.logoURI && <img src={asset.logoURI} alt="" className="w-5 h-5 rounded-full shrink-0" />}
      <div className="min-w-0">
        <div className="font-medium text-sm truncate">{asset.symbol ?? asset.address.slice(0, 6)}</div>
        <div className="text-[10px] text-base-content/50 truncate">{asset.name}</div>
      </div>
    </div>
  )
}

export function OptimizerTable({
  rows,
  direction,
  hasAmount,
  amount,
  amountIsUsd,
  lenderInfoMap,
  pagination,
  totalItems,
}: Props) {
  const navigate = useNavigate()
  const amountCol = direction === 'by-collateral' ? 'Max debt' : 'Min collateral'

  const baseQuery = (row: OptimizerPairRow) => ({
    [OPTIMIZER_DEEPLINK_KEYS.collateral]: row.collateral.address,
    [OPTIMIZER_DEEPLINK_KEYS.debt]: row.debt.address,
    [OPTIMIZER_DEEPLINK_KEYS.config]: row.eModeConfigId,
    // Only carry the amount through when the user typed it in token units
    // — the receiving Lending/Loop panels expect token units, not USD.
    [OPTIMIZER_DEEPLINK_KEYS.amount]: amountIsUsd ? undefined : amount,
  })

  const goLoop = (row: OptimizerPairRow) => {
    navigate(buildPath('trading', row.chainId, row.lenderKey, baseQuery(row)))
  }
  const goLending = (row: OptimizerPairRow, action: LendingDeepLinkAction) => {
    navigate(
      buildPath('lending', row.chainId, row.lenderKey, {
        ...baseQuery(row),
        [OPTIMIZER_DEEPLINK_KEYS.action]: action,
      })
    )
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
              <th className="text-right">Deposit APR</th>
              <th className="text-right">Borrow APR</th>
              <th className="text-right">Net APR</th>
              <th className="text-right">LTV</th>
              <th className="text-right">Max lev.</th>
              <th className="text-right">Util.</th>
              <th className="text-right">Borrow liq.</th>
              {hasAmount && <th className="text-right">{amountCol}</th>}
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <TableEmptyRow colSpan={hasAmount ? 12 : 11}>No pairs</TableEmptyRow>
            )}
            {rows.map((row, i) => {
              const key = `${row.chainId}-${row.lenderKey}-${row.collateral.address}-${row.debt.address}-${i}`
              const isProfitable = row.aprTotal > 0
              return (
                <tr key={key} className="hover">
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
                  <td className="text-right text-success">{fmtPct(row.depositAprLong)}</td>
                  <td className="text-right text-error">{fmtPct(row.borrowAprShort)}</td>
                  <td
                    className={`text-right font-semibold ${
                      row.aprTotal < 0 ? 'text-error' : 'text-success'
                    }`}
                  >
                    {fmtPct(row.aprTotal)}
                  </td>
                  <td className="text-right">{fmtPct(row.ltv)}</td>
                  <td className="text-right">{fmtLev(row.maxLeverage)}</td>
                  <td className="text-right">{fmtPct(row.utilizationShort)}</td>
                  <td className="text-right">{fmtUsd(row.borrowLiquidityShort || row.totalLiquidityUsdShort)}</td>
                  {hasAmount && (
                    <td className="text-right">
                      {(() => {
                        const isCol = direction === 'by-collateral'
                        const tok = isCol ? row.maxDebtAmount : row.minCollateralAmount
                        const usd = isCol ? row.maxDebtAmountUsd : row.minCollateralAmountUsd
                        const sym = isCol ? row.debt.symbol : row.collateral.symbol
                        if (tok == null && usd == null) return '–'
                        return (
                          <div className="flex flex-col items-end leading-tight">
                            <span>{tok != null ? fmtTok(tok, sym) : fmtUsd(usd)}</span>
                            {tok != null && usd != null && (
                              <span className="text-[10px] text-base-content/50">{fmtUsd(usd)}</span>
                            )}
                          </div>
                        )
                      })()}
                    </td>
                  )}
                  <td className="text-right whitespace-nowrap">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        className="btn btn-xs btn-primary"
                        disabled={!isProfitable}
                        title={
                          isProfitable
                            ? 'Open this pair in the Loop dashboard'
                            : 'Net APR is negative — looping would lose money'
                        }
                        onClick={() => goLoop(row)}
                      >
                        Loop
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        title={`Supply ${row.collateral.symbol ?? 'collateral'} on ${row.lenderKey}`}
                        onClick={() => goLending(row, 'deposit')}
                      >
                        Supply
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        title={`Borrow ${row.debt.symbol ?? 'debt'} against ${row.collateral.symbol ?? 'collateral'}`}
                        onClick={() => goLending(row, 'borrow')}
                      >
                        Borrow
                      </button>
                    </div>
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
