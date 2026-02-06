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

/** Flatten raw data into a list of { chainId, lender, entry } for table rendering */
function flattenLenderEntries(raw: UserDataResult['raw']): {
  chainId: string
  lender: string
  entry: LenderUserDataEntry
}[] {
  if (!raw) return []
  const entries: { chainId: string; lender: string; entry: LenderUserDataEntry }[] = []
  for (const [chainId, lenders] of Object.entries(raw)) {
    for (const [lender, entry] of Object.entries(lenders)) {
      // skip lenders with no meaningful position
      const hasActivity = entry.data.some(
        (sub) => sub.balanceData.nav !== 0 || extractPositions(sub.positions).length > 0
      )
      if (hasActivity) {
        entries.push({ chainId, lender, entry })
      }
    }
  }
  return entries.sort((a, b) => {
    const aNav = a.entry.data.reduce((s, sub) => s + sub.balanceData.nav, 0)
    const bNav = b.entry.data.reduce((s, sub) => s + sub.balanceData.nav, 0)
    return bNav - aNav
  })
}

const PositionsList: React.FC<{
  title: string
  positions: UserPositionEntry[]
}> = ({ title, positions }) => {
  if (positions.length === 0) return null

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase text-base-content/60">{title}</div>
      <div className="flex flex-wrap gap-2">
        {positions.map((pos) => (
          <div
            key={`${pos.poolId}-${pos.underlying}`}
            className="badge badge-outline badge-sm flex gap-1 items-center"
          >
            <span className="font-mono text-[10px]">
              {pos.underlying.slice(0, 6)}...{pos.underlying.slice(-4)}
            </span>
            <span className="opacity-70">
              {Number(pos.deposits || 0).toFixed(4)} ({'$'}
              {formatUsd(pos.depositsUSD)})
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
  userData,
  isLoading,
  error,
  refetch,
}) => {
  const summary = userData?.summary
  const lenderEntries = flattenLenderEntries(userData?.raw)

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
      {summary && (
        <div className="stats stats-horizontal shadow w-full overflow-x-auto">
          <div className="stat">
            <div className="stat-title">Total Net Worth</div>
            <div className="stat-value text-lg">${formatUsd(summary.totalNetWorth)}</div>
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
              {lenderEntries.map(({ chainId: cId, lender, entry }) => {
                // Aggregate across sub-accounts
                let nav = 0
                let nav24h = 0
                let deposits = 0
                let debt = 0
                const healthFactors: number[] = []
                const leverages: number[] = []
                const assetsLong: UserPositionEntry[] = []
                const assetsShort: UserPositionEntry[] = []

                for (const sub of entry.data) {
                  const bd = sub.balanceData
                  nav += bd.nav
                  nav24h += bd.nav24h
                  deposits += bd.deposits
                  debt += bd.debt

                  if (bd.nav !== 0) leverages.push(bd.deposits / bd.nav)
                  if (sub.health != null) healthFactors.push(sub.health)

                  for (const pos of extractPositions(sub.positions)) {
                    if (Number(pos.deposits) > 0) assetsLong.push(pos)
                    if (Number(pos.debt) > 0) assetsShort.push(pos)
                  }
                }

                const apr = entry.data[0]?.aprData.apr ?? 0
                const worstHealth = healthFactors.length ? Math.min(...healthFactors) : undefined
                const maxLev = leverages.length ? Math.max(...leverages) : undefined
                const pnl24h = nav - nav24h

                return (
                  <tr key={`${cId}-${lender}`}>
                    <td>
                      <div className="flex flex-col text-xs">
                        <span className="font-semibold">{lenderDisplayName(lender)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="text-xs font-semibold">${formatUsd(nav)}</div>
                    </td>
                    <td>
                      <div className="flex flex-col text-xs">
                        <span>${formatUsd(nav24h)}</span>
                        {nav24h !== 0 && (
                          <span className={pnl24h >= 0 ? 'text-success' : 'text-error'}>
                            {((pnl24h / nav24h) * 100).toFixed(2)}%
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="text-xs font-semibold">{apr.toFixed(2)}%</span>
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
                          title={`Health factors: ${healthFactors.map((x) => x.toFixed(2)).join(', ')}`}
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
                          title={`Leverages: ${leverages.map((x) => `${x.toFixed(2)}x`).join(', ')}`}
                        >
                          {maxLev.toFixed(2)}x
                        </span>
                      ) : (
                        <span className="text-xs text-base-content/50">n/a</span>
                      )}
                    </td>
                    <td>
                      <div className="space-y-2 text-xs">
                        <PositionsList title="Assets Long" positions={assetsLong} />
                        <PositionsList title="Assets Short" positions={assetsShort} />
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
