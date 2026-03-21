import { getChainShortName } from '../../lib/lib-utils'
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
      label: getChainShortName(c),
      icon: `https://raw.githubusercontent.com/1delta-DAO/chains/main/${c}.webp`,
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
