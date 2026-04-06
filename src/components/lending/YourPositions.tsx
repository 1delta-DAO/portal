import React from 'react'
import type { PoolDataItem } from '../../hooks/lending/usePoolData'
import type { UserPositionEntry, UserSubAccount } from '../../hooks/lending/useUserData'
import { formatUsd, abbreviateUsd, formatTokenAmount } from '../../utils/format'
import { AssetPopover } from './AssetPopover'
import { EModeBadge } from './EModeAnalysisModal'
import { CollateralToggle } from './UserTable'
import { HealthBadge } from '../common/HealthBadge'
import { EmptyState } from '../common/EmptyState'

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
  account: string
  chainId: string
  /** Enables borrow mode badge on sub-account chips when set */
  selectedLender?: string
  /** Highlights a position card */
  selectedPoolMarketUid?: string
  /** Makes position cards clickable */
  onPoolSelect?: (pool: PoolDataItem) => void
}

export function YourPositions({
  subAccounts,
  selectedSubAccountId,
  onSubAccountChange,
  summary,
  activePositions,
  account,
  chainId,
  selectedLender,
  selectedPoolMarketUid,
  onPoolSelect,
}: YourPositionsProps) {
  return (
    <div className="rounded-box border border-base-300 p-4 space-y-3">
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

      {/* Position cards — split by collateral & debt */}
      {activePositions.length > 0 && (
        <div className="space-y-2">
          {/* Deposits row */}
          {activePositions.some(({ position }) => Number(position.deposits) > 0) && (
            <div>
              <span className="text-xs font-semibold text-success mb-1 flex items-center gap-1 flex-wrap">
                Deposits
                {summary && (
                  <>
                    <span className="font-normal text-base-content/60" title={`$${summary.deposits.toLocaleString(undefined, { maximumFractionDigits: 6 })}`}>
                      — ${formatUsd(summary.deposits)}
                    </span>
                    <span className="font-medium">
                      {(summary.depositApr + summary.intrinsicDepositApr).toFixed(2)}%
                    </span>
                    {summary.intrinsicDepositApr > 0 && (
                      <span
                        className="badge badge-xs bg-success/15 text-success border-0 cursor-help"
                        title={`Base rate: ${summary.depositApr.toFixed(2)}% + Intrinsic yield: ${summary.intrinsicDepositApr.toFixed(2)}%`}
                      >
                        +{summary.intrinsicDepositApr.toFixed(1)}%
                      </span>
                    )}
                  </>
                )}
              </span>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                {activePositions
                  .filter(({ position }) => Number(position.deposits) > 0)
                  .map(({ position, pool }) => (
                    <div
                      key={pool.marketUid}
                      className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                        onPoolSelect ? 'cursor-pointer' : ''
                      } ${
                        selectedPoolMarketUid === pool.marketUid
                          ? 'bg-primary/15 ring-1 ring-primary'
                          : 'bg-base-200/50 hover:bg-base-200'
                      }`}
                      onClick={() => onPoolSelect?.(pool)}
                    >
                      <AssetPopover
                        address={pool.underlying}
                        name={pool.asset.name}
                        symbol={pool.asset.symbol}
                        logoURI={pool.asset.logoURI}
                        marketUid={pool.marketUid}
                        marketName={pool.name}
                        currentUtilization={pool.totalDeposits > 0 ? pool.totalDebt / pool.totalDeposits : undefined}
                        currentDepositRate={pool.depositRate + (pool.intrinsicYield ?? 0)}
                        currentBorrowRate={pool.variableBorrowRate + (pool.intrinsicYield ?? 0)}
                        oraclePriceUsd={pool.oraclePriceUSD}
                        chainId={pool.asset.chainId}
                      >
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-sm font-medium">{pool.asset.symbol}</span>
                          <span className="text-xs text-success truncate" title={`${position.deposits} ($${formatUsd(position.depositsUSD)})`}>
                            +{formatTokenAmount(position.deposits)} ($
                            {formatUsd(position.depositsUSD)})
                          </span>
                        </div>
                      </AssetPopover>
                      {account && (
                        <div className="flex flex-col items-center shrink-0">
                          <span className="text-[10px] text-base-content/50 leading-tight">
                            Coll.
                          </span>
                          <CollateralToggle
                            marketUid={pool.marketUid}
                            enabled={position.collateralEnabled}
                            account={account}
                            chainId={chainId}
                          />
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Debt row */}
          {activePositions.some(({ position }) => Number(position.debt) > 0) && (
            <div>
              <span className="text-xs font-semibold text-error mb-1 flex items-center gap-1 flex-wrap">
                Debt
                {summary && (
                  <>
                    <span className="font-normal text-base-content/60" title={`$${summary.debt.toLocaleString(undefined, { maximumFractionDigits: 6 })}`}>
                      — ${formatUsd(summary.debt)}
                    </span>
                    <span className="font-medium">
                      {(summary.borrowApr + summary.intrinsicBorrowApr).toFixed(2)}%
                    </span>
                    {summary.intrinsicBorrowApr > 0 && (
                      <span
                        className="badge badge-xs bg-warning/15 text-warning border-0 cursor-help"
                        title={`Base rate: ${summary.borrowApr.toFixed(2)}% + Intrinsic yield: ${summary.intrinsicBorrowApr.toFixed(2)}%`}
                      >
                        +{summary.intrinsicBorrowApr.toFixed(1)}%
                      </span>
                    )}
                  </>
                )}
              </span>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                {activePositions
                  .filter(({ position }) => Number(position.debt) > 0)
                  .map(({ position, pool }) => (
                    <div
                      key={pool.marketUid}
                      className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                        onPoolSelect ? 'cursor-pointer' : ''
                      } ${
                        selectedPoolMarketUid === pool.marketUid
                          ? 'bg-primary/15 ring-1 ring-primary'
                          : 'bg-base-200/50 hover:bg-base-200'
                      }`}
                      onClick={() => onPoolSelect?.(pool)}
                    >
                      <AssetPopover
                        address={pool.underlying}
                        name={pool.asset.name}
                        symbol={pool.asset.symbol}
                        logoURI={pool.asset.logoURI}
                        marketUid={pool.marketUid}
                        marketName={pool.name}
                        currentUtilization={pool.totalDeposits > 0 ? pool.totalDebt / pool.totalDeposits : undefined}
                        currentDepositRate={pool.depositRate + (pool.intrinsicYield ?? 0)}
                        currentBorrowRate={pool.variableBorrowRate + (pool.intrinsicYield ?? 0)}
                        oraclePriceUsd={pool.oraclePriceUSD}
                        chainId={pool.asset.chainId}
                      >
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-sm font-medium">{pool.asset.symbol}</span>
                          <span className="text-xs text-error truncate" title={`${position.debt} ($${formatUsd(position.debtUSD)})`}>
                            -{formatTokenAmount(position.debt)} (${formatUsd(position.debtUSD)})
                          </span>
                        </div>
                      </AssetPopover>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
