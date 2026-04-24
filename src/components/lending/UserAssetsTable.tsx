import React, { useMemo } from 'react'
import type { RawCurrency } from '../../types/currency'
import type { TokenBalance } from '../../hooks/lending/useTokenBalances'
import { AssetPopover } from './AssetPopover'
import { EmptyState } from '../common/EmptyState'
import { ErrorAlert } from '../common/ErrorAlert'

function formatUsd(v: number) {
  return v.toLocaleString(undefined, {
    maximumFractionDigits: v < 1000 ? 2 : 0,
  })
}

interface UserAssetsTableProps {
  balances: TokenBalance[]
  isLoading: boolean
  error: any
  tokens: Record<string, RawCurrency>
  filterOwned: boolean
  onFilterOwnedChange: (v: boolean) => void
  selectedAsset: string | null
  onAssetClick: (address: string) => void
}

export const UserAssetsTable: React.FC<UserAssetsTableProps> = ({
  balances,
  isLoading,
  error,
  tokens,
  filterOwned,
  onFilterOwnedChange,
  selectedAsset,
  onAssetClick,
}) => {
  const totalUsd = useMemo(() => balances.reduce((sum, b) => sum + b.balanceUSD, 0), [balances])

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <span className="loading loading-spinner loading-lg" />
      </div>
    )
  }

  if (error) {
    return <ErrorAlert error={error} title="Failed to load balances" />
  }

  if (balances.length === 0) {
    return <EmptyState title="No lending-compatible asset balances found." />
  }

  return (
    <div className="space-y-3 p-3">
      {/* Summary + filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs text-base-content/60">Total Wallet Value (Lending Assets)</div>
          <div className="text-lg font-bold">${formatUsd(totalUsd)}</div>
        </div>
        <label
          className={`flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2 transition-colors ${
            filterOwned
              ? 'border-primary bg-primary/10'
              : 'border-base-300 hover:border-base-content/30'
          }`}
        >
          <input
            type="checkbox"
            className="checkbox checkbox-sm checkbox-primary"
            checked={filterOwned}
            onChange={(e) => onFilterOwnedChange(e.target.checked)}
          />
          <span className="text-xs font-medium select-none">Filter markets to owned assets</span>
        </label>
      </div>

      {/* Table */}
      <div className="rounded-box border border-base-300 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table table-sm table-fixed w-full [&_td]:overflow-hidden [&_th]:overflow-hidden">
            <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-base-100 [&_th]:border-b [&_th]:border-base-300">
              <tr>
                <th className="w-[50%]">Asset</th>
                <th className="w-[25%] text-right">Balance</th>
                <th className="w-[25%] text-right">USD Value</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => {
                const token = tokens[b.address.toLowerCase()]
                const logoURI = token?.logoURI
                const symbol = b.symbol || token?.symbol || ''
                const name = b.name || token?.name || ''

                const isSelected = selectedAsset === b.address.toLowerCase()

                return (
                  <tr
                    key={b.address}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-primary/10' : 'hover:bg-base-200'
                    }`}
                    onClick={() => onAssetClick(b.address)}
                  >
                    <td>
                      <AssetPopover
                        address={b.address}
                        name={name}
                        symbol={symbol}
                        logoURI={logoURI}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-xs truncate">{symbol}</span>
                          {name && name !== symbol && (
                            <span className="text-[10px] text-base-content/60 truncate">
                              {name}
                            </span>
                          )}
                        </div>
                      </AssetPopover>
                    </td>
                    <td className="text-right font-mono text-xs">
                      {Number(b.balance).toLocaleString(undefined, {
                        maximumFractionDigits: 6,
                      })}
                    </td>
                    <td className="text-right text-xs font-semibold">${formatUsd(b.balanceUSD)}</td>
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
