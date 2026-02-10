// src/components/UserLenderPositionsTable.tsx
import React from 'react'
import { lenderDisplayName } from '@1delta/lib-utils'
import type { RawCurrency } from '@1delta/lib-utils'
import type {
  UserDataResult,
  LenderUserDataEntry,
  UserSubAccount,
  UserPositionEntry,
} from '../../hooks/lending/useUserData'
import { useTokenLists } from '../../hooks/useTokenLists'
import { abbreviateUsd } from '../../utils/format'

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

/** Collect positions from a single sub-account with collateral/debt tags */
function collectSubAccountPositions(sub: UserSubAccount): TaggedPosition[] {
  const result: TaggedPosition[] = []
  for (const pos of extractPositions(sub.positions)) {
    if (Number(pos.deposits) > 0) {
      result.push({ ...pos, tag: 'collateral' })
    }
    if (Number(pos.debt) > 0) {
      result.push({ ...pos, tag: 'debt' })
    }
  }
  return result
}

const PositionsList: React.FC<{ positions: TaggedPosition[]; tokens: Record<string, RawCurrency> }> = ({ positions, tokens }) => {
  if (positions.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {positions.map((pos) => {
        const token = tokens[pos.underlying.toLowerCase()]
        const symbol = token?.symbol ?? ''
        const name = token?.name ?? ''
        const tooltip = name && name !== symbol ? `${name} (${symbol})` : symbol || pos.underlying

        return (
          <div
            key={`${pos.marketUid}-${pos.tag}`}
            className="badge badge-outline badge-sm flex gap-1 items-center"
            title={tooltip}
          >
            <span
              className={`text-[9px] font-bold uppercase ${
                pos.tag === 'debt' ? 'text-error' : 'text-success'
              }`}
            >
              {pos.tag}
            </span>
            {token?.logoURI ? (
              <img src={token.logoURI} alt={symbol} className="w-3.5 h-3.5 rounded-full" />
            ) : null}
            <span className="text-[10px]">
              {symbol || `${pos.underlying.slice(0, 6)}...${pos.underlying.slice(-4)}`}
            </span>
            <span className="opacity-70">
              {pos.tag === 'debt'
                ? `${Number(pos.debt || 0).toFixed(4)} ($${formatUsd(pos.debtUSD)})`
                : `${Number(pos.deposits || 0).toFixed(4)} ($${formatUsd(pos.depositsUSD)})`}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function HealthBadge({ health }: { health: number | null }) {
  if (health == null) return <span className="text-xs text-base-content/50">n/a</span>
  return (
    <span
      className={`badge badge-sm ${
        health < 1.1
          ? 'badge-error'
          : health < 1.3
            ? 'badge-warning'
            : 'badge-success'
      }`}
    >
      {health.toFixed(2)}
    </span>
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
  const { data: tokens } = useTokenLists(chainId)
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
            Grouped by lender, with sub-accounts shown separately.
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

      {/* Per-lender groups with sub-account rows */}
      <div className="rounded-box border border-base-300 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table table-zebra table-sm w-full">
            <thead>
              <tr>
                <th>Lender / Account</th>
                <th>NAV</th>
                <th>Deposits</th>
                <th>Debt</th>
                <th>APR</th>
                <th>Health</th>
                <th>Positions</th>
              </tr>
            </thead>
            <tbody>
              {lenderEntries.map((entry) => {
                const subs = entry.data.filter(
                  (sub) => extractPositions(sub.positions).length > 0 || sub.balanceData.nav !== 0
                )
                const hasSingleSub = subs.length <= 1

                return (
                  <React.Fragment key={`${entry.chainId}-${entry.lender}`}>
                    {/* Lender header row */}
                    <tr className="bg-base-200/50">
                      <td colSpan={hasSingleSub ? 1 : 7}>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">
                            {lenderDisplayName(entry.lender)}
                          </span>
                          {!hasSingleSub && (
                            <span className="text-xs text-base-content/50">
                              {subs.length} accounts
                            </span>
                          )}
                        </div>
                      </td>
                      {hasSingleSub && (
                        <>
                          <td className="text-xs font-semibold">
                            {abbreviateUsd(entry.netWorth)}
                          </td>
                          <td className="text-xs">
                            {abbreviateUsd(entry.totalDepositsUSD)}
                          </td>
                          <td className="text-xs">
                            {abbreviateUsd(entry.totalDebtUSD)}
                          </td>
                          <td className="text-xs font-semibold">
                            {entry.netApr.toFixed(2)}%
                          </td>
                          <td>
                            <HealthBadge health={entry.healthFactor} />
                          </td>
                          <td>
                            <PositionsList
                              positions={collectSubAccountPositions(subs[0] ?? entry.data[0])}
                              tokens={tokens}
                            />
                          </td>
                        </>
                      )}
                    </tr>

                    {/* Sub-account rows (only when multiple) */}
                    {!hasSingleSub &&
                      subs.map((sub, idx) => {
                        const positions = collectSubAccountPositions(sub)
                        const bal = sub.balanceData
                        return (
                          <tr key={sub.accountId}>
                            <td className="pl-6">
                              <span className="text-xs font-medium text-base-content/70">
                                #{idx + 1}
                              </span>
                              <span className="text-[10px] text-base-content/40 ml-1" title={sub.accountId}>
                                {sub.accountId.slice(0, 8)}...
                              </span>
                            </td>
                            <td className="text-xs font-semibold">
                              {abbreviateUsd(bal.nav)}
                            </td>
                            <td className="text-xs">
                              {abbreviateUsd(bal.deposits)}
                            </td>
                            <td className="text-xs">
                              {abbreviateUsd(bal.debt)}
                            </td>
                            <td className="text-xs font-semibold">
                              {sub.aprData.apr.toFixed(2)}%
                            </td>
                            <td>
                              <HealthBadge health={sub.health} />
                            </td>
                            <td>
                              <PositionsList positions={positions} tokens={tokens} />
                            </td>
                          </tr>
                        )
                      })}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
