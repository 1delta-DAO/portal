// src/components/filters/ChainFilterSelect.tsx
import { getChainName } from '@1delta/lib-utils'
import React from 'react'

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
  // ensure unique + sorted
  const uniqueChains = Array.from(new Set(chains)).sort()

  return (
    <select
      className={`select select-bordered select-sm ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="all">All chains</option>
      {uniqueChains.map((c) => (
        <option key={c} value={c}>
          {getChainName( c)}
        </option>
      ))}
    </select>
  )
}
