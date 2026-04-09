import React, { useMemo } from 'react'
import type { LenderData, LenderInfoMap, LenderSummary } from '../../hooks/lending/usePoolData'
import type { UserDataResult } from '../../hooks/lending/useUserData'
import { abbreviateUsd, computeLenderTvl, formatUsd } from '../../utils/format'
import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect'

/* ── Hook: lender dropdown options + balance markers ──
 *
 * This hook is now **fully controlled** — the parent owns `selectedLender`
 * (typically `LendingTab`, which keeps it in sync with the URL). The hook
 * just builds the sorted dropdown options and computes which lenders have
 * a non-zero user balance.
 *
 * The auto-selection of an initial lender (when there's no value in the
 * URL or the URL value is invalid) lives in the parent so it can run
 * before `useLendingLatest` is even called — that lets the parent fetch
 * just the selected lender's data instead of all of them.
 */

interface UseLenderSelectorParams {
  /**
   * Lightweight per-lender summaries from `useLenders`. Preferred source —
   * lets the dropdown render before the heavy per-market `lenderData` lands
   * and uses the server-computed `tvlUsd` for sorting.
   */
  lenderSummaries?: LenderSummary[]
  /**
   * Heavy per-market data — used as a fallback for callers that don't yet
   * plumb summaries through, and for sort tiebreakers when summaries are
   * absent.
   */
  lenderData?: LenderData
  lenderInfoMap?: LenderInfoMap
  userData: UserDataResult
  chainId: string
}

export function useLenderSelector({
  lenderSummaries,
  lenderData,
  lenderInfoMap,
  userData,
  chainId,
}: UseLenderSelectorParams) {
  // Server-side TVL when summaries are available, falling back to client-side
  // computation from the heavy per-market data when they aren't yet.
  const tvlByKey = useMemo(() => {
    const map = new Map<string, number>()
    if (lenderSummaries && lenderSummaries.length > 0) {
      for (const s of lenderSummaries) {
        if (s.lenderInfo?.key) map.set(s.lenderInfo.key, s.tvlUsd ?? 0)
      }
      return map
    }
    if (lenderData) {
      for (const [k, markets] of Object.entries(lenderData)) {
        map.set(k, computeLenderTvl(markets))
      }
    }
    return map
  }, [lenderSummaries, lenderData])

  const allLenderKeys = useMemo(() => {
    // Prefer the summary list (already in tvl-desc order from the server) so
    // the dropdown is populated before the heavy per-market data arrives.
    if (lenderSummaries && lenderSummaries.length > 0) {
      return lenderSummaries.map((s) => s.lenderInfo?.key).filter((k): k is string => !!k)
    }
    return Object.keys(lenderData ?? {})
  }, [lenderSummaries, lenderData])

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
      return (tvlByKey.get(b) ?? 0) - (tvlByKey.get(a) ?? 0)
    })
  }, [allLenderKeys, lenderBalances, tvlByKey])

  // Build a (key → LenderInfo) lookup from summaries first, then fall back
  // to the heavy lenderInfoMap. Summaries arrive sooner so the dropdown gets
  // proper names and logos before the per-market data lands.
  const infoByKey = useMemo(() => {
    const map = new Map<string, { name: string; logoURI: string }>()
    if (lenderSummaries) {
      for (const s of lenderSummaries) {
        if (s.lenderInfo?.key) {
          map.set(s.lenderInfo.key, { name: s.lenderInfo.name, logoURI: s.lenderInfo.logoURI })
        }
      }
    }
    if (lenderInfoMap) {
      for (const [k, info] of Object.entries(lenderInfoMap)) {
        if (!map.has(k)) map.set(k, { name: info.name, logoURI: info.logoURI })
      }
    }
    return map
  }, [lenderSummaries, lenderInfoMap])

  // Lender options for searchable dropdown (with icons + TVL trailing)
  const lenderOptions: SearchableSelectOption[] = lenders.map((l) => {
    const info = infoByKey.get(l)
    const tvl = tvlByKey.get(l) ?? 0
    return {
      value: l,
      label: info?.name ?? l,
      icon:
        info?.logoURI ??
        `https://raw.githubusercontent.com/1delta-DAO/protocol-icons/main/lender/${l.toLowerCase()}.webp`,
      indicator: lenderBalances.has(l) ? '\u25CF ' : undefined,
      trailing: tvl > 0 ? abbreviateUsd(tvl) : undefined,
      trailingTitle: tvl > 0 ? `TVL: $${formatUsd(tvl)}` : undefined,
    }
  })

  return {
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
  <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
    <label className="text-sm font-medium shrink-0">Lender:</label>
    <div className="flex-1 min-w-0 sm:flex-none sm:min-w-0">
      <SearchableSelect
        options={lenderOptions}
        value={selectedLender}
        onChange={onChange}
        placeholder="Search lenders..."
      />
    </div>
    {hasBalances && (
      <span className="text-xs text-base-content/50 shrink-0">{'\u25CF'} = has balance</span>
    )}
  </div>
)
