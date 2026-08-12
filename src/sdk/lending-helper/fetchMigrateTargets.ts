import { apiFetch, errorMessage } from '../http'
import {
  normalisePairRow,
  type OptimizerAssetRef,
  type OptimizerPairRow,
} from '../../hooks/lending/useOptimizerPairs'

/**
 * Which markets can this position migrate to?
 *
 * `GET /v1/actions/loop/migrate/targets` — the discovery companion to
 * `/v1/actions/loop/migrate`. It returns the ranked destinations that the
 * migrate builder will actually accept, which is why this client is thin: every
 * rule that used to live in the modal is now applied server-side, against the
 * same code path the build validates with, so it cannot drift.
 *
 * What the UI no longer has to know:
 *
 *  - **Native ⇄ wrapped-native.** Some lenders key a market to the native asset
 *    (Fluid's ETH vaults), others to the wrapped ERC20 (Aave WETH); a migrate
 *    bridges them by wrapping. Selection happens by shared `assetGroup`
 *    server-side, so both forms surface in both directions with no per-chain
 *    WETH table here. (The modal used to keep one, covering 7 of ~97 chains, and
 *    searched for the wrong native sentinel — `0xEeee…` is an encoding-layer
 *    value that no data endpoint ever serves, so WETH-denominated positions
 *    never saw a native-asset market at all.)
 *  - **Which lenders can be a target.** Dolomite / Euler / Curvance / LlamaLend /
 *    non-Venus Compound V2 forks, plus every direct-route-only lender.
 *  - **The native-debt rule** (a native debt cannot be borrowed on behalf).
 *  - **Un-openable order books** — a Midnight market with an empty book reports
 *    0% like any other, and 0% sorts to the top of a rate ranking.
 *  - **Borrow liquidity at this position's size**, applied before truncation.
 *
 * Rows arrive in the `/pairs/optimize` shape, so they go through the same
 * `normalisePairRow` as the optimizer table, plus a `migrate` block carrying the
 * resulting health factor / net APR for THIS position.
 */

/** Per-target verdict for the position being moved (fractions, not percent). */
export interface MigrateTargetInfo {
  /** Resulting health factor on this target. */
  healthFactor?: number
  /** Equity-weighted net APR of the migrated position. */
  netApr?: number
  depositApr?: number
  borrowApr?: number
  borrowLiquidityUsd: number
  /** False when the target cannot fund the whole migrated debt. */
  sufficientLiquidity: boolean
  /** Fixed-term destinations only: unix seconds of the maturity. */
  maturity?: number
  /** Fixed-term destinations only, e.g. "Fixed 4.01% until 28 Aug 2026". */
  termHeadline?: string
}

export type MigrateTargetRow = OptimizerPairRow & { migrate: MigrateTargetInfo }

export interface MigrateTargetsParams {
  marketUidSourceCollateral: string
  marketUidSourceDebt: string
  /** Live debt in wei — sizes the liquidity filter and the health-factor preview. */
  debtAmount?: string
  /** Live collateral in wei — needed with `debtAmount` for the health factor. */
  collateralAmount?: string
  /** Ask for targets that convert one leg via an aggregator swap. */
  convertLeg?: 'collateral' | 'debt'
  /** Pin the converted leg to this asset. Omit to receive `convertibleAssets`. */
  convertTo?: string
  count?: number
  /** Keep targets that cannot fund the debt (they carry `sufficientLiquidity: false`). */
  includeIlliquid?: boolean
  /**
   * Optional oracle-price overrides for the source legs. The endpoint resolves
   * prices itself (feed, then the source markets' own oracles), so these are
   * only worth sending when the caller already holds a live position read —
   * which is strictly fresher than either.
   */
  collateralPriceUsd?: number
  debtPriceUsd?: number
}

export interface MigrateTargetsResult {
  success: boolean
  targets: MigrateTargetRow[]
  /** How many destinations were dropped for insufficient borrow liquidity. */
  hiddenForLiquidity: number
  /** Assets the converting leg can become — present when `convertLeg` is set without `convertTo`. */
  convertibleAssets?: OptimizerAssetRef[]
  /** One entry per distinct drop reason, so a short list can explain itself. */
  excluded: { lender: string; reason: string }[]
  error?: string
}

const EMPTY: Omit<MigrateTargetsResult, 'success' | 'error'> = {
  targets: [],
  hiddenForLiquidity: 0,
  excluded: [],
}

export async function fetchMigrateTargets(
  params: MigrateTargetsParams,
  signal?: AbortSignal
): Promise<MigrateTargetsResult> {
  try {
    const qs = new URLSearchParams()
    qs.set('marketUidSourceCollateral', params.marketUidSourceCollateral)
    qs.set('marketUidSourceDebt', params.marketUidSourceDebt)
    if (params.debtAmount != null) qs.set('debtAmount', params.debtAmount)
    if (params.collateralAmount != null) qs.set('collateralAmount', params.collateralAmount)
    if (params.convertLeg) qs.set('convertLeg', params.convertLeg)
    if (params.convertTo) qs.set('convertTo', params.convertTo)
    if (params.count != null) qs.set('count', String(params.count))
    if (params.includeIlliquid) qs.set('includeIlliquid', 'true')
    if (params.collateralPriceUsd != null)
      qs.set('collateralPriceUsd', String(params.collateralPriceUsd))
    if (params.debtPriceUsd != null) qs.set('debtPriceUsd', String(params.debtPriceUsd))

    const data = await apiFetch<any>('/v1/actions/loop/migrate/targets', {
      params: Object.fromEntries(qs),
      signal,
    })
    return {
      success: true,
      targets: (data.targets ?? []).map((raw: any) => ({
        ...normalisePairRow(raw),
        migrate: raw.migrate ?? { borrowLiquidityUsd: 0, sufficientLiquidity: true },
      })),
      hiddenForLiquidity: data.hiddenForLiquidity ?? 0,
      convertibleAssets: data.convertibleAssets,
      excluded: data.excluded ?? [],
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err
    return { success: false, ...EMPTY, error: err?.message ?? 'Unknown error' }
  }
}
