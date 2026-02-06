import { getChainName } from '@1delta/lib-utils'
import React from 'react'
import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect'

interface ChainFilterSelectProps {
  chains: string[]
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
  const uniqueChains = Array.from(new Set(chains)).sort()
  const options: SearchableSelectOption[] = [
    { value: 'all', label: 'All chains' },
    ...uniqueChains.map((c) => ({
      value: c,
      label: getChainName(c),
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
