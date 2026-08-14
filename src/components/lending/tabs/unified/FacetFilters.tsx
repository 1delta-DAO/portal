import React from 'react'
import type { EarnFacetBucket, EarnFacets } from '../../../../sdk/earn-helper'
import { MultiSelectDropdown } from './MultiSelectDropdown'
import { formatUsdShort, parseMinTvl, resolveAssetFilter } from './filterParsing'

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
  /** Underlying symbol — exact match, chosen from the facet list. */
  assetSymbol?: string
  /**
   * Underlying token ADDRESS.
   *
   * Separate from `assetSymbol` because they answer different questions and
   * only one of them is unambiguous: three unrelated tokens ship as `USD3`
   * and three more as `USDP`, so a symbol cannot always name the thing the
   * user means, and a token whose ticker they do not know cannot be named at
   * all. Both are sent as-is; the server matches each exactly.
   */
  asset?: string
  /**
   * Free text, ranked exact-first by the server across a row's name, brand,
   * curator, protocol and asset symbol.
   *
   * The third and loosest of the three "which rows" controls, and the only one
   * that can find a row by what it is CALLED. `assetSymbol` and `asset` both
   * filter on the deposit token, so before this existed a listing of vaults
   * could not be searched by vault name at all.
   */
  search?: string
  depositableOnly: boolean
  /** Show rows whose whole yield is the asset's own. Default false. */
  includePassthrough: boolean
  /** Show rows that claim an instant exit but report zero liquidity. */
  includeIlliquid: boolean
  /**
   * TVL floor in USD. `undefined` keeps the server's default, `0` removes the
   * floor entirely.
   *
   * This used to be a boolean "show dust", which could only turn the default
   * off — there was no way to see the floor in force, and no way to raise it.
   * A listing spanning $4 to $364M needs a number, not a switch.
   */
  minTvlUsd?: number
}

interface FacetFiltersProps {
  facets: EarnFacets
  /** Per-default removal counts — each toggle renders its own. */
  excluded: { passthrough: number; illiquid: number; lowTvl: number; highRisk: number }
  selection: FacetSelection
  onChange: (next: FacetSelection) => void
  isFetching?: boolean
  /**
   * The TVL floor the server applies when none is sent — read from the
   * response, never restated here. A local constant would keep rendering
   * "10,000" for as long as it took anyone to notice the server had moved.
   */
  defaultMinTvlUsd?: number
}

export const EMPTY_SELECTION: FacetSelection = {
  protocols: [],
  curators: [],
  brands: [],
  venues: [],
  depositableOnly: false,
  includePassthrough: false,
  includeIlliquid: false,
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
  defaultMinTvlUsd,
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
    !!selection.asset ||
    !!selection.search ||
    selection.depositableOnly ||
    selection.includePassthrough ||
    selection.includeIlliquid ||
    selection.minTvlUsd !== undefined

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
        onChange={(next) => set({ assetSymbol: next[next.length - 1], asset: undefined })}
      />

      <AssetInput
        options={facets.assets}
        assetSymbol={selection.assetSymbol}
        asset={selection.asset}
        search={selection.search}
        onChange={(next) => set(next)}
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
      <MinTvlInput
        value={selection.minTvlUsd}
        serverDefault={defaultMinTvlUsd}
        excludedCount={excluded.lowTvl}
        onChange={(minTvlUsd) => set({ minTvlUsd })}
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

/**
 * The TVL floor, as a number.
 *
 * Three states, and they are genuinely different: EMPTY means "whatever the
 * server does by default" (and the placeholder says what that is), `0` means
 * "no floor at all", and any other number is an explicit floor. A boolean
 * could express only the first two, so there was no way to ask for a higher
 * bar — and no way to see the one in force.
 *
 * Committed on blur or Enter rather than per keystroke: every change re-keys
 * the per-chain queries and refetches the listing, so typing "25000" would
 * fire five requests, four of them for floors the user never meant.
 */
function MinTvlInput({
  value,
  serverDefault,
  excludedCount,
  onChange,
}: {
  value?: number
  serverDefault?: number
  excludedCount: number
  onChange: (next: number | undefined) => void
}) {
  const [draft, setDraft] = React.useState<string>(value === undefined ? '' : String(value))

  // Follow the value when it changes from outside (Clear, a deep link) without
  // fighting the user mid-edit.
  React.useEffect(() => {
    setDraft(value === undefined ? '' : String(value))
  }, [value])

  const commit = () => {
    const parsed = parseMinTvl(draft)
    // A non-numeric entry reverts rather than silently filtering by NaN, which
    // the server would read as an absent parameter and quietly re-apply its
    // own default under a box that shows something else.
    if (parsed === null) return setDraft(value === undefined ? '' : String(value))
    onChange(parsed)
  }

  const placeholder =
    serverDefault !== undefined ? `${formatUsdShort(serverDefault)} (default)` : 'default'

  return (
    <label
      className="flex items-center gap-1"
      title="Minimum TVL in USD. Empty uses the server default; 0 removes the floor. Rows we could not price are never dropped by this — unpriced is unknown, not zero."
    >
      <span className="text-xs opacity-60">Min TVL $</span>
      <input
        type="text"
        inputMode="decimal"
        className="input input-bordered input-xs w-24"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setDraft(value === undefined ? '' : String(value))
        }}
      />
      {excludedCount > 0 && (
        <button
          type="button"
          className="text-[10px] text-base-content/50 underline decoration-dotted"
          title="Show the rows this floor is hiding"
          onClick={() => onChange(0)}
        >
          {excludedCount} hidden
        </button>
      )}
    </label>
  )
}

/**
 * Asset filter that accepts either an ADDRESS or a SYMBOL.
 *
 * The dropdown beside it can only offer symbols that are already in view, and
 * a symbol is not always enough to name a token — three unrelated tokens ship
 * as `USD3` and three more as `USDP`. An address names exactly one.
 *
 * Symbols are RESOLVED against the facet list rather than sent verbatim,
 * because the server matches symbols exactly: typing `usdc` would otherwise
 * return an empty table that looks identical to "there are no USDC markets".
 * An exact case-insensitive hit wins; failing that a unique substring match is
 * accepted; anything else is reported as no match instead of being sent.
 */
function AssetInput({
  options,
  assetSymbol,
  asset,
  search,
  onChange,
}: {
  options: EarnFacetBucket[]
  assetSymbol?: string
  asset?: string
  search?: string
  onChange: (next: { assetSymbol?: string; asset?: string; search?: string }) => void
}) {
  const current = asset ?? assetSymbol ?? search ?? ''
  const [draft, setDraft] = React.useState(current)

  React.useEffect(() => {
    setDraft(current)
  }, [current])

  // The three are mutually exclusive by construction: each commit sets exactly
  // one and clears the other two. Sending two would AND them, and a user who
  // pasted an address did not also mean a symbol.
  const commit = () => {
    const r = resolveAssetFilter(draft, options)
    if (r.kind === 'address')
      return onChange({ asset: r.asset, assetSymbol: undefined, search: undefined })
    if (r.kind === 'symbol')
      return onChange({ assetSymbol: r.assetSymbol, asset: undefined, search: undefined })
    if (r.kind === 'search')
      return onChange({ search: r.search, asset: undefined, assetSymbol: undefined })
    return onChange({ asset: undefined, assetSymbol: undefined, search: undefined })
  }

  return (
    <label
      className="flex items-center gap-1"
      title="Search the listing — a vault or market name, a curator, a protocol, an asset symbol, or a token address. Exact matches rank first."
    >
      <span className="text-xs opacity-60">Search</span>
      <input
        type="text"
        className="input input-bordered input-xs w-40"
        placeholder="name, curator, symbol…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setDraft(current)
        }}
      />
      {/* The empty state is the TABLE's job now, not this control's. A query
          that matches nothing is a real answer about the listing, and the row
          count already says so — an inline "no match" was only ever needed
          because the old resolver refused to send the query at all. */}
    </label>
  )
}
