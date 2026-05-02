import React from 'react'
import type { RawCurrency } from '../../../types/currency'

interface NativeCurrencySelectorProps {
  wrappedSymbol: string
  nativeToken: RawCurrency
  /** true = native selected, false = wrapped (default) */
  useNative: boolean
  onChange: (useNative: boolean) => void
  label: string
}

export const NativeCurrencySelector: React.FC<NativeCurrencySelectorProps> = ({
  wrappedSymbol,
  nativeToken,
  useNative,
  onChange,
  label,
}) => {
  return (
    <div className="form-control">
      <label className="label-text text-xs mb-1">{label}</label>
      <div className="flex gap-1.5">
        <button
          type="button"
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors border cursor-pointer ${
            !useNative
              ? 'border-primary bg-primary/10 ring-1 ring-primary'
              : 'border-base-300 bg-base-200/50 hover:bg-base-200'
          }`}
          onClick={() => onChange(false)}
        >
          <span className="font-medium">{wrappedSymbol}</span>
        </button>
        <button
          type="button"
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors border cursor-pointer ${
            useNative
              ? 'border-primary bg-primary/10 ring-1 ring-primary'
              : 'border-base-300 bg-base-200/50 hover:bg-base-200'
          }`}
          onClick={() => onChange(true)}
        >
          {nativeToken.logoURI && (
            <img
              src={nativeToken.logoURI}
              width={14}
              height={14}
              alt={nativeToken.symbol}
              className="rounded-full object-contain w-3.5 h-3.5 token-logo"
            />
          )}
          <span className="font-medium">{nativeToken.symbol}</span>
        </button>
      </div>
    </div>
  )
}
