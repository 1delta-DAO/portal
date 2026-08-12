import { useMemo, useState } from 'react'
import { useEarnCatalog } from '../../../../hooks/earn/useEarnCatalog'
import { useEarnPositions } from '../../../../hooks/earn/useEarnPositions'
import { useEarnVocabulary } from '../../../../hooks/earn/useEarnVocabulary'
import { useSpyAccount } from '../../../../contexts/SpyMode'
import { useRiskMode } from '../../../../contexts/RiskMode'
import { useTokenListsMultiChain } from '../../../../hooks/useTokenLists'
import { FacetFilters, EMPTY_SELECTION, type FacetSelection } from './FacetFilters'
import { EarnMarketsTable, type EarnSortKey } from './EarnMarketsTable'
import { EarnPositionsTable } from './EarnPositionsTable'
import { DetailPanel } from './DetailPanel'
import { vocabLabel, type EarnMarket, type EarnVocabulary } from '../../../../sdk/earn-helper'

interface UnifiedTabProps {
  chainIds: string[]
  enabled?: boolean
}

const PAGE_SIZE = 50

/** Stable identity so an idle tab does not re-trigger the token-list effect. */
const EMPTY_CHAINS: string[] = []

/**
 * The Unified Earn tab — one fetch of `GET /v1/data/earn` covering lending
 * markets and vaults together.
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
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<EarnMarket | null>(null)

  const { address: account } = useSpyAccount()

  // The SHARED risk tolerance — the toolbar selector every other tab obeys.
  // Read from the context rather than taken as a prop so there is one value,
  // not a copy that drifts.
  const { maxRiskScore } = useRiskMode()

  // Labels for every server enum — fetched, never embedded.
  const vocab = useEarnVocabulary()

  const { items, facets, sources, excluded, isLoading, isFetching, error, refetch } =
    useEarnCatalog({
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

  const pageItems = useMemo(
    () => items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [items, page]
  )
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))

  // Selecting a held row opens the SAME detail panel the listing uses — but
  // only when the catalogue still carries it. A position whose market was
  // filtered out (TVL floor, risk ceiling, facet selection) has no row to open,
  // and quietly opening the wrong one would be worse than opening none.
  const openByEarnUid = (earnUid: string) => {
    const match = items.find((m) => m.earnUid === earnUid)
    if (match) setSelected(match)
  }

  const positionsFailed = positions.sources.filter((s) => s.status !== 'ok')

  // A source that failed means the list is PARTIAL, not empty — say so rather
  // than letting the user read a short list as the whole truth.
  const partial = sources.filter((s) => s.status !== 'ok')

  const onChangeSelection = (next: FacetSelection) => {
    setSelection(next)
    setPage(0)
  }

  const onToggleSort = (key: EarnSortKey) => {
    setSortKey(key)
    setPage(0)
  }

  if (error) {
    return (
      <div className="alert alert-error">
        <span className="text-sm">{error.message}</span>
        <button type="button" className="btn btn-xs" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* The portfolio sits ABOVE the listing: what you already hold is the
          thing you came back to check, and it is also the only part of this
          tab that can be wrong in a way that costs money. */}
      {account && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">Your positions</h3>
            {positions.isFetching && !positions.isLoading && (
              <span className="loading loading-spinner loading-xs" />
            )}
          </div>

          {positions.error ? (
            <div className="alert alert-error py-2">
              <span className="text-xs">{positions.error.message}</span>
              <button type="button" className="btn btn-xs" onClick={() => positions.refetch()}>
                Retry
              </button>
            </div>
          ) : positions.isLoading ? (
            <div className="flex justify-center py-6">
              <span className="loading loading-spinner" />
            </div>
          ) : (
            <>
              {/* A half or a chain that failed means the portfolio is
                  INCOMPLETE. Saying WHICH is the difference between "you hold
                  nothing in vaults" and "we could not read your vaults" — and
                  with one query per chain, a chain that fails outright
                  contributes no `sources` entry at all, so it has to be named
                  separately or it goes unreported. */}
              {(positionsFailed.length > 0 || positions.failedChains.length > 0) && (
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
              <EarnPositionsTable
                items={positions.items}
                totals={positions.totals}
                vocab={vocab}
                tokensByChain={tokensByChain}
                partial={positions.partial}
                stale={positions.stale}
                pendingChains={positions.pendingChains}
                onSelectEarnUid={openByEarnUid}
              />
            </>
          )}
        </section>
      )}

      <FacetFilters
        facets={facets}
        excluded={excluded}
        selection={selection}
        onChange={onChangeSelection}
        isFetching={isFetching && !isLoading}
      />

      {partial.length > 0 && (
        <div className="alert alert-warning py-2">
          <span className="text-xs">
            Partial results —{' '}
            {partial
              .map((s) => `${s.source}: ${s.status}${s.error ? ` (${s.error})` : ''}`)
              .join('; ')}
          </span>
        </div>
      )}

      {selected && <DetailPanel row={selected} vocab={vocab} onClose={() => setSelected(null)} />}

      {isLoading ? (
        <div className="flex justify-center py-10">
          <span className="loading loading-spinner" />
        </div>
      ) : (
        <>
          <EarnMarketsTable
            items={pageItems}
            vocab={vocab}
            sortKey={sortKey}
            onToggleSort={onToggleSort}
            selected={selected}
            onRowClick={(row) => setSelected((cur) => (cur?.earnUid === row.earnUid ? null : row))}
          />

          <div className="flex items-center justify-between text-xs opacity-70">
            <span>
              {items.length} opportunit{items.length === 1 ? 'y' : 'ies'}
            </span>
            {totalPages > 1 && (
              <div className="join">
                <button
                  type="button"
                  className="btn btn-xs join-item"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  «
                </button>
                <span className="btn btn-xs join-item no-animation">
                  {page + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-xs join-item"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                >
                  »
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
