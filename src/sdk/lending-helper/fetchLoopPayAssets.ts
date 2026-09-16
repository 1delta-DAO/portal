import { apiFetch } from '../http'
import type { RawCurrency } from '../../lib/lib-utils'

/**
 * Which assets can fund the margin of a leveraged open?
 *
 * `GET /v1/actions/loop/leverage/pay-assets` — the discovery companion to
 * `/v1/actions/loop/leverage`. Given the same two market uids it returns the
 * assets the leverage builder will actually accept as `payAsset`, so the "pay
 * with" chips come from the server rather than from a rule the panel has to
 * keep in step with every lender:
 *
 *  - most lenders take the collateral, the debt, or native when the wrapped
 *    native is one of the two (the composer wraps it);
 *  - Curvance / Fraxlend / Resupply / Twyne take the collateral ONLY;
 *  - LlamaLend takes either token but never native;
 *  - Exactly takes the DEBT asset only, Flying Tulip takes no margin at all.
 *
 * The panel used to offer collateral + debt + native on every lender and learn
 * the rule from the build failure. Rows come back currency-list ready, so they
 * drop straight into the existing `RawCurrency` chips.
 */

export type LoopPayAssetRole = 'collateral' | 'debt' | 'native'

export interface LoopPayAsset extends RawCurrency {
  role: LoopPayAssetRole
  /** Native only: the wrapped token it lands as, and which side that is. */
  wrapsTo?: string
  wrapsRole?: 'collateral' | 'debt'
}

export interface LoopPayAssetsData {
  chainId: string
  lender: string
  marketUidIn: string
  marketUidOut: string
  collateralAsset: RawCurrency
  debtAsset: RawCurrency
  /** In preference order. Empty when the lender takes no margin on a loop. */
  payAssets: LoopPayAsset[]
  /** Whether `/loop/leverage` refuses anything outside `payAssets` up front. */
  strict: boolean
  /** Caveats worth showing next to the chips. */
  notes: string[]
}

export async function fetchLoopPayAssets(
  params: { marketUidIn: string; marketUidOut: string },
  signal?: AbortSignal
): Promise<LoopPayAssetsData> {
  const data = await apiFetch<LoopPayAssetsData>('/v1/actions/loop/leverage/pay-assets', {
    params: { marketUidIn: params.marketUidIn, marketUidOut: params.marketUidOut },
    signal,
  })
  return {
    ...data,
    payAssets: (data.payAssets ?? []).map((a) => ({
      ...a,
      // The list keys currencies by address; keep the server's lower-case form
      // so a chip's `address` compares equal to what the API echoes back.
      address: a.address.toLowerCase(),
      // A row outside the curated token list has no decimals; every accepted
      // margin asset is one of the two market assets or native, so the caller
      // back-fills from the pools it already holds.
    })),
    notes: data.notes ?? [],
  }
}
