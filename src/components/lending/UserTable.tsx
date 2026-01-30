// src/components/UserLenderPositionsTable.tsx
import React from 'react'
import { lenderDisplayName } from '@1delta/lib-utils'
import {
  LenderUiSummary,
  MinimalPositionInfo,
  UserPositions,
} from '../../hooks/lending/useMarginData'

interface UserLenderPositionsTableProps {
  account?: string
  chainId: string
  userPositions?: UserPositions
  // account: string
  isLoading: boolean
  error: any
  refetch: () => void
}

function formatUsd(v: number) {
  return v.toLocaleString(undefined, {
    maximumFractionDigits: v < 1000 ? 2 : 0,
  })
}

const PositionsList: React.FC<{
  title: string
  positions?: MinimalPositionInfo[]
}> = ({ title, positions }) => {
  if (!positions || positions.length === 0) return null

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase text-base-content/60">{title}</div>
      <div className="flex flex-wrap gap-2">
        {positions.map((pos) => (
          <div
            key={`${pos.poolId}-${pos?.asset?.address ?? pos?.asset?.symbol}`}
            className="badge badge-outline badge-sm flex gap-1 items-center"
          >
            <span>{(pos?.asset as any)?.symbol ?? (pos?.asset as any)?.name ?? '???'}</span>
            <span className="opacity-70">
              {pos.size.toFixed(4)} ({'$'}
              {formatUsd(pos.sizeUSD)})
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export const UserLenderPositionsTable: React.FC<UserLenderPositionsTableProps> = ({
  account,
  chainId,
  userPositions,
  isLoading,
  error,
  refetch,
}) => {
  const lenderTotals = (userPositions?.lenderTotals ?? []) as LenderUiSummary[]

  const visibleLenders = lenderTotals

  const total = userPositions?.total ?? 0
  const total24h = userPositions?.total24h ?? 0
  const totalApr = (userPositions as any)?.apr as number | undefined

  if (!account) {
    return (
      <div className="w-full max-w-4xl mx-auto p-4">
        <div className="alert alert-info">
          <span>Connect your wallet to see your lending positions.</span>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <span className="loading loading-spinner loading-lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full max-w-4xl mx-auto p-4">
        <div className="alert alert-error mb-2">
          <span>Failed to load user data: {error.message}</span>
        </div>
        <button className="btn btn-sm" onClick={refetch}>
          Retry
        </button>
      </div>
    )
  }

  if (!lenderTotals.length) {
    return (
      <div className="w-full max-w-4xl mx-auto p-4">
        <div className="alert alert-info">
          <span>No active lending positions found for this account.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-4 space-y-4">
      {/* Header + chain filter */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Your Lending Positions</h2>
          <p className="text-sm text-base-content/70">
            Grouped by lender and chain, including long / short exposure and 24h change.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 md:justify-end items-center">
          <button className="btn btn-xs" onClick={refetch}>
            Refresh balances
          </button>
        </div>
      </div>

      {/* Totals summary */}
      <div className="stats stats-horizontal shadow w-full overflow-x-auto">
        <div className="stat">
          <div className="stat-title">Total Net Worth</div>
          <div className="stat-value text-lg">${formatUsd(total)}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Net Worth 24h Ago</div>
          <div className="stat-value text-lg">${formatUsd(total24h)}</div>
          <div className="stat-desc">
            {total24h !== 0 && (
              <span className={total >= total24h ? 'text-success' : 'text-error'}>
                {(((total - total24h) / total24h) * 100).toFixed(2)}%
              </span>
            )}
          </div>
        </div>
        {totalApr != null && (
          <div className="stat">
            <div className="stat-title">Portfolio APR</div>
            <div className="stat-value text-lg">{totalApr.toFixed(2)}%</div>
          </div>
        )}
      </div>

      {/* Per-lender grouped table */}
      <div className="rounded-box border border-base-300 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table table-zebra table-sm w-full">
            <thead>
              <tr>
                <th>Lender</th>
                <th>Net Worth</th>
                <th>24h Change</th>
                <th>APR</th>
                <th>Health</th>
                <th>Leverage</th>
                <th>Positions</th>
              </tr>
            </thead>
            <tbody>
              {visibleLenders.map((lender) => {
                const worstHealth =
                  lender.healthFactors && lender.healthFactors.length
                    ? Math.min(...lender.healthFactors)
                    : undefined
                const maxLev =
                  lender.leverages && lender.leverages.length
                    ? Math.max(...lender.leverages)
                    : undefined

                const pnl24h = lender.netWorth - lender.netWorth24h

                return (
                  <tr key={`${lender.chain}-${lender.lender}`}>
                    <td>
                      <div className="flex flex-col text-xs">
                        <span className="font-semibold">{lenderDisplayName(lender.lender)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="text-xs font-semibold">${formatUsd(lender.netWorth)}</div>
                    </td>
                    <td>
                      <div className="flex flex-col text-xs">
                        <span>${formatUsd(lender.netWorth24h)}</span>
                        {lender.netWorth24h !== 0 && (
                          <span className={pnl24h >= 0 ? 'text-success' : 'text-error'}>
                            {((pnl24h / lender.netWorth24h) * 100).toFixed(2)}%
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="text-xs font-semibold">{lender.apr.toFixed(2)}%</span>
                    </td>
                    <td>
                      {worstHealth != null ? (
                        <span
                          className={`badge badge-sm ${
                            worstHealth < 1.1
                              ? 'badge-error'
                              : worstHealth < 1.3
                                ? 'badge-warning'
                                : 'badge-success'
                          }`}
                          title={
                            lender.healthFactors
                              ? `Health factors: ${lender.healthFactors.map((x) => x.toFixed(2)).join(', ')}`
                              : ''
                          }
                        >
                          {worstHealth.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-xs text-base-content/50">n/a</span>
                      )}
                    </td>
                    <td>
                      {maxLev != null ? (
                        <span
                          className="badge badge-outline badge-sm"
                          title={
                            lender.leverages
                              ? `Leverages: ${lender.leverages.map((x) => `${x.toFixed(2)}x`).join(', ')}`
                              : ''
                          }
                        >
                          {maxLev.toFixed(2)}x
                        </span>
                      ) : (
                        <span className="text-xs text-base-content/50">n/a</span>
                      )}
                    </td>
                    <td>
                      <div className="space-y-2 text-xs">
                        <PositionsList title="Assets Long" positions={lender.assetsLong!} />
                        <PositionsList title="Assets Short" positions={lender.assetsShort!} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
