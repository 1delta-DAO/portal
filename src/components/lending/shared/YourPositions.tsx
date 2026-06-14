import React from 'react'
import type { PoolDataItem } from '../../../hooks/lending/usePoolData'
import type { UserPositionEntry, UserSubAccount } from '../../../hooks/lending/useUserData'
import type { PoolSide } from '../tabs/trading/types'
import { formatUsd, abbreviateUsd, formatTokenAmount } from '../../../utils/format'
import { AssetPopover } from './AssetPopover'
import { EModeBadge } from './EModeAnalysisModal'
import { CollateralToggle } from '../tabs/earn/UserPositionsTable'
import { HealthBadge } from '../../common/HealthBadge'
import { EmptyState } from '../../common/EmptyState'
import {
  loanDebtString,
  termLabel,
  maturityDisplay,
  loanRatePct,
  hasEarlyRepayPenalty,
} from './brokeredLoans'

/** Total debt of a position in token units — variable + stable (brokered fixed
 *  debt sits in the stable slot). */
const debtNative = (p: UserPositionEntry) => Number(p.debt) + Number(p.debtStable)
/** Total debt of a position in USD — variable + stable. */
const debtUsd = (p: UserPositionEntry) => (p.debtUSD ?? 0) + (p.debtStableUSD ?? 0)

export interface PositionSummary {
  deposits: number
  debt: number
  nav: number
  health: number | null
  apr: number
  depositApr: number
  borrowApr: number
  intrinsicApr: number
  intrinsicDepositApr: number
  intrinsicBorrowApr: number
}

export interface YourPositionsProps {
  subAccounts: UserSubAccount[]
  selectedSubAccountId: string | null
  onSubAccountChange: (id: string) => void
  summary: PositionSummary | null
  activePositions: { position: UserPositionEntry; pool: PoolDataItem }[]
  /**
   * Per-loan brokered rows grouped by `marketUid`. When a debt row's market has
   * entries here, its loans are listed beneath it (each repaid individually).
   */
  loansByMarket?: Map<string, UserPositionEntry[]>
  account: string
  chainId: string
  /** Enables borrow mode badge on sub-account chips when set */
  selectedLender?: string
  /** Highlights a position card */
  selectedPoolMarketUid?: string
  /** Makes position cards clickable. `side` is `'collateral'` for entries
   *  in the Deposits section, `'borrowable'` for entries in the Debt section
   *  — so multi-leg actions can route the click to the matching slot. */
  onPoolSelect?: (pool: PoolDataItem, side: PoolSide) => void
}

export function YourPositions({
  subAccounts,
  selectedSubAccountId,
  onSubAccountChange,
  summary,
  activePositions,
  loansByMarket,
  account,
  chainId,
  selectedLender,
  selectedPoolMarketUid,
  onPoolSelect,
}: YourPositionsProps) {
  return (
    <div className="rounded-box border border-base-300 p-3 sm:p-4 space-y-3">
      <h3 className="text-sm font-semibold">Your Positions</h3>

      {subAccounts.length === 0 && (
        <EmptyState
          size="sm"
          title="No positions yet"
          description="Deposit or borrow on a market to see your positions here."
        />
      )}

      {/* Sub-account chips */}
      <div className="flex flex-wrap gap-2">
        {subAccounts.map((sub, i) => {
          const isActive = sub.accountId === selectedSubAccountId

          return (
            <button
              key={sub.accountId}
              type="button"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer border ${
                isActive
                  ? 'border-primary bg-primary/10 ring-1 ring-primary'
                  : 'border-base-300 bg-base-200/50 hover:bg-base-200'
              }`}
              onClick={() => onSubAccountChange(sub.accountId)}
            >
              <span className="font-semibold">#{i + 1}</span>
              <span className="text-base-content/70" title={`Deposits: $${formatUsd(sub.balanceData.deposits)} | Debt: $${formatUsd(sub.balanceData.debt)} | NAV: $${formatUsd(sub.balanceData.nav)}`}>
                NAV: <span className="font-medium">{abbreviateUsd(sub.balanceData.nav)}</span>
              </span>
              {sub.health != null && <HealthBadge health={sub.health} size="xs" />}
              {selectedLender && (
                <EModeBadge
                  subAccount={sub}
                  lender={selectedLender}
                  chainId={chainId}
                  account={account}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Summary stats for selected sub-account */}
      {summary && (
        <div className="flex gap-4 items-center text-xs flex-wrap">
          <span title={`Deposits: $${formatUsd(summary.deposits)} | Debt: $${formatUsd(summary.debt)} | NAV: $${formatUsd(summary.nav)}`}>
            Net: <span className="font-semibold">${formatUsd(summary.nav)}</span>
          </span>
          <div className="flex items-center gap-1">
            <span>APR:</span>
            <span
              className={`font-semibold ${summary.apr + summary.intrinsicApr >= 0 ? 'text-success' : 'text-error'}`}
            >
              {(summary.apr + summary.intrinsicApr).toFixed(2)}%
            </span>
            {summary.intrinsicApr > 0 && (
              <span
                className="badge badge-xs bg-success/15 text-success border-0 cursor-help"
                title={`Base APR: ${summary.apr.toFixed(2)}% + Intrinsic yield: ${summary.intrinsicApr.toFixed(2)}%`}
              >
                +{summary.intrinsicApr.toFixed(1)}%
              </span>
            )}
          </div>
          {summary.health != null && (
            <div className="flex items-center gap-1">
              <span>Health:</span>
              <HealthBadge health={summary.health} />
            </div>
          )}
        </div>
      )}

      {/* Position rows — split by collateral & debt */}
      {activePositions.length > 0 && (
        <div className="space-y-3">
          {/* Deposits */}
          {activePositions.some(({ position }) => Number(position.deposits) > 0) && (
            <PositionSection
              kind="deposits"
              positions={activePositions
                .filter(({ position }) => Number(position.deposits) > 0)
                .sort((a, b) => (b.position.depositsUSD ?? 0) - (a.position.depositsUSD ?? 0))}
              summary={summary}
              account={account}
              chainId={chainId}
              selectedPoolMarketUid={selectedPoolMarketUid}
              onPoolSelect={onPoolSelect}
            />
          )}

          {/* Debt */}
          {activePositions.some(({ position }) => debtNative(position) > 0) && (
            <PositionSection
              kind="debt"
              positions={activePositions
                .filter(({ position }) => debtNative(position) > 0)
                .sort((a, b) => debtUsd(b.position) - debtUsd(a.position))}
              summary={summary}
              account={account}
              chainId={chainId}
              selectedPoolMarketUid={selectedPoolMarketUid}
              onPoolSelect={onPoolSelect}
              loansByMarket={loansByMarket}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PositionSection — dense, aligned position list
// ---------------------------------------------------------------------------

interface PositionSectionProps {
  kind: 'deposits' | 'debt'
  positions: { position: UserPositionEntry; pool: PoolDataItem }[]
  summary: PositionSummary | null
  account: string
  chainId: string
  selectedPoolMarketUid?: string
  onPoolSelect?: (pool: PoolDataItem, side: PoolSide) => void
  loansByMarket?: Map<string, UserPositionEntry[]>
}

function PositionSection({
  kind,
  positions,
  summary,
  account,
  chainId,
  selectedPoolMarketUid,
  onPoolSelect,
  loansByMarket,
}: PositionSectionProps) {
  const isDeposits = kind === 'deposits'
  const accentText = isDeposits ? 'text-success' : 'text-error'
  const accentBar = isDeposits ? 'bg-success/60' : 'bg-error/60'
  const shareBarClass = isDeposits ? 'bg-success/40' : 'bg-error/40'

  const totalUsd = isDeposits ? summary?.deposits ?? 0 : summary?.debt ?? 0
  const baseApr = isDeposits ? summary?.depositApr ?? 0 : summary?.borrowApr ?? 0
  const intrinsic = isDeposits
    ? summary?.intrinsicDepositApr ?? 0
    : summary?.intrinsicBorrowApr ?? 0
  const totalApr = baseApr + intrinsic
  const intrinsicPillClass = isDeposits
    ? 'bg-success/15 text-success'
    : 'bg-warning/15 text-warning'

  // Largest position in this section — used to scale the share bar so the
  // biggest entry fills it and the rest are visually proportional.
  const maxUsd = positions.reduce(
    (m, { position }) => Math.max(m, isDeposits ? position.depositsUSD : debtUsd(position)),
    0
  )

  return (
    <div>
      {/* Section header */}
      <div className="flex items-baseline gap-2 mb-1.5 px-1">
        <span className={`text-xs font-semibold uppercase tracking-wide ${accentText}`}>
          {isDeposits ? 'Deposits' : 'Debt'}
        </span>
        {summary && (
          <>
            <span
              className="text-xs font-mono tabular-nums text-base-content/80"
              title={`$${totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            >
              {abbreviateUsd(totalUsd)}
            </span>
            <span className="text-[10px] text-base-content/50">@</span>
            <span className="text-xs font-medium">{totalApr.toFixed(2)}%</span>
            {intrinsic > 0 && (
              <span
                className={`badge badge-xs border-0 cursor-help ${intrinsicPillClass}`}
                title={`Base rate: ${baseApr.toFixed(2)}% + Intrinsic yield: ${intrinsic.toFixed(2)}%`}
              >
                +{intrinsic.toFixed(1)}%
              </span>
            )}
            <span className="text-[10px] text-base-content/40">
              · {positions.length} {positions.length === 1 ? 'position' : 'positions'}
            </span>
          </>
        )}
      </div>

      {/* Rows */}
      <div className="relative rounded-md border border-base-300 overflow-hidden">
        <span className={`absolute left-0 top-0 bottom-0 w-0.5 ${accentBar}`} />
        <div className="divide-y divide-base-300">
          {positions.map(({ position, pool }) => {
            const native = isDeposits ? Number(position.deposits) : debtNative(position)
            const usd = isDeposits ? position.depositsUSD : debtUsd(position)
            const isSelected = selectedPoolMarketUid === pool.marketUid
            const loans = !isDeposits ? loansByMarket?.get(pool.marketUid) : undefined

            const positionApr =
              (isDeposits ? pool.depositRate : pool.variableBorrowRate) +
              (pool.intrinsicYield ?? 0)
            const sharePct = totalUsd > 0 ? (usd / totalUsd) * 100 : 0
            const barPct = maxUsd > 0 ? Math.max(2, (usd / maxUsd) * 100) : 0

            return (
              <React.Fragment key={pool.marketUid}>
              <div
                className={`grid grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:grid-cols-[minmax(140px,1.4fr)_72px_minmax(80px,1fr)_96px_140px_40px] items-center gap-x-3 px-3 py-1 pl-4 transition-colors ${
                  onPoolSelect ? 'cursor-pointer' : ''
                } ${
                  isSelected ? 'bg-primary/10 ring-1 ring-primary ring-inset' : 'hover:bg-base-200/60'
                }`}
                onClick={() =>
                  onPoolSelect?.(pool, isDeposits ? 'collateral' : 'borrowable')
                }
              >
                {/* Asset (logo + symbol + price sub-text) */}
                <div className="flex items-center min-w-0">
                  <AssetPopover
                    address={pool.underlying}
                    name={pool.asset.name}
                    symbol={pool.asset.symbol}
                    logoURI={pool.asset.logoURI}
                    marketUid={pool.marketUid}
                    marketName={pool.name}
                    currentDepositRate={pool.depositRate + (pool.intrinsicYield ?? 0)}
                    currentBorrowRate={pool.variableBorrowRate + (pool.intrinsicYield ?? 0)}
                    oraclePriceUsd={pool.oraclePriceUSD}
                    chainId={pool.asset.chainId}
                  >
                    <div className="flex flex-col min-w-0 leading-tight">
                      <span className="text-sm font-medium truncate">{pool.asset.symbol}</span>
                      <span className="text-[10px] font-mono tabular-nums flex items-center gap-1.5 min-w-0">
                        {/* APR shown inline only on mobile — desktop has a dedicated column */}
                        <span
                          className={`sm:hidden ${accentText}`}
                          title={`${isDeposits ? 'Deposit' : 'Borrow'} rate: ${positionApr.toFixed(4)}%`}
                        >
                          {positionApr.toFixed(2)}%
                          <span className="text-base-content/50 ml-0.5 font-sans">APR</span>
                        </span>
                        {pool.oraclePriceUSD != null && (
                          <>
                            <span className="sm:hidden text-base-content/30">·</span>
                            <span className="text-base-content/50 truncate">
                              ${pool.oraclePriceUSD < 1
                                ? pool.oraclePriceUSD.toPrecision(4)
                                : pool.oraclePriceUSD.toLocaleString(undefined, {
                                    maximumFractionDigits: 2,
                                  })}
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                  </AssetPopover>
                </div>

                {/* APR — visually separated from the bar by a right divider */}
                <div
                  className="hidden sm:flex flex-col items-start justify-center leading-tight pr-3 border-r border-base-300/60"
                  title={`${isDeposits ? 'Deposit' : 'Borrow'} rate: ${positionApr.toFixed(4)}%`}
                >
                  <span className={`text-xs font-medium tabular-nums ${accentText}`}>
                    {positionApr.toFixed(2)}%
                  </span>
                  <span className="text-[9px] uppercase tracking-wide text-base-content/40">
                    APR
                  </span>
                </div>

                {/* Share bar — visualizes this position's share of the section total */}
                <div
                  className="hidden sm:flex items-center gap-2 min-w-0"
                  title={`${sharePct.toFixed(2)}% of ${isDeposits ? 'deposits' : 'debt'}`}
                >
                  <div className="flex-1 h-1.5 rounded-full bg-base-300/60 overflow-hidden">
                    <div
                      className={`h-full ${shareBarClass} rounded-full transition-all`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-[10px] font-mono tabular-nums text-base-content/50 w-10 text-right">
                    {sharePct >= 10 ? sharePct.toFixed(0) : sharePct.toFixed(1)}%
                    <span className="text-base-content/30 ml-0.5">sh</span>
                  </span>
                </div>

                {/* USD value */}
                <span
                  className={`text-right text-sm font-semibold font-mono tabular-nums ${accentText}`}
                  title={`$${formatUsd(usd)}`}
                >
                  {abbreviateUsd(usd)}
                </span>

                {/* Native amount */}
                <span
                  className="hidden sm:inline text-right text-xs font-mono tabular-nums text-base-content/60 truncate"
                  title={`${native.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${pool.asset.symbol}`}
                >
                  {formatTokenAmount(native)}
                  <span className="text-base-content/40 ml-1">{pool.asset.symbol}</span>
                </span>

                {/* Collateral toggle (deposits only) */}
                <div className="flex justify-end">
                  {isDeposits && account && (
                    <CollateralToggle
                      marketUid={pool.marketUid}
                      enabled={position.collateralEnabled}
                      account={account}
                      chainId={chainId}
                    />
                  )}
                </div>
              </div>
              {loans && loans.length > 0 && (
                <LoanBreakdown
                  loans={loans}
                  symbol={pool.asset.symbol}
                  marketVariableRate={pool.variableBorrowRate + (pool.intrinsicYield ?? 0)}
                />
              )}
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// LoanBreakdown — per-loan rows for a brokered (fixed-term) market.
// One health/collateral pool backs every loan; these are a read-only breakdown
// of the market's aggregate debt (don't sum them into totals). See the
// brokered user-positions UI spec §2.
// ---------------------------------------------------------------------------

function LoanBreakdown({
  loans,
  symbol,
  marketVariableRate,
}: {
  loans: UserPositionEntry[]
  symbol: string
  marketVariableRate: number
}) {
  return (
    <div className="bg-base-200/40 px-3 py-1.5 pl-6 space-y-1">
      {loans.map((loan) => {
        const mat = maturityDisplay(loan)
        const ratePct = loanRatePct(loan)
        const penalty = hasEarlyRepayPenalty(loan)
        return (
          <div
            key={`${loan.marketUid}|${loan.loanId}`}
            className="flex items-center justify-between gap-2 text-[11px]"
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="font-medium text-base-content/80">{termLabel(loan)}</span>
              <span className="font-mono tabular-nums text-warning">
                {ratePct != null ? `${ratePct.toFixed(2)}%` : `${marketVariableRate.toFixed(2)}% var`}
              </span>
              {mat.isPast && (
                <span className="badge badge-xs bg-warning/15 text-warning border-0">Matured</span>
              )}
              {penalty && (
                <span
                  className="text-warning/70 cursor-help"
                  title={`Early-repay penalty: ${formatTokenAmount(loan.term?.earlyRepayPenalty ?? '0')} ${symbol}`}
                >
                  ⚠ penalty
                </span>
              )}
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="font-mono tabular-nums text-error">
                {formatTokenAmount(loanDebtString(loan))} {symbol}
              </span>
              <span className="text-base-content/50 w-16 text-right">
                {mat.isFlex ? '—' : mat.isPast ? 'frozen' : `in ${mat.label}`}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
