import React from 'react'
import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect'
import type { ChainMeta } from '../../../hooks/useChains'

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
}) => {
  const uniqueChains = Array.from(new Map(chains.map((c) => [c.chainId, c])).values()).sort(
    (a, b) => a.chainId.localeCompare(b.chainId)
  )
  const options: SearchableSelectOption[] = [
    { value: 'all', label: 'All chains' },
    ...uniqueChains.map((c) => ({
      value: c.chainId,
      label: c.name,
      icon: c.logoURI,
    })),
  ]

  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder="Search chains..."
      className={className}
    />
  )
}
