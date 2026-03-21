import React from 'react'
import type { Address } from 'viem'
import type { RawCurrency } from '../../types/currency'
import type { TokenRowData } from './types'
import { TokenRow } from './TokenRow'

interface TokenSelectorDropdownModeProps {
  dropdownRef: React.RefObject<HTMLDivElement>
  open: boolean
  setOpen: (v: boolean) => void
  chainId: string
  chains: Record<string, any>
  relevant: Address[]
  rows: TokenRowData[]
  tokensMap: Record<string, RawCurrency>
  balances: any
  prices: any
  balancesLoading: boolean
  pricesLoading: boolean
  userAddress?: string
  searchQuery: string
  setSearchQuery: (v: string) => void
  showSearch: boolean
  listsLoading: boolean
  selected: RawCurrency | undefined
  onChange: (address: Address) => void
}

export const TokenSelectorDropdownMode: React.FC<TokenSelectorDropdownModeProps> = ({
  dropdownRef,
  open,
  setOpen,
  rows,
  searchQuery,
  setSearchQuery,
  showSearch,
  listsLoading,
  selected,
  onChange,
}) => {
  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        className="btn btn-sm btn-ghost gap-1.5 px-2"
        onClick={() => setOpen(!open)}
      >
        {selected ? (
          <>
            <img
              src={selected.logoURI}
              alt={selected.symbol}
              className="w-5 h-5 rounded-full object-contain"
            />
            <span className="font-medium">{selected.symbol}</span>
          </>
        ) : (
          <span className="text-base-content/50">Select token</span>
        )}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1 w-80 max-h-96 bg-base-100 border border-base-300 rounded-box shadow-xl overflow-hidden flex flex-col">
          {showSearch && (
            <div className="p-2 border-b border-base-300">
              <input
                className="input input-bordered input-sm w-full"
                placeholder="Search by name, symbol, or address"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-1">
            {listsLoading ? (
              <div className="flex justify-center py-4">
                <span className="loading loading-spinner loading-sm" />
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center py-4 text-base-content/50 text-sm">
                No tokens found
              </div>
            ) : (
              <div className="space-y-0.5">
                {rows.map((row) => (
                  <TokenRow
                    key={row.addr}
                    token={row.token}
                    balanceAmount={row.balanceAmount}
                    usdValue={row.usdValue}
                    price={row.price}
                    isSelected={false}
                    onClick={() => {
                      onChange(row.addr as Address)
                      setSearchQuery('')
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
