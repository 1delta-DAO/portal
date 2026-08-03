import React from 'react'
import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect'
import { Logo } from '../../common/Logo'
import type { ChainMeta } from '../../../hooks/useChains'

/**
 * Chain options are deliberately *not* prefixed with an "All chains" entry.
 * The backend answers `chains=all` with `success: true` and zero items on
 * every lending endpoint, so the old option silently emptied the tab instead
 * of widening it. Multi-chain browsing goes through {@link ChainMultiSelect}.
 */
function toOptions(chains: ChainMeta[]): SearchableSelectOption[] {
  return Array.from(new Map(chains.map((c) => [c.chainId, c])).values())
    .sort((a, b) => a.chainId.localeCompare(b.chainId))
    .map((c) => ({ value: c.chainId, label: c.name, icon: c.logoURI }))
}

interface ChainFilterSelectProps {
  chains: ChainMeta[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export const ChainFilterSelect: React.FC<ChainFilterSelectProps> = ({
  chains,
  value,
  onChange,
  className = '',
}) => (
  <SearchableSelect
    options={toOptions(chains)}
    value={value}
    onChange={onChange}
    placeholder="Search chains..."
    className={className}
  />
)

interface ChainMultiSelectProps {
  chains: ChainMeta[]
  values: string[]
  onChange: (values: string[]) => void
  /** Hard cap on simultaneously selected chains. */
  maxChains: number
  className?: string
}

/**
 * Multi-chain picker for the tabs that browse across chains (Earn, Optimizer).
 *
 * Selecting chains only rewrites the URL — it never switches the connected
 * wallet network. The wallet is reconciled at transaction time against the
 * chain of the row the user acted on.
 */
export const ChainMultiSelect: React.FC<ChainMultiSelectProps> = ({
  chains,
  values,
  onChange,
  maxChains,
  className = '',
}) => (
  <SearchableSelect
    multiple
    options={toOptions(chains)}
    values={values}
    onChange={onChange}
    maxSelected={maxChains}
    maxSelectedHint={`Up to ${maxChains} chains at a time — deselect one to swap.`}
    placeholder="Search chains..."
    className={className}
    renderLabel={(selected) => (
      <>
        <span className="flex -space-x-1.5 shrink-0">
          {selected.slice(0, 3).map((o) => (
            <Logo
              key={o.value}
              src={o.icon}
              alt={o.label}
              fallbackText={o.label}
              className="w-4 h-4 rounded-full ring-1 ring-base-100 token-logo"
            />
          ))}
        </span>
        <span className="truncate">
          {selected.length === 0
            ? 'Select chains'
            : selected.length === 1
              ? selected[0].label
              : `${selected.length} chains`}
        </span>
      </>
    )}
  />
)
