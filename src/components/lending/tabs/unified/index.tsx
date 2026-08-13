import { useEffect, useMemo, useRef, useState } from 'react'
import { useEarnCatalog } from '../../../../hooks/earn/useEarnCatalog'
import { useEarnPositions } from '../../../../hooks/earn/useEarnPositions'
import { useEarnVocabulary } from '../../../../hooks/earn/useEarnVocabulary'
import { useSpyAccount } from '../../../../contexts/SpyMode'
import { useRiskMode } from '../../../../contexts/RiskMode'
import { useTokenListsMultiChain } from '../../../../hooks/useTokenLists'
import { useIsMobile } from '../../../../hooks/useIsMobile'
import {
  useTablePagination,
  type TablePagination as PaginationState,
} from '../../../../hooks/useTablePagination'
import { usePersistedFilters } from '../../../../hooks/usePersistedFilters'
import { TablePagination } from '../../../common/TablePagination'
import { ErrorAlert } from '../../../common/ErrorAlert'
import { EmptyState } from '../../../common/EmptyState'
import { FacetFilters, EMPTY_SELECTION, type FacetSelection } from './FacetFilters'
import { EarnMarketsTable, type EarnSortKey } from './EarnMarketsTable'
import { EarnPositionsTable } from './EarnPositionsTable'
import { PortfolioSummary } from './PortfolioSummary'
import { HistoryPanel } from './HistoryPanel'
import { DetailPanel, DetailPlaceholder } from './DetailPanel'
import { isVaultPosition, portfolioNetApr } from '../../../../sdk/earn-helper'
import type { EarnMarket, EarnVaultPosition } from '../../../../sdk/earn-helper'

interface UnifiedTabProps {
  chainIds: string[]
  enabled?: boolean
}

/**
 * Rows per page.
 *
 * 15 rather than 50: a page that ends inside the viewport is what makes the
 * pagination control reachable without scrolling, and it keeps the detail rail
 * beside the rows it describes. Selectable, because a wide screen genuinely
 * fits more and a screener is a different job from a portfolio check.
 */
const PAGE_SIZES = [15, 25, 50, 100] as const
const DEFAULT_PAGE_SIZE = 15

type View = 'markets' | 'positions'

/** Stable identity so an idle tab does not re-trigger the token-list effect. */
const EMPTY_CHAINS: string[] = []

/**
 * The Unified Earn tab — one fetch of `GET /v1/data/earn` covering lending
 * markets and vaults together.
 *
 * ## Layout
 *
 * Master–detail: one list column, one persistent detail rail (a modal on
 * mobile), with the portfolio headline pinned above both.
 *
 *   ┌─ Net value · Supplied · Borrowed · Lending · Vaults ─────────────┐
 *   ├──────────────────────────────────────────┬──────────────────────┤
 *   │ [Opportunities 320] [Your positions 4]   │  selected row:       │
 *   │ filters …                        rows 15▾│  identity + APR      │
 *   │ ┌──────────────────────────────────────┐ │  action              │
 *   │ │ table                                │ │  history             │
 *   │ └──────────────────────────────────────┘ │  terms               │
 *   │ 1–15 of 320                       ‹ 1/22 ›│                     │
 *   └──────────────────────────────────────────┴──────────────────────┘
 *
 * Three things drive that shape:
 *
 *  - **The detail is a rail, not a card in the flow.** Rendered inline it sat
 *    between the filters and the table, so clicking a row pushed the table half
 *    a screen down and moved the row out from under the cursor. The rail also
 *    renders when nothing is selected, so the first click reflows nothing.
 *  - **Positions and opportunities share one frame.** They are the same
 *    question asked twice ("what am I earning" / "where could I earn"), they
 *    feed the same rail, and stacking both tables meant the listing started a
 *    screen below the fold. The portfolio still leads — as the summary strip,
 *    which is the part a returning user actually checks and which stays visible
 *    in both views — and the tab opens on the positions rows when the account
 *    holds any.
 *  - **One pagination, one page size**, from the shared table components rather
 *    than two hand-rolled controls disagreeing about their page size.
 *
 * ## Data
 *
 * What this tab deliberately does NOT contain, and the older Earn tab does:
 *
 *  - **no provider/venue list.** `sdk/vaults-helper/types.ts` ships
 *    `VAULT_PROVIDERS` (13 entries, two behind the SDK). Here the venue chips
 *    come from `facets.venues`, so a newly integrated protocol appears with no
 *    frontend change.
 *  - **no `'lending' | 'vaults'` mode switch.** That distinction is
 *    `facets.venueKinds`, and it only renders when the chain actually has both.
 *  - **no client-side routing matrix.** `vaultFamily` / `withdrawalStyle` /
 *    `isAsyncVaultWithdraw` / `withdrawFamily` decide, in the browser, that
 *    sUSDe needs request→claim while sUSDS redeems instantly. Here that is
 *    `row.capabilities`.
 *  - **no client-side merge or sort across two payloads.** The server merges,
 *    filters, sorts and paginates on one scale.
 *  - **no client-side composition of the user's portfolio.** `useEarnPositions`
 *    replaces `useUserData` + `useVaultsCatalog` + `useUserVaults` — and with
 *    them the two things that trio cannot do correctly: the vault half is
 *    single-chain (so the older tab silently drops every vault position off
 *    `chainIds[0]`) and it cannot DISCOVER, so it has to be handed each
 *    chain's whole catalogue as a query string.
 */
export function UnifiedEarnTab({ chainIds, enabled = true }: UnifiedTabProps) {
  const [selection, setSelection] = useState<FacetSelection>(EMPTY_SELECTION)
  const [sortKey, setSortKey] = useState<EarnSortKey>('rate')
  const [selected, setSelected] = useState<EarnMarket | null>(null)
  const [view, setView] = useState<View>('markets')
  const [showPanel, setShowPanel] = useState(false)
  // A held position whose market the current filters exclude. Kept so the rail
  // can say so — see `openByEarnUid`.
  const [unlisted, setUnlisted] = useState<string | null>(null)

  const isMobile = useIsMobile()

  // Page size is a preference, not view state: it survives a reload, and it is
  // one setting for both tables so the two lists never page differently.
  const { filters, setFilter } = usePersistedFilters('unified-earn', {
    pageSize: DEFAULT_PAGE_SIZE,
    // The chart band is ~19rem of permanent vertical cost. Collapsing it is how
    // a user who only wants the table gets that back — for good, not per visit.
    // `as boolean` so the generic infers a togglable flag, not the literal
    // `true` (which makes `setFilter('chartOpen', false)` a type error).
    chartOpen: true as boolean,
  })
  const pageSize = PAGE_SIZES.includes(filters.pageSize as (typeof PAGE_SIZES)[number])
    ? (filters.pageSize as number)
    : DEFAULT_PAGE_SIZE

  const { address: account } = useSpyAccount()

  // The SHARED risk tolerance — the toolbar selector every other tab obeys.
  // Read from the context rather than taken as a prop so there is one value,
  // not a copy that drifts.
  const { maxRiskScore } = useRiskMode()

  // Labels for every server enum — fetched, never embedded.
  const vocab = useEarnVocabulary()

  const {
    items,
    facets,
    sources,
    excluded,
    total,
    pendingChains,
    failedChains,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useEarnCatalog({
    chainIds,
    protocol: selection.protocols.length ? selection.protocols : undefined,
    curator: selection.curators.length ? selection.curators : undefined,
    brand: selection.brands.length ? selection.brands : undefined,
    venue: selection.venues.length ? selection.venues : undefined,
    venueKind: selection.venueKind,
    assetGroup: selection.assetGroup,
    assetSymbol: selection.assetSymbol,
    depositableOnly: selection.depositableOnly,
    includePassthrough: selection.includePassthrough,
    includeIlliquid: selection.includeIlliquid,
    // `0` disables the server's floor; undefined keeps the default.
    minTvlUsd: selection.showLowTvl ? 0 : undefined,
    maxRiskScore,
    sort: sortKey,
    // The panel renders prose and counterparty terms the digest omits.
    terms: 'full',
    enabled,
  })

  // The portfolio. Deliberately NOT filtered by the facet selection above:
  // filters are for finding somewhere to deposit, and a user who narrows the
  // listing to one asset has not stopped holding everything else. A position
  // that vanished when a filter was applied would read as a position that was
  // closed.
  const positions = useEarnPositions({
    chainIds,
    account,
    enabled: enabled && !!account,
  })

  // FALLBACK icons only. The server puts `logoURI` on every lending leg it can
  // resolve; this covers vault underlyings, which have no such field, and the
  // lenders whose metadata carries a null logo. The list is globally cached and
  // the Lending tab already loads it for these chains, so it costs nothing.
  const { data: tokensByChain } = useTokenListsMultiChain(account ? chainIds : EMPTY_CHAINS)

  const selectionKey = JSON.stringify(selection)
  const marketsPage = useTablePagination(items, pageSize, [sortKey, selectionKey, pageSize])
  const positionsPage = useTablePagination(positions.items, pageSize, [pageSize])

  /**
   * Open on the portfolio when there is one — once per account.
   *
   * Guarded by a ref rather than run on every settle: the positions query
   * refetches every 30s, and a view that snapped back each time would take the
   * listing away from a user who had switched to it deliberately.
   */
  const autoViewedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!account) {
      autoViewedFor.current = null
      setView('markets')
      return
    }
    if (autoViewedFor.current === account) return
    if (positions.isLoading) return
    autoViewedFor.current = account
    if (positions.items.length > 0) setView('positions')
  }, [account, positions.isLoading, positions.items.length])

  const openRow = (row: EarnMarket | null) => {
    setUnlisted(null)
    setSelected(row)
    // On mobile the rail is a modal, so a selection has to open it. On desktop
    // it is already on screen.
    setShowPanel(!!row && isMobile)
  }

  /**
   * Open a held position in the same rail the listing uses.
   *
   * Only the catalogue can fill that rail, so a position whose market the
   * current filters exclude (TVL floor, risk ceiling, facet selection) has no
   * row to open. Quietly doing nothing read as a dead click, and quietly
   * opening a different row would be worse — so it says which, and offers the
   * one action that fixes it.
   */
  const openByEarnUid = (earnUid: string) => {
    const match = items.find((m) => m.earnUid === earnUid)
    if (match) openRow(match)
    else {
      setSelected(null)
      setUnlisted(earnUid)
      setShowPanel(isMobile)
    }
  }

  const positionsFailed = positions.sources.filter((s) => s.status !== 'ok')

  // A source that failed means the list is PARTIAL, not empty — say so rather
  // than letting the user read a short list as the whole truth.
  const partial = sources.filter((s) => s.status !== 'ok')

  const onChangeSelection = (next: FacetSelection) => setSelection(next)

  if (error) {
    return (
      <div className="space-y-2">
        <ErrorAlert error={error} title="Could not load earn markets" />
        <button type="button" className="btn btn-xs" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    )
  }

  /**
   * The user's position in the selected row, if any.
   *
   * A vault position's `positionUid` IS its `earnUid` (one vault is one market
   * is one position), so the join is direct. A LENDING position deliberately
   * has no `earnUid` — it spans every market in the account — so this only
   * ever resolves for vault rows, which is exactly where it is needed.
   */
  /** Blended net APR across lending AND vaults — see `portfolioNetApr`. */
  const netApr = useMemo(() => portfolioNetApr(positions.items), [positions.items])

  const selectedPosition = useMemo(() => {
    if (!selected) return undefined
    return positions.items.find(
      (p): p is EarnVaultPosition => isVaultPosition(p) && p.positionUid === selected.earnUid
    )
  }, [selected, positions.items])

  const panelBody = selected ? (
    <DetailPanel
      row={selected}
      vocab={vocab}
      position={selectedPosition}
      onClose={() => openRow(null)}
      // Only the mobile sheet carries the chart; on desktop it is the band
      // above the table, where it has the width a series needs.
      showHistory={isMobile}
    />
  ) : unlisted ? (
    <EmptyState
      title="Not in the current listing"
      description="This position's market is filtered out — by the TVL floor, the risk ceiling, or a facet you selected."
      className="px-3"
      action={
        <button
          type="button"
          className="btn btn-xs"
          onClick={() => {
            setSelection(EMPTY_SELECTION)
            setUnlisted(null)
          }}
        >
          Clear filters
        </button>
      }
    />
  ) : (
    <DetailPlaceholder hasRows={items.length > 0} />
  )

  return (
    <div className="space-y-3">
      {/* The portfolio headline stays on screen in BOTH views: what you are
          already earning is the thing you came back to check, and it is also
          the only part of this tab that can be wrong in a way that costs
          money. */}
      {account && (
        <PortfolioSummary
          totals={positions.totals}
          netApr={netApr}
          positionCount={positions.items.length}
          isLoading={positions.isLoading}
          isFetching={positions.isFetching}
          partial={positions.partial}
          stale={positions.stale}
          pendingChains={positions.pendingChains}
        />
      )}

      {/* A half or a chain that failed means the portfolio is INCOMPLETE.
          Saying WHICH is the difference between "you hold nothing in vaults"
          and "we could not read your vaults" — and with one query per chain, a
          chain that fails outright contributes no `sources` entry at all, so it
          has to be named separately or it goes unreported. */}
      {account && (positionsFailed.length > 0 || positions.failedChains.length > 0) && (
        <div className="alert alert-warning py-2">
          <span className="text-xs">
            Portfolio incomplete —{' '}
            {[
              positions.failedChains.length
                ? `could not read chain ${positions.failedChains.join(', ')}`
                : null,
              ...positionsFailed.map(
                (s) => `${s.source}: ${s.status}${s.error ? ` (${s.error})` : ''}`
              ),
            ]
              .filter(Boolean)
              .join('; ')}
          </span>
          <button type="button" className="btn btn-xs" onClick={() => positions.refetch()}>
            Retry
          </button>
        </div>
      )}

      {positions.error && account && (
        <div className="space-y-2">
          <ErrorAlert error={positions.error} title="Could not load your positions" />
          <button type="button" className="btn btn-xs" onClick={() => positions.refetch()}>
            Retry
          </button>
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* ── List column ────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1 space-y-3">
          {/* The chart takes the full width of this column — 700–1000px on a
              normal screen — because a rate series is a shape and a shape needs
              horizontal room. Always mounted, so selecting a row swaps its
              contents rather than pushing the table down. Not rendered at all
              on mobile: there the sheet carries the chart. */}
          {!isMobile && (
            <HistoryPanel
              row={selected}
              vocab={vocab}
              open={!!filters.chartOpen}
              onToggleOpen={() => setFilter('chartOpen', !filters.chartOpen)}
            />
          )}

          <div className="rounded-box border border-base-300">
            {/* Toolbar: which list, and how much of it per page. */}
            <div className="flex flex-wrap items-center gap-2 border-b border-base-300 p-2">
              <div className="flex items-center gap-0.5 rounded-lg bg-base-200 p-0.5">
                <ViewTab
                  active={view === 'markets'}
                  onClick={() => setView('markets')}
                  label="Opportunities"
                  count={isLoading ? undefined : items.length}
                />
                {account && (
                  <ViewTab
                    active={view === 'positions'}
                    onClick={() => setView('positions')}
                    label="Your positions"
                    count={positions.isLoading ? undefined : positions.items.length}
                  />
                )}
              </div>

              {isFetching && !isLoading && (
                <span className="loading loading-spinner loading-xs text-base-content/50" />
              )}

              <label className="ml-auto flex items-center gap-1.5 text-xs text-base-content/50">
                Rows
                <select
                  className="select select-bordered select-xs"
                  value={pageSize}
                  onChange={(e) => setFilter('pageSize', Number(e.target.value))}
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Filters belong to the listing only — the portfolio is
                deliberately unfiltered. */}
            {view === 'markets' && (
              <div className="border-b border-base-300 px-2 py-1.5">
                <FacetFilters
                  facets={facets}
                  excluded={excluded}
                  selection={selection}
                  onChange={onChangeSelection}
                  isFetching={isFetching && !isLoading}
                />
              </div>
            )}

            {view === 'markets' && partial.length > 0 && (
              <div className="border-b border-base-300 px-3 py-1.5 text-xs text-warning">
                Partial results —{' '}
                {partial
                  .map((s) => `${s.source}: ${s.status}${s.error ? ` (${s.error})` : ''}`)
                  .join('; ')}
              </div>
            )}

            {/* The listing is shown while it is still filling: chains resolve
                independently and each one's pages stream in. Say so — a table
                that is quietly still growing reads as a complete answer, and
                "no results on Base" is a different statement from "Base hasn't
                answered yet". */}
            {view === 'markets' && (pendingChains.length > 0 || items.length < total) && (
              <div className="flex items-center gap-2 border-b border-base-300 px-3 py-1.5 text-xs text-base-content/60">
                <span className="loading loading-spinner loading-xs" />
                {pendingChains.length > 0
                  ? `Loading ${pendingChains.length} more chain${pendingChains.length > 1 ? 's' : ''}…`
                  : `Loading ${total - items.length} more opportunities…`}
              </div>
            )}

            {view === 'markets' && failedChains.length > 0 && (
              <div className="border-b border-base-300 px-3 py-1.5 text-xs text-warning">
                No results from chain {failedChains.join(', ')} — rows from{' '}
                {failedChains.length > 1 ? 'those chains are' : 'that chain is'} missing.
              </div>
            )}

            {view === 'markets' ? (
              isLoading ? (
                <div className="flex justify-center py-10">
                  <span className="loading loading-spinner" />
                </div>
              ) : (
                <>
                  <EarnMarketsTable
                    items={marketsPage.pagedItems}
                    vocab={vocab}
                    sortKey={sortKey}
                    onToggleSort={setSortKey}
                    selected={selected}
                    onRowClick={(row) => openRow(selected?.earnUid === row.earnUid ? null : row)}
                  />
                  <ListFooter
                    pagination={marketsPage}
                    total={items.length}
                    noun={items.length === 1 ? 'opportunity' : 'opportunities'}
                  />
                </>
              )
            ) : positions.isLoading ? (
              <div className="flex justify-center py-10">
                <span className="loading loading-spinner" />
              </div>
            ) : (
              <>
                <EarnPositionsTable
                  items={positionsPage.pagedItems}
                  vocab={vocab}
                  tokensByChain={tokensByChain}
                  onSelectEarnUid={openByEarnUid}
                  selectedEarnUid={selected?.earnUid}
                />
                <ListFooter
                  pagination={positionsPage}
                  total={positions.items.length}
                  noun={positions.items.length === 1 ? 'position' : 'positions'}
                />
              </>
            )}
          </div>
        </div>

        {/* ── Detail rail — desktop. Sticky and always present, so selecting a
            row never reflows the table beside it. Scrolls on its own so a long
            panel cannot outgrow the viewport and break the stickiness. ───── */}
        {/* `w-72` at md matches the Lending tab's action rail exactly — the
            narrowest width the two-column layout survives at 768px — and grows
            to 24rem where the screen can pay for it. */}
        <aside className="sticky top-4 hidden max-h-[calc(100dvh-2rem)] w-72 shrink-0 overflow-y-auto overscroll-contain rounded-box border border-base-300 md:block lg:w-96">
          {panelBody}
        </aside>
      </div>

      {/* ── Detail rail — mobile. Same content as a sheet, matching the
          `MobileActionModal` pattern the Lending tab uses. ─────────────── */}
      {isMobile && showPanel && (
        <div className="modal modal-open" onClick={() => setShowPanel(false)}>
          <div
            className="modal-box max-h-[85dvh] w-full max-w-md overflow-y-auto overscroll-contain p-0"
            onClick={(e) => e.stopPropagation()}
          >
            {panelBody}
          </div>
        </div>
      )}
    </div>
  )
}

function ViewTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count?: number
}) {
  return (
    <button
      type="button"
      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-base-100 text-base-content shadow-sm'
          : 'text-base-content/50 hover:text-base-content'
      }`}
      onClick={onClick}
    >
      {label}
      {count !== undefined && (
        <span className="ml-1.5 tabular-nums text-base-content/50">{count}</span>
      )}
    </button>
  )
}

/**
 * The count line, and the pager when there is more than one page.
 *
 * `TablePagination` renders nothing on a single page, which would take the
 * count with it — and a table with no count under it reads as the whole book
 * whether it is 12 rows or 12 of 400.
 */
function ListFooter({
  pagination,
  total,
  noun,
}: {
  pagination: PaginationState<unknown>
  total: number
  noun: string
}) {
  if (pagination.totalPages > 1) {
    return <TablePagination pagination={pagination} totalItems={total} itemNoun={noun} />
  }
  return (
    <div className="border-t border-base-300 px-3 py-2 text-xs text-base-content/50">
      {total} {noun}
    </div>
  )
}
