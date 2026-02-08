// src/components/UserLenderPositionsTable.tsx
import React from 'react'
import { lenderDisplayName } from '@1delta/lib-utils'
import type {
  UserDataResult,
  LenderUserDataEntry,
  UserPositionEntry,
} from '../../hooks/lending/useUserData'

interface UserLenderPositionsTableProps {
  account?: string
  chainId: string
  userData?: UserDataResult
  isLoading: boolean
  error: any
  refetch: () => void
}

function formatUsd(v: number) {
  return v.toLocaleString(undefined, {
    maximumFractionDigits: v < 1000 ? 2 : 0,
  })
}

/** Extract actual position objects from the positions array (INIT has a leading number) */
function extractPositions(positions: (UserPositionEntry | number)[]): UserPositionEntry[] {
  return positions.filter((p): p is UserPositionEntry => typeof p === 'object' && p !== null)
}

/** Filter active lender entries and sort by net worth */
function getActiveLenders(raw: LenderUserDataEntry[] | undefined): LenderUserDataEntry[] {
  if (!raw?.length) return []
  return raw
    .filter((entry) =>
      entry.netWorth !== 0 ||
      entry.data.some((sub) => extractPositions(sub.positions).length > 0)
    )
    .sort((a, b) => b.netWorth - a.netWorth)
}

type TaggedPosition = UserPositionEntry & { tag: 'collateral' | 'debt' }

/** Collect all positions across sub-accounts with collateral/debt tags */
function collectPositions(entry: LenderUserDataEntry): TaggedPosition[] {
  const result: TaggedPosition[] = []
  for (const sub of entry.data) {
    for (const pos of extractPositions(sub.positions)) {
      if (Number(pos.deposits) > 0) {
        result.push({ ...pos, tag: 'collateral' })
      }
      if (Number(pos.debt) > 0) {
        result.push({ ...pos, tag: 'debt' })
      }
    }
  }
  return result
}

const PositionsList: React.FC<{ positions: TaggedPosition[] }> = ({ positions }) => {
  if (positions.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {positions.map((pos) => (
        <div
          key={`${pos.poolId}-${pos.tag}`}
          className="badge badge-outline badge-sm flex gap-1 items-center"
        >
          <span
            className={`text-[9px] font-bold uppercase ${
              pos.tag === 'debt' ? 'text-error' : 'text-success'
            }`}
          >
            {pos.tag}
          </span>
          <span className="font-mono text-[10px]">
            {pos.underlying.slice(0, 6)}...{pos.underlying.slice(-4)}
          </span>
          <span className="opacity-70">
            {pos.tag === 'debt'
              ? `${Number(pos.debt || 0).toFixed(4)} ($${formatUsd(pos.debtUSD)})`
              : `${Number(pos.deposits || 0).toFixed(4)} ($${formatUsd(pos.depositsUSD)})`}
          </span>
        </div>
      ))}
    </div>
  )
}

export const UserLenderPositionsTable: React.FC<UserLenderPositionsTableProps> = ({
  account,
  chainId,
  userData,
  isLoading,
  error,
  refetch,
}) => {
  const summary = userData?.summary
  const lenderEntries = getActiveLenders(userData?.raw)

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

  if (!lenderEntries.length) {
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
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Your Lending Positions</h2>
          <p className="text-sm text-base-content/70">
            Grouped by lender and chain, including positions and 24h change.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end items-center">
          <button className="btn btn-xs" onClick={refetch}>
            Refresh balances
          </button>
        </div>
      </div>

      {/* Totals summary */}
      {summary && (
        <div className="stats stats-horizontal shadow w-full overflow-x-auto">
          <div className="stat">
            <div className="stat-title">Total Net Worth</div>
            <div className="stat-value text-lg">${formatUsd(summary.totalNetWorth)}</div>
            {summary.totalNetWorth24h != null && summary.totalNetWorth24h !== 0 && (
              <div
                className={`stat-desc ${
                  summary.totalNetWorth - summary.totalNetWorth24h >= 0
                    ? 'text-success'
                    : 'text-error'
                }`}
              >
                {(
                  ((summary.totalNetWorth - summary.totalNetWorth24h) /
                    summary.totalNetWorth24h) *
                  100
                ).toFixed(2)}
                % 24h
              </div>
            )}
          </div>
          <div className="stat">
            <div className="stat-title">Total Deposits</div>
            <div className="stat-value text-lg">${formatUsd(summary.totalDepositsUSD)}</div>
          </div>
          <div className="stat">
            <div className="stat-title">Total Debt</div>
            <div className="stat-value text-lg">${formatUsd(summary.totalDebtUSD)}</div>
          </div>
          <div className="stat">
            <div className="stat-title">Net APR</div>
            <div className="stat-value text-lg">{summary.avgNetApr.toFixed(2)}%</div>
          </div>
          {summary.overallLeverage > 1 && (
            <div className="stat">
              <div className="stat-title">Leverage</div>
              <div className="stat-value text-lg">{summary.overallLeverage.toFixed(2)}x</div>
            </div>
          )}
        </div>
      )}

      {/* Per-lender table */}
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
              {lenderEntries.map((entry) => {
                const pnl24h = entry.netWorth - entry.netWorth24h
                const positions = collectPositions(entry)

                return (
                  <tr key={`${entry.chainId}-${entry.lender}`}>
                    <td>
                      <div className="flex flex-col text-xs">
                        <span className="font-semibold">
                          {lenderDisplayName(entry.lender)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="text-xs font-semibold">
                        ${formatUsd(entry.netWorth)}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col text-xs">
                        <span>${formatUsd(entry.netWorth24h)}</span>
                        {entry.netWorth24h !== 0 && (
                          <span
                            className={pnl24h >= 0 ? 'text-success' : 'text-error'}
                          >
                            {((pnl24h / entry.netWorth24h) * 100).toFixed(2)}%
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="text-xs font-semibold">
                        {entry.netApr.toFixed(2)}%
                      </span>
                    </td>
                    <td>
                      {entry.healthFactor != null ? (
                        <span
                          className={`badge badge-sm ${
                            entry.healthFactor < 1.1
                              ? 'badge-error'
                              : entry.healthFactor < 1.3
                                ? 'badge-warning'
                                : 'badge-success'
                          }`}
                        >
                          {entry.healthFactor.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-xs text-base-content/50">n/a</span>
                      )}
                    </td>
                    <td>
                      {entry.leverage > 1 ? (
                        <span className="badge badge-outline badge-sm">
                          {entry.leverage.toFixed(2)}x
                        </span>
                      ) : (
                        <span className="text-xs text-base-content/50">n/a</span>
                      )}
                    </td>
                    <td>
                      <PositionsList positions={positions} />
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
