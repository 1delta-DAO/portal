import React from 'react'
import { Logo } from '../../../../common/Logo'
import { abbreviateUsd, formatUsd, formatTokenAmount } from '../../../../../utils/format'
import type { RawCurrency } from '../../../../../types/currency'
import type { UserVaultItem, VaultEntry } from '../../../../../sdk/vaults-helper'
import { PROVIDER_LABELS, PROVIDER_LOGOS } from './helpers'

interface UserVaultsTableProps {
  account?: string
  items: UserVaultItem[]
  /** Catalog rows keyed by lowercase vault address — provides provider + symbol when the position endpoint doesn't tag them. */
  catalogByVault: Map<string, VaultEntry>
  chainTokens: Record<string, RawCurrency>
  isLoading: boolean
  isFetching?: boolean
  error: Error | null
  refetch?: () => void
  onRowClick: (vault: VaultEntry) => void
}

export const UserVaultsTable: React.FC<UserVaultsTableProps> = ({
  account,
  items,
  catalogByVault,
  chainTokens,
  isLoading,
  isFetching,
  error,
  refetch,
  onRowClick,
}) => {
  if (!account) {
    return (
      <div className="w-full p-4">
        <div className="alert alert-info">
          <span>Connect your wallet to see your vault positions.</span>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <span className="loading loading-spinner loading-md" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full p-4">
        <div className="alert alert-error mb-2">
          <span>Failed to load vault positions: {error.message}</span>
        </div>
        {refetch && (
          <button className="btn btn-sm" onClick={refetch}>
            Retry
          </button>
        )}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="w-full">
        <div className="alert alert-info">
          <span>No vault positions yet — pick a vault below to deposit.</span>
        </div>
      </div>
    )
  }

  const totalUsd = items.reduce((sum, it) => sum + (it.balanceUSD ?? 0), 0)

  return (
    <div className="w-full p-0 sm:p-4 space-y-3 sm:space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 className="text-lg font-semibold">Your Vault Positions</h2>
          <span className="text-xs text-base-content/50">
            ${formatUsd(totalUsd)} across {items.length} vault{items.length === 1 ? '' : 's'}
          </span>
        </div>
        {refetch && (
          <button
            className="btn btn-xs btn-ghost self-start md:self-auto"
            onClick={refetch}
            disabled={isFetching}
          >
            {isFetching ? <span className="loading loading-spinner loading-xs" /> : 'Refresh'}
          </button>
        )}
      </div>

      <div className="rounded-box border border-base-300 overflow-hidden">
        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="table table-sm table-fixed w-full [&_td]:overflow-hidden [&_th]:overflow-hidden">
            <thead className="[&_th]:bg-base-100 [&_th]:border-b [&_th]:border-base-300">
              <tr>
                <th className="w-[28%]">Vault</th>
                <th className="w-[16%]">Provider</th>
                <th className="w-[18%]">Position</th>
                <th className="w-[14%]">Shares</th>
                <th className="w-[14%]">Value</th>
                <th className="w-[10%]"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const key = it.vault.toLowerCase()
                const entry = catalogByVault.get(key)
                const provider = entry?.provider
                const underlyingToken = chainTokens[it.underlying.toLowerCase()]
                return (
                  <tr key={key} className="h-14 hover:bg-base-200 transition-colors">
                    <td>
                      <div className="flex items-center gap-2 min-w-0">
                        <Logo
                          src={underlyingToken?.logoURI}
                          alt={underlyingToken?.symbol ?? it.symbol}
                          fallbackText={underlyingToken?.symbol ?? it.symbol}
                          className="rounded-full object-contain w-6 h-6 shrink-0 token-logo"
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium text-sm truncate" title={it.name}>
                            {it.name || it.symbol}
                          </span>
                          <span className="text-[10px] text-base-content/60 truncate">
                            {it.symbol}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {provider ? (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Logo
                            src={PROVIDER_LOGOS[provider]}
                            alt={PROVIDER_LABELS[provider]}
                            fallbackText={PROVIDER_LABELS[provider]}
                            className="rounded-full object-contain w-4 h-4 shrink-0 token-logo"
                          />
                          <span className="text-xs">{PROVIDER_LABELS[provider]}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-base-content/40">—</span>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-col text-xs">
                        <span className="font-semibold">{formatTokenAmount(it.assets)}</span>
                        <span className="text-base-content/60 truncate">
                          {underlyingToken?.symbol ?? ''}
                        </span>
                      </div>
                    </td>
                    <td className="text-xs text-base-content/70">
                      {formatTokenAmount(it.shares)}
                    </td>
                    <td>
                      <span className="text-sm font-semibold" title={`$${formatUsd(it.balanceUSD)}`}>
                        {abbreviateUsd(it.balanceUSD)}
                      </span>
                    </td>
                    <td>
                      {entry && (
                        <button
                          type="button"
                          className="btn btn-xs btn-outline"
                          onClick={() => onRowClick(entry)}
                        >
                          Manage
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile */}
        <div className="md:hidden divide-y divide-base-300">
          {items.map((it) => {
            const key = it.vault.toLowerCase()
            const entry = catalogByVault.get(key)
            const provider = entry?.provider
            const underlyingToken = chainTokens[it.underlying.toLowerCase()]
            return (
              <div key={`m-${key}`} className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Logo
                      src={underlyingToken?.logoURI}
                      alt={underlyingToken?.symbol ?? it.symbol}
                      fallbackText={underlyingToken?.symbol ?? it.symbol}
                      className="rounded-full object-contain w-7 h-7 shrink-0 token-logo"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-sm truncate" title={it.name}>
                        {it.name || it.symbol}
                      </span>
                      {provider && (
                        <span className="text-[10px] text-base-content/60 flex items-center gap-1">
                          <Logo
                            src={PROVIDER_LOGOS[provider]}
                            alt={PROVIDER_LABELS[provider]}
                            fallbackText={PROVIDER_LABELS[provider]}
                            className="rounded-full object-contain w-3 h-3 shrink-0 token-logo"
                          />
                          <span>{PROVIDER_LABELS[provider]}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-sm">{abbreviateUsd(it.balanceUSD)}</div>
                    <div className="text-[10px] text-base-content/50">
                      {formatTokenAmount(it.assets)} {underlyingToken?.symbol ?? ''}
                    </div>
                  </div>
                </div>
                {entry && (
                  <button
                    type="button"
                    className="btn btn-xs btn-outline w-full"
                    onClick={() => onRowClick(entry)}
                  >
                    Manage
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
