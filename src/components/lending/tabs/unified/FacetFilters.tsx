import React from 'react'
import type { EarnFacets } from '../../../../sdk/earn-helper'
import { MultiSelectDropdown } from './MultiSelectDropdown'

export interface FacetSelection {
  /**
   * Protocol brands — the ONLY venue filter this UI offers.
   *
   * `facets.venues` is per-MARKET (`MORPHO_BLUE_<32-byte id>`, `FLUID_1_11`),
   * and offering it was a mistake: with brand labels applied it rendered seven
   * consecutive entries all reading "Morpho Blue", indistinguishable and
   * individually useless. Nobody browses for one Morpho market. One "Morpho
   * Blue" entry that selects every market of that lender is the filter people
   * actually want.
   *
   * The `venue` param still exists server-side for API callers that DO know a
   * specific market id — it just has no control here.
   */
  /** Protocol display names — groups a curated vault with its own stack. */
  protocols: string[]
  /**
   * Curator names — third parties that RUN an instance (Steakhouse, Gauntlet).
   *
   * Fed by `facets.curators`, NOT `facets.brands`. `brand` is "curator where
   * there is one, else the protocol", so a brands-fed control listed Ethena,
   * Lido, Fluid and Silo as curators — none of which curate anything.
   */
  curators: string[]
  /** Reserved: `brand` remains a valid server filter but has no control. */
  brands: string[]
  /** Reserved for a deep link that names exact markets; no UI control. */
  venues: string[]
  venueKind?: string
  assetGroup?: string
  /** Underlying symbol — the usable asset filter. */
  assetSymbol?: string
  depositableOnly: boolean
  /** Show rows whose whole yield is the asset's own. Default false. */
  includePassthrough: boolean
  /** Show rows that claim an instant exit but report zero liquidity. */
  includeIlliquid: boolean
  /** Drop the server's TVL floor. */
  showLowTvl: boolean
}

interface FacetFiltersProps {
  facets: EarnFacets
  /** Per-default removal counts — each toggle renders its own. */
  excluded: { passthrough: number; illiquid: number; lowTvl: number; highRisk: number }
  selection: FacetSelection
  onChange: (next: FacetSelection) => void
  isFetching?: boolean
}

export const EMPTY_SELECTION: FacetSelection = {
  protocols: [],
  curators: [],
  brands: [],
  venues: [],
  depositableOnly: false,
  includePassthrough: false,
  includeIlliquid: false,
  showLowTvl: false,
}

/**
 * Every control here is rendered from `facets` — the server's own vocabulary.
 *
 * There is deliberately **no constant in this file** listing venues, providers,
 * lenders, asset groups or exit modes. The moment one appears, a newly
 * integrated protocol becomes invisible in this app until someone redeploys the
 * frontend, which is the failure mode `sdk/vaults-helper/types.ts` already has
 * (its `VAULT_PROVIDERS` is two providers behind the SDK).
 *
 * Everything is a dropdown rather than inline chips: a single chain carries 60+
 * venues, which as chips pushed the table three screens down and wrapped every
 * `MORPHO_BLUE_<32-byte id>` across two lines. Brand is the default axis —
 * nobody filters by "this one Morpho Blue market", they filter by "Morpho" —
 * with the exact-venue list kept behind its own control for when they do.
 */
export const FacetFilters: React.FC<FacetFiltersProps> = ({
  facets,
  excluded,
  selection,
  onChange,
  isFetching,
}) => {
  const set = (patch: Partial<FacetSelection>) => onChange({ ...selection, ...patch })

  const hasFilters =
    selection.protocols.length > 0 ||
    selection.curators.length > 0 ||
    selection.brands.length > 0 ||
    selection.venues.length > 0 ||
    !!selection.venueKind ||
    !!selection.assetGroup ||
    !!selection.assetSymbol ||
    selection.depositableOnly ||
    selection.includePassthrough ||
    selection.includeIlliquid ||
    selection.showLowTvl

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Kind — from facets, so a chain with only vaults offers only vaults. */}
      {facets.venueKinds.length > 1 && (
        <div role="tablist" className="tabs tabs-boxed tabs-xs">
          <button
            type="button"
            role="tab"
            className={`tab ${!selection.venueKind ? 'tab-active' : ''}`}
            onClick={() => set({ venueKind: undefined })}
          >
            All
          </button>
          {facets.venueKinds.map((b) => (
            <button
              key={b.key}
              type="button"
              role="tab"
              className={`tab ${selection.venueKind === b.key ? 'tab-active' : ''}`}
              title={b.description}
              onClick={() =>
                set({
                  venueKind: selection.venueKind === b.key ? undefined : b.key,
                })
              }
            >
              <span className="max-w-[9rem] truncate">{b.label ?? b.key}</span>
              <span className="ml-1 tabular-nums text-base-content/50">{b.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Protocol = what it is built on (Morpho, Euler, Aave). Curator =
          who runs it (Steakhouse, Gauntlet). Both are useful axes and they
          are NOT the same question. */}
      <MultiSelectDropdown
        placeholder="All protocols"
        options={facets.protocols}
        selected={selection.protocols}
        onChange={(protocols) => set({ protocols })}
      />

      {/* Hidden entirely when nothing in view is curated — an empty dropdown
          reads as a broken control, and on a chain with no curated vaults the
          honest answer is that the axis does not apply. */}
      {facets.curators.length > 0 && (
        <MultiSelectDropdown
          placeholder="All curators"
          options={facets.curators}
          selected={selection.curators}
          onChange={(curators) => set({ curators })}
        />
      )}

      {/* Keyed on SYMBOL: `assetGroup` is null on most rows, which left this
          dropdown nearly empty. The server takes one at a time, so keep the
          most recent pick. */}
      <MultiSelectDropdown
        placeholder="All assets"
        options={facets.assets}
        selected={selection.assetSymbol ? [selection.assetSymbol] : []}
        onChange={(next) => set({ assetSymbol: next[next.length - 1] })}
      />

      <label className="label cursor-pointer gap-2 py-0">
        <input
          type="checkbox"
          className="checkbox checkbox-xs"
          checked={selection.depositableOnly}
          onChange={(e) => set({ depositableOnly: e.target.checked })}
        />
        {/* Opt-in, not the default: hiding un-enterable rows silently is how a
            full-cap market looks like a live one that simply vanished. */}
        <span className="label-text text-xs">Depositable only</span>
      </label>

      {/* DEFAULT-ON filters. Each renders only when it is actually hiding
          something, and always with its count — a filter the user did not ask
          for must at least be visible and reversible. */}
      <DefaultToggle
        label="Show pass-through"
        count={excluded.passthrough}
        checked={selection.includePassthrough}
        onChange={(v) => set({ includePassthrough: v })}
        hint="These venues pay nothing of their own — the yield shown is what the asset already earns in your wallet."
      />
      <DefaultToggle
        label="Show illiquid"
        count={excluded.illiquid}
        checked={selection.includeIlliquid}
        onChange={(v) => set({ includeIlliquid: v })}
        hint="Claims a same-block exit but reports zero liquidity: you can get in, not out. Cooldown vaults are not flagged — being illiquid is their design."
      />
      <DefaultToggle
        label="Show dust"
        count={excluded.lowTvl}
        checked={selection.showLowTvl}
        onChange={(v) => set({ showLowTvl: v })}
        hint="Below the TVL floor. On a near-empty pool the APR is an artefact of rounding, not a rate anyone earns."
      />
      {/* NOT a toggle. Risk tolerance is owned by the selector in the toolbar,
          which every other tab reads too; a second control here meant the two
          could disagree — and did, because this one was the only one the tab
          actually applied, leaving the toolbar selector inert. The count still
          renders, so the ceiling is never silently hiding rows. */}
      {excluded.highRisk > 0 && (
        <span
          className="text-xs text-base-content/50"
          title="Above your risk tolerance (chain, lender or collateral risk). Change it with the risk selector in the toolbar."
        >
          {excluded.highRisk} above risk tolerance
        </span>
      )}

      {isFetching && <span className="loading loading-spinner loading-xs text-base-content/50" />}

      {hasFilters && (
        <button
          type="button"
          className="btn btn-ghost btn-xs text-base-content/50"
          onClick={() => onChange(EMPTY_SELECTION)}
        >
          Clear
        </button>
      )}
    </div>
  )
}

function DefaultToggle({
  label,
  count,
  checked,
  onChange,
  hint,
}: {
  label: string
  count: number
  checked: boolean
  onChange: (v: boolean) => void
  hint: string
}) {
  // Hidden entirely when it is removing nothing — a zero-count switch is noise.
  if (count === 0 && !checked) return null
  return (
    <label className="label cursor-pointer gap-2 py-0" title={hint}>
      <input
        type="checkbox"
        className="checkbox checkbox-xs"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="label-text text-xs">
        {label}
        {count > 0 ? ` (${count})` : ''}
      </span>
    </label>
  )
}
