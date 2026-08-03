import { useEffect, useMemo, useRef, useState } from 'react'
import type { RawCurrency } from '../../../../lib/lib-utils'
import { useTokenLists } from '../../../../hooks/useTokenLists'
import { useDebounce } from '../../../../hooks/useDebounce'
import { useAvailableLendingAssets } from '../../../../hooks/lending/useAvailableLendingAssets'
import { Logo } from '../../../common/Logo'

type Preset = 'all' | 'stables' | 'majors'

const STABLE_GROUPS = new Set(['USDC', 'USDT', 'DAI', 'FRAX', 'LUSD', 'USDE', 'USDS', 'GHO', 'CRVUSD', 'PYUSD', 'TUSD'])
const MAJOR_GROUPS = new Set(['ETH', 'BTC', 'WBTC', 'WETH', 'SOL'])

interface Props {
  /** Chains being optimized across. Two or more switches to asset-group mode. */
  chainIds: string[]
  /**
   * Selected values: lowercase token addresses on a single chain, asset group
   * names (e.g. `USDC`, `ETH`) when several chains are selected.
   */
  selected: string[]
  onChange: (next: string[]) => void
  label: string
  placeholder?: string
}

interface PickerToken {
  /** Token address, or the asset-group name in group mode. */
  address: string
  symbol?: string
  name?: string
  logoURI?: string
  assetGroup?: string
}

/**
 * Chip-based multi-asset picker driven by `/v1/data/token/available` —
 * the canonical list of assets the optimizer can actually price/lend.
 * Token-list data (icons, decimals) is merged in from the regular chain
 * token list when the available endpoint omits it.
 *
 * Two modes, matching what the optimizer endpoint accepts:
 *  - single chain → pick token *addresses*
 *  - several chains → pick asset *groups*, since an address only means
 *    something on one chain and `/pairs/optimize` matches on groups once
 *    `chainIds` holds more than one entry.
 */
export function TokenMultiPicker({ chainIds, selected, onChange, label, placeholder = 'Add token...' }: Props) {
  const isGroupMode = chainIds.length > 1
  const primaryChainId = chainIds[0]
  const { assets, isLoading: assetsLoading } = useAvailableLendingAssets(
    isGroupMode ? { chainIds } : { chainId: primaryChainId }
  )
  const { data: tokens } = useTokenLists(primaryChainId)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [preset, setPreset] = useState<Preset>('all')
  const ref = useRef<HTMLDivElement | null>(null)

  // Close on outside click / escape
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Merge available-assets metadata with the chain token list. The available
  // endpoint is the *source of truth* for which assets show up; the token
  // list just supplies icons / fully qualified names when missing.
  const assetMap = useMemo(() => {
    const map = new Map<string, PickerToken>()
    for (const a of assets) {
      const addrLower = a.address.toLowerCase()
      const fromList = tokens?.[addrLower] as RawCurrency | undefined
      const group = a.assetGroup ?? fromList?.assetGroup

      if (isGroupMode) {
        // Collapse every chain's tokens into one row per group — the same
        // 1000+ assets across five chains become a couple of dozen entries.
        // Keep the first icon/name seen for the group.
        if (!group) continue
        if (map.has(group)) continue
        map.set(group, {
          address: group,
          symbol: group,
          name: a.name ?? fromList?.name,
          logoURI: a.logoURI ?? fromList?.logoURI,
          assetGroup: group,
        })
        continue
      }

      map.set(addrLower, {
        address: addrLower,
        symbol: a.symbol ?? fromList?.symbol,
        name: a.name ?? fromList?.name,
        logoURI: a.logoURI ?? fromList?.logoURI,
        assetGroup: group,
      })
    }
    return map
  }, [assets, tokens, isGroupMode])

  const debouncedQuery = useDebounce(query, 150)

  const rows = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    const out: PickerToken[] = []
    for (const t of assetMap.values()) {
      const group = (t.assetGroup ?? '').toUpperCase()
      if (preset === 'stables' && !STABLE_GROUPS.has(group)) continue
      if (preset === 'majors' && !MAJOR_GROUPS.has(group)) continue
      if (q) {
        const sym = (t.symbol ?? '').toLowerCase()
        const name = (t.name ?? '').toLowerCase()
        if (!sym.includes(q) && !name.includes(q) && !t.address.includes(q)) continue
      }
      out.push(t)
      if (out.length > 250) break
    }
    out.sort((a, b) => (a.symbol ?? '').localeCompare(b.symbol ?? ''))
    return out
  }, [assetMap, debouncedQuery, preset])

  // Addresses are compared lowercased; asset groups are case-sensitive names
  // the backend matches verbatim, so they must NOT be folded.
  const normalize = (v: string) => (isGroupMode ? v : v.toLowerCase())

  const toggle = (addr: string) => {
    const a = normalize(addr)
    if (selected.includes(a)) onChange(selected.filter((x) => x !== a))
    else onChange([...selected, a])
  }

  const remove = (addr: string) => onChange(selected.filter((x) => x !== normalize(addr)))

  const applyPresetAsSelection = (p: Preset) => {
    const next = new Set(selected)
    for (const t of assetMap.values()) {
      const group = (t.assetGroup ?? '').toUpperCase()
      const matchPreset = p === 'stables' ? STABLE_GROUPS.has(group) : p === 'majors' ? MAJOR_GROUPS.has(group) : false
      if (matchPreset) next.add(t.address)
    }
    onChange([...next])
  }

  const lookupSelected = (addr: string): PickerToken | undefined => {
    const a = normalize(addr)
    if (assetMap.has(a)) return assetMap.get(a)
    // In group mode there is no token list to fall back to — an unknown group
    // just renders as its own name via the caller's `?? addr` fallbacks.
    if (isGroupMode) return undefined
    const fromList = tokens?.[a] as RawCurrency | undefined
    if (!fromList) return undefined
    return {
      address: a,
      symbol: fromList.symbol,
      name: fromList.name,
      logoURI: fromList.logoURI,
      assetGroup: fromList.assetGroup,
    }
  }

  return (
    <div className="space-y-1.5" ref={ref}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-base-content/70">{label}</span>
        <div className="flex gap-1">
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => applyPresetAsSelection('stables')}
          >
            + Stables
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => applyPresetAsSelection('majors')}
          >
            + Majors
          </button>
          {selected.length > 0 && (
            <button type="button" className="btn btn-ghost btn-xs text-error" onClick={() => onChange([])}>
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="relative">
        <div
          className="min-h-10 rounded-lg border border-base-300 bg-base-100 p-1.5 flex flex-wrap gap-1 items-center cursor-text"
          onClick={() => setOpen(true)}
        >
          {selected.map((addr) => {
            const t = lookupSelected(addr)
            return (
              <span
                key={addr}
                className="badge badge-neutral gap-1 cursor-default"
                onClick={(e) => e.stopPropagation()}
              >
                <Logo src={t?.logoURI} alt={t?.symbol ?? addr} fallbackText={t?.symbol ?? addr} className="w-3 h-3 rounded-full" />
                {t?.symbol ?? `${addr.slice(0, 6)}…`}
                <button
                  type="button"
                  className="ml-0.5 hover:text-error"
                  onClick={() => remove(addr)}
                  aria-label="Remove"
                >
                  ×
                </button>
              </span>
            )
          })}
          <input
            type="text"
            className="flex-1 min-w-30 bg-transparent outline-none text-sm px-1 py-0.5"
            placeholder={selected.length === 0 ? placeholder : ''}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
          />
        </div>

        {open && (
          <div className="absolute z-30 mt-1 w-full rounded-lg border border-base-300 bg-base-100 shadow-xl overflow-hidden">
            <div className="flex gap-1 p-2 border-b border-base-300">
              {(['all', 'stables', 'majors'] as Preset[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`btn btn-xs ${preset === p ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setPreset(p)}
                >
                  {p}
                </button>
              ))}
              <span
                className="ml-auto text-[10px] text-base-content/50 self-center"
                title={
                  isGroupMode
                    ? 'Across several chains the optimizer matches asset groups rather than individual token addresses.'
                    : undefined
                }
              >
                {assetsLoading
                  ? 'loading…'
                  : isGroupMode
                    ? `${assetMap.size} asset groups`
                    : `${assetMap.size} lendable`}
              </span>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {assetsLoading && <div className="p-3 text-sm text-base-content/60">Loading lendable assets…</div>}
              {!assetsLoading && rows.length === 0 && (
                <div className="p-3 text-sm text-base-content/60">No tokens match</div>
              )}
              {rows.map((t) => {
                const isSel = selected.includes(t.address)
                return (
                  <button
                    type="button"
                    key={t.address}
                    className={`w-full text-left px-3 py-2 hover:bg-base-200 flex items-center gap-2 text-sm ${
                      isSel ? 'bg-primary/10' : ''
                    }`}
                    onClick={() => toggle(t.address)}
                  >
                    <Logo src={t.logoURI} alt={t.symbol ?? t.address} fallbackText={t.symbol ?? t.address} className="w-5 h-5 rounded-full" />
                    <span className="font-medium">{t.symbol ?? t.address.slice(0, 6)}</span>
                    <span className="text-base-content/60 text-xs truncate">{t.name}</span>
                    {t.assetGroup && (
                      <span className="ml-auto text-[10px] uppercase text-base-content/40">{t.assetGroup}</span>
                    )}
                    {isSel && <span className="ml-2 text-primary text-xs">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
