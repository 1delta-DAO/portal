import React, { useCallback, useMemo, useRef, useState } from 'react'
import type { LenderData, LenderInfoMap } from '../../hooks/lending/usePoolData'
import type { UserDataResult } from '../../hooks/lending/useUserData'
import { computeLenderTvl } from '../../utils/format'
import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect'

/* ── Hook: shared lender selection logic ── */

interface UseLenderSelectorParams {
  lenderData: LenderData | undefined
  lenderInfoMap?: LenderInfoMap
  userData: UserDataResult
  chainId: string
  initialLender?: string
  onLenderChange?: (lender: string) => void
}

export function useLenderSelector({
  lenderData,
  lenderInfoMap,
  userData,
  chainId,
  initialLender,
  onLenderChange,
}: UseLenderSelectorParams) {
  const allLenderKeys = useMemo(() => Object.keys(lenderData ?? {}), [lenderData])

  const [selectedLender, _setSelectedLender] = useState<string>(initialLender || '')
  const setSelectedLender = useCallback(
    (lender: string) => {
      _setSelectedLender(lender)
      onLenderChange?.(lender)
    },
    [onLenderChange]
  )

  // Per-lender user balance (deposits + debt) for sorting & markers
  const lenderBalances = useMemo(() => {
    const map = new Map<string, number>()
    if (!userData.raw) return map
    for (const entry of userData.raw) {
      if (entry.chainId !== chainId) continue
      const total = entry.balanceData.deposits + entry.balanceData.debt
      if (total > 0) map.set(entry.lender, total)
    }
    return map
  }, [userData, chainId])

  // Lenders sorted: those with balance first (by balance desc), then the rest by TVL desc
  const lenders = useMemo(() => {
    return [...allLenderKeys].sort((a, b) => {
      const balA = lenderBalances.get(a) ?? 0
      const balB = lenderBalances.get(b) ?? 0
      if (balA > 0 && balB > 0) return balB - balA
      if (balA > 0) return -1
      if (balB > 0) return 1
      return computeLenderTvl(lenderData?.[b] ?? []) - computeLenderTvl(lenderData?.[a] ?? [])
    })
  }, [allLenderKeys, lenderBalances, lenderData])

  // Lender options for searchable dropdown (with icons)
  const lenderOptions: SearchableSelectOption[] = lenders.map((l) => {
    const info = lenderInfoMap?.[l]
    return {
      value: l,
      label: info?.name ?? l,
      icon: info?.logoURI ?? `https://raw.githubusercontent.com/1delta-DAO/protocol-icons/main/lender/${l.toLowerCase()}.webp`,
      indicator: lenderBalances.has(l) ? '\u25CF ' : undefined,
    }
  })

  // Stable key for lender list to avoid useEffect dependency array issues
  const lendersKey = lenders.join(',')

  // Track latest selectedLender without it being an effect dependency
  const selectedLenderRef = useRef(selectedLender)
  selectedLenderRef.current = selectedLender

  // Auto-select lender: prefer initialLender from URL, then first in sorted list.
  // Only reacts to lender list or URL changes — NOT to selectedLender changes
  // (to avoid feedback loop with URL sync).
  React.useEffect(() => {
    if (lenders.length === 0) return
    if (initialLender && lenders.includes(initialLender)) {
      _setSelectedLender(initialLender)
    } else if (!lenders.includes(selectedLenderRef.current)) {
      _setSelectedLender(lenders[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lendersKey, initialLender])

  return {
    selectedLender,
    setSelectedLender,
    lenders,
    lenderOptions,
    lenderBalances,
  }
}

/* ── Component: lender selector UI ── */

interface LenderSelectorProps {
  lenderOptions: SearchableSelectOption[]
  selectedLender: string
  onChange: (lender: string) => void
  hasBalances: boolean
}

export const LenderSelector: React.FC<LenderSelectorProps> = ({
  lenderOptions,
  selectedLender,
  onChange,
  hasBalances,
}) => (
  <div className="flex flex-wrap items-center gap-2">
    <label className="text-sm font-medium shrink-0">Lender:</label>
    <SearchableSelect
      options={lenderOptions}
      value={selectedLender}
      onChange={onChange}
      placeholder="Search lenders..."
    />
    {hasBalances && (
      <span className="text-xs text-base-content/50 shrink-0">{'\u25CF'} = has balance</span>
    )}
  </div>
)
