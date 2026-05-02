import { useEffect, useMemo, useRef, useState } from 'react'
import type { RawCurrency } from '../../../../lib/lib-utils'
import { useTokenLists } from '../../../../hooks/useTokenLists'
import { useDebounce } from '../../../../hooks/useDebounce'
import { useAvailableLendingAssets } from '../../../../hooks/lending/useAvailableLendingAssets'

type Preset = 'all' | 'stables' | 'majors'

const STABLE_GROUPS = new Set(['USDC', 'USDT', 'DAI', 'FRAX', 'LUSD', 'USDE', 'USDS', 'GHO', 'CRVUSD', 'PYUSD', 'TUSD'])
const MAJOR_GROUPS = new Set(['ETH', 'BTC', 'WBTC', 'WETH', 'SOL'])

interface Props {
  chainId: string
  selected: string[] // lowercase addresses
  onChange: (next: string[]) => void
  label: string
  placeholder?: string
}

interface PickerToken {
  address: string
  symbol?: string
  name?: string
  logoURI?: string
  assetGroup?: string
}

/**
 * Chip-based multi-token picker driven by `/v1/data/token/available` —
 * the canonical list of assets the optimizer can actually price/lend on
 * a given chain. Token-list data (icons, decimals) is merged in from the
 * regular chain token list when the available endpoint omits it.
 */
export function TokenMultiPicker({ chainId, selected, onChange, label, placeholder = 'Add token...' }: Props) {
  const { assets, isLoading: assetsLoading } = useAvailableLendingAssets({ chainId })
  const { data: tokens } = useTokenLists(chainId)

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
      map.set(addrLower, {
        address: addrLower,
        symbol: a.symbol ?? fromList?.symbol,
        name: a.name ?? fromList?.name,
        logoURI: a.logoURI ?? fromList?.logoURI,
        assetGroup: a.assetGroup ?? fromList?.assetGroup,
      })
    }
    return map
  }, [assets, tokens])

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

  const toggle = (addr: string) => {
    const a = addr.toLowerCase()
    if (selected.includes(a)) onChange(selected.filter((x) => x !== a))
    else onChange([...selected, a])
  }

  const remove = (addr: string) => onChange(selected.filter((x) => x !== addr.toLowerCase()))

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
    const a = addr.toLowerCase()
    if (assetMap.has(a)) return assetMap.get(a)
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
                {t?.logoURI && <img src={t.logoURI} alt="" className="w-3 h-3 rounded-full" />}
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
              <span className="ml-auto text-[10px] text-base-content/50 self-center">
                {assetsLoading ? 'loading…' : `${assetMap.size} lendable`}
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
                    {t.logoURI && <img src={t.logoURI} alt="" className="w-5 h-5 rounded-full" />}
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
