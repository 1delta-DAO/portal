import React from 'react'
import { abbreviateUsd, EMPTY_VALUE } from '../../../../utils/format'
import type { EarnPositionTotals, PortfolioAprResult } from '../../../../sdk/earn-helper'

const usd = (n?: number) => (n == null || !Number.isFinite(n) ? EMPTY_VALUE : abbreviateUsd(n))

interface Props {
  totals: EarnPositionTotals
  /**
   * Blended net APR across BOTH halves — see `portfolioNetApr`. Weighted by
   * each position's equity, so it is a return on net value rather than on
   * gross supply.
   */
  netApr?: PortfolioAprResult
  /** Rows behind the totals — the strip says so rather than only the money. */
  positionCount: number
  isLoading?: boolean
  isFetching?: boolean
  /** Reads were incomplete — every total is a lower bound. */
  partial?: boolean
  /** Something came from a snapshot rather than a live read. */
  stale?: boolean
  /** Chains that have not answered yet; the totals cover only those that have. */
  pendingChains?: string[]
}

/**
 * The portfolio headline, as a strip that is on screen in BOTH views.
 *
 * The tab used to lead with the whole positions table, which pushed the
 * listing a screen down and made "what am I earning" and "where could I earn"
 * compete for the same space. The number is the thing a returning user checks;
 * the rows are a second question. So the number stays pinned at the top and the
 * rows moved behind the view switch underneath it — the portfolio is still
 * first, it just no longer costs the listing its position.
 *
 * Every qualifier that makes the figure a LOWER BOUND rather than a net worth
 * (a chain still loading, a lender read that failed, a snapshot) is rendered
 * next to it, not below the table it came from.
 */
export const PortfolioSummary: React.FC<Props> = ({
  totals,
  netApr,
  positionCount,
  isLoading,
  isFetching,
  partial,
  stale,
  pendingChains,
}) => {
  const incomplete = partial || (pendingChains?.length ?? 0) > 0

  return (
    <div className="rounded-box border border-base-300 px-3 py-2">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <Stat
          label="Net value"
          value={isLoading ? EMPTY_VALUE : usd(totals.netUsd)}
          size="lg"
          // An incomplete read is a floor, and saying so on the figure itself
          // is the difference between a partial portfolio and a wrong one.
          hint={
            incomplete
              ? 'At least this much — some reads have not completed, so this is a lower bound.'
              : undefined
          }
        />
        <Stat label="Supplied" value={isLoading ? EMPTY_VALUE : usd(totals.suppliedUsd)} />
        {totals.borrowedUsd > 0 && (
          <Stat label="Borrowed" value={usd(totals.borrowedUsd)} tone="error" />
        )}
        <Stat label="Lending" value={isLoading ? EMPTY_VALUE : usd(totals.lendingUsd)} />
        <Stat label="Vaults" value={isLoading ? EMPTY_VALUE : usd(totals.vaultUsd)} />
        {/* Sits beside Net value because it is a return ON that number: the
            weighting is each position's EQUITY, so a levered position
            legitimately reads high. Rendered only when something was
            computable — a blank is honest, a 0 % is not. */}
        {netApr?.apr != null && (
          <Stat
            label="Net APR"
            value={isLoading ? EMPTY_VALUE : `${netApr.apr.toFixed(2)}%`}
            hint={
              `Blended across lending and vaults, weighted by each position's net value ` +
              `(supplied − borrowed). Because the weight is equity, leverage raises it.` +
              (netApr.excludedCount > 0
                ? ` ${netApr.excludedCount} position${netApr.excludedCount === 1 ? '' : 's'} ` +
                  `publish no rate and ${netApr.excludedCount === 1 ? 'is' : 'are'} left out ` +
                  `entirely rather than counted as 0 %, so this covers ` +
                  `${usd(netApr.coveredUsd)} of ${usd(netApr.totalUsd)}.`
                : '')
            }
          />
        )}
        <Stat label="Positions" value={isLoading ? EMPTY_VALUE : String(positionCount)} />

        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          {(isLoading || isFetching) && <span className="loading loading-spinner loading-xs" />}

          {/* The header is a sum over the rows PRESENT. While a chain is still
              in flight that is not the user's net worth, and a figure that
              quietly grows as chains land is worse than one that says so. */}
          {pendingChains && pendingChains.length > 0 && (
            <span
              className="text-warning"
              title={`Still loading chain ${pendingChains.join(', ')} — these totals cover the chains that have answered.`}
            >
              +{pendingChains.length} chain{pendingChains.length === 1 ? '' : 's'} loading
            </span>
          )}

          {partial && (
            <span
              className="text-warning"
              title="Some lender reads did not complete — positions shown are at least this much, and the totals, APR and health factors are not reliable."
            >
              partial read
            </span>
          )}

          {stale && !partial && (
            <span
              className="text-base-content/50"
              title="Some rows were served from the last complete snapshot rather than a live read — internally consistent, but not current."
            >
              from snapshot
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  size = 'sm',
  tone,
  hint,
}: {
  label: string
  value: string
  size?: 'sm' | 'lg'
  tone?: 'error'
  hint?: string
}) {
  return (
    <div title={hint}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-base-content/50">
        {label}
      </div>
      <div
        className={`tabular-nums font-semibold ${size === 'lg' ? 'text-lg' : 'text-sm'} ${
          tone === 'error' ? 'text-error' : ''
        }`}
      >
        {value}
      </div>
    </div>
  )
}
