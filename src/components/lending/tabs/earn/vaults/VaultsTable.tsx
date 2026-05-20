import React from 'react'
import { Logo } from '../../../../common/Logo'
import { TableEmptyRow } from '../../../../common/TableEmptyRow'
import { abbreviateUsd, abbreviateNumber, formatUsd } from '../../../../../utils/format'
import type { RawCurrency } from '../../../../../types/currency'
import type { VaultEntry } from '../../../../../sdk/vaults-helper'
import {
  PROVIDER_LABELS,
  PROVIDER_LOGOS,
  formatSupplyRate,
  hasLiquidity,
  humanAssets,
  isSupplyRateMeaningful,
  liquidityNative,
  liquidityUsd,
  tvlUsd,
  type VaultSortKey,
} from './helpers'

interface VaultsTableProps {
  vaults: VaultEntry[]
  chainTokens: Record<string, RawCurrency>
  sortKey: VaultSortKey
  sortDir: 'asc' | 'desc'
  onToggleSort: (key: VaultSortKey) => void
  selected: VaultEntry | null
  onRowClick: (entry: VaultEntry) => void
  totalItems: number
  startIndex: number
  endIndex: number
  currentPage: number
  totalPages: number
  onGoToPage: (page: number) => void
}

export const VaultsTable: React.FC<VaultsTableProps> = ({
  vaults,
  chainTokens,
  sortKey,
  sortDir,
  onToggleSort,
  selected,
  onRowClick,
  totalItems,
  startIndex,
  endIndex,
  currentPage,
  totalPages,
  onGoToPage,
}) => {
  const isSelected = (e: VaultEntry) =>
    selected !== null && selected.address.toLowerCase() === e.address.toLowerCase()

  const sortIndicator = (key: VaultSortKey) =>
    sortKey === key ? (
      <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>
    ) : null

  const pagination = (
    <div className="flex flex-col gap-2 items-center justify-between md:flex-row px-4 py-2">
      <div className="text-xs text-base-content/70">
        {totalItems === 0 ? (
          'No results'
        ) : (
          <>
            Showing{' '}
            <span className="font-semibold">
              {startIndex + 1}&ndash;{endIndex}
            </span>{' '}
            of <span className="font-semibold">{totalItems}</span> vaults
          </>
        )}
      </div>
      <div className="join">
        <button
          className="btn btn-xs join-item"
          disabled={currentPage === 1}
          onClick={() => onGoToPage(currentPage - 1)}
        >
          &laquo; Prev
        </button>
        <button className="btn btn-xs join-item" disabled>
          Page {currentPage} / {totalPages}
        </button>
        <button
          className="btn btn-xs join-item"
          disabled={currentPage === totalPages}
          onClick={() => onGoToPage(currentPage + 1)}
        >
          Next &raquo;
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex-1 min-w-0 rounded-box border border-base-300 overflow-hidden">
      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="table table-sm table-fixed w-full [&_td]:overflow-hidden [&_th]:overflow-hidden">
          <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-base-100 [&_th]:border-b [&_th]:border-base-300">
            <tr>
              <th className="w-[24%] cursor-pointer" onClick={() => onToggleSort('name')}>
                Vault{sortIndicator('name')}
              </th>
              <th className="w-[14%] cursor-pointer" onClick={() => onToggleSort('provider')}>
                Provider{sortIndicator('provider')}
              </th>
              <th className="w-[12%]">Underlying</th>
              <th className="w-[10%] cursor-pointer" onClick={() => onToggleSort('supplyRate')}>
                APR{sortIndicator('supplyRate')}
              </th>
              <th className="w-[13%] cursor-pointer" onClick={() => onToggleSort('totalAssetsUsd')}>
                TVL{sortIndicator('totalAssetsUsd')}
              </th>
              <th
                className="w-[13%] cursor-pointer"
                onClick={() => onToggleSort('liquidityUsd')}
                title="Withdrawable liquidity"
              >
                Liq.{sortIndicator('liquidityUsd')}
              </th>
              <th className="w-[14%]">Curator</th>
            </tr>
          </thead>
          <tbody>
            {vaults.map((v) => {
              const underlyingToken = chainTokens[v.underlying.toLowerCase()]
              // Underlying token decimals are authoritative; fall back to the
              // catalog's vault decimals (== underlying decimals by ERC-4626).
              const decimals = underlyingToken?.decimals ?? v.decimals
              const sel = isSelected(v)
              const tvlNative = humanAssets(v.totalAssets, decimals)
              const usd = tvlUsd(v, decimals)
              return (
                <tr
                  key={`${v.provider}-${v.address.toLowerCase()}`}
                  className={`h-16 cursor-pointer transition-colors ${
                    sel ? 'bg-primary/10' : 'hover:bg-base-200'
                  }`}
                  onClick={() => onRowClick(v)}
                >
                  <td>
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium truncate" title={v.name}>
                        {v.name || v.symbol || `${v.address.slice(0, 6)}...${v.address.slice(-4)}`}
                      </span>
                      <span className="text-[10px] text-base-content/60 truncate" title={v.symbol}>
                        {v.symbol}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Logo
                        src={PROVIDER_LOGOS[v.provider]}
                        alt={PROVIDER_LABELS[v.provider]}
                        fallbackText={PROVIDER_LABELS[v.provider]}
                        className="rounded-full object-contain w-4 h-4 shrink-0 token-logo"
                      />
                      <span className="text-xs font-medium truncate">
                        {PROVIDER_LABELS[v.provider]}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Logo
                        src={underlyingToken?.logoURI}
                        alt={underlyingToken?.symbol ?? v.underlying}
                        fallbackText={underlyingToken?.symbol ?? v.underlying}
                        className="rounded-full object-contain w-4 h-4 shrink-0 token-logo"
                      />
                      <span className="text-xs font-medium truncate">
                        {underlyingToken?.symbol ?? `${v.underlying.slice(0, 6)}…`}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`text-xs font-semibold ${
                        isSupplyRateMeaningful(v) ? 'text-success' : 'text-base-content/40'
                      }`}
                      title={isSupplyRateMeaningful(v) ? `${v.supplyRate}%` : 'APR not exposed by this provider'}
                    >
                      {formatSupplyRate(v)}
                    </span>
                  </td>
                  <td>
                    <div className="flex flex-col text-xs">
                      <span className="font-semibold" title={usd ? `$${formatUsd(usd)}` : undefined}>
                        {usd
                          ? abbreviateUsd(usd)
                          : `${abbreviateNumber(tvlNative)} ${underlyingToken?.symbol ?? ''}`}
                      </span>
                      {usd > 0 && (
                        <span
                          className="text-base-content/60 truncate"
                          title={`${tvlNative} ${underlyingToken?.symbol ?? ''}`}
                        >
                          {abbreviateNumber(tvlNative)} {underlyingToken?.symbol ?? ''}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    {hasLiquidity(v) ? (
                      (() => {
                        const liqNative = liquidityNative(v, decimals)
                        const liqUsd = liquidityUsd(v, decimals)
                        return (
                          <div className="flex flex-col text-xs">
                            <span
                              className="font-semibold"
                              title={liqUsd ? `$${formatUsd(liqUsd)}` : undefined}
                            >
                              {liqUsd
                                ? abbreviateUsd(liqUsd)
                                : `${abbreviateNumber(liqNative)} ${underlyingToken?.symbol ?? ''}`}
                            </span>
                            {liqUsd > 0 && (
                              <span
                                className="text-base-content/60 truncate"
                                title={`${liqNative} ${underlyingToken?.symbol ?? ''}`}
                              >
                                {abbreviateNumber(liqNative)} {underlyingToken?.symbol ?? ''}
                              </span>
                            )}
                          </div>
                        )
                      })()
                    ) : (
                      <span className="text-xs text-base-content/40">—</span>
                    )}
                  </td>
                  <td>
                    <span
                      className="text-xs text-base-content/70 truncate inline-block max-w-full"
                      title={v.curator ?? ''}
                    >
                      {v.curator ?? '—'}
                    </span>
                  </td>
                </tr>
              )
            })}
            {totalItems === 0 && (
              <TableEmptyRow colSpan={7}>No vaults match your filters.</TableEmptyRow>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="md:hidden divide-y divide-base-300">
        {vaults.length === 0 && totalItems === 0 && (
          <div className="text-center py-6 text-sm text-base-content/60">
            No vaults match your filters.
          </div>
        )}

        {vaults.map((v) => {
          const underlyingToken = chainTokens[v.underlying.toLowerCase()]
          const decimals = underlyingToken?.decimals ?? v.decimals
          const sel = isSelected(v)
          const tvlNative = humanAssets(v.totalAssets, decimals)
          const usd = tvlUsd(v, decimals)
          return (
            <div
              key={`m-${v.provider}-${v.address.toLowerCase()}`}
              className={`p-3 cursor-pointer transition-colors ${
                sel ? 'bg-primary/10' : 'active:bg-base-200'
              }`}
              onClick={() => onRowClick(v)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Logo
                    src={underlyingToken?.logoURI}
                    alt={underlyingToken?.symbol ?? v.underlying}
                    fallbackText={underlyingToken?.symbol ?? v.underlying}
                    className="rounded-full object-contain w-7 h-7 shrink-0 token-logo"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-sm truncate" title={v.name}>
                      {v.name || v.symbol}
                    </span>
                    <span
                      className="text-[10px] text-base-content/60 flex items-center gap-1 min-w-0"
                      title={PROVIDER_LABELS[v.provider]}
                    >
                      <Logo
                        src={PROVIDER_LOGOS[v.provider]}
                        alt={PROVIDER_LABELS[v.provider]}
                        fallbackText={PROVIDER_LABELS[v.provider]}
                        className="rounded-full object-contain w-3 h-3 shrink-0 token-logo"
                      />
                      <span className="truncate">{PROVIDER_LABELS[v.provider]}</span>
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className={`font-bold text-sm ${
                      isSupplyRateMeaningful(v) ? 'text-success' : 'text-base-content/40'
                    }`}
                  >
                    {formatSupplyRate(v)}
                  </div>
                  <span className="text-[10px] text-base-content/50 block">Supply APR</span>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-base-content/70 gap-2">
                <span>
                  TVL:{' '}
                  <span className="font-medium text-base-content">
                    {usd
                      ? abbreviateUsd(usd)
                      : `${abbreviateNumber(tvlNative)} ${underlyingToken?.symbol ?? ''}`}
                  </span>
                </span>
                {hasLiquidity(v) && (
                  <span>
                    Liq:{' '}
                    <span className="font-medium text-base-content">
                      {(() => {
                        const liqUsd = liquidityUsd(v, decimals)
                        const liqNative = liquidityNative(v, decimals)
                        return liqUsd
                          ? abbreviateUsd(liqUsd)
                          : `${abbreviateNumber(liqNative)} ${underlyingToken?.symbol ?? ''}`
                      })()}
                    </span>
                  </span>
                )}
                {v.curator && (
                  <span className="truncate ml-2" title={v.curator}>
                    {v.curator}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {pagination}
    </div>
  )
}
