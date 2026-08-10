import type { PoolConfigGroup, PoolDataItem } from '../../../hooks/lending/usePoolData'
import { OPTIMIZER_DEEPLINK_KEYS } from '../../../utils/routes'

/**
 * Resolve one leg of an optimizer hand-off to a market.
 *
 * The market UID wins whenever it resolves. Falling back to the token address
 * is what a hand-off did before UIDs were carried, and it is ambiguous on vault
 * lenders: Euler runs many vaults over the same underlying, so an
 * address match lands on whichever vault is first in `allPools` — usually not
 * the one whose rate the user clicked. The fallback is kept only so links that
 * predate the UID params (and rows whose UID is missing) still land somewhere
 * sensible rather than nowhere.
 */
export function resolveDeepLinkPool(
  allPools: PoolDataItem[],
  marketUid?: string | null,
  address?: string | null
): PoolDataItem | undefined {
  if (marketUid) {
    const byUid = allPools.find((p) => p.marketUid === marketUid)
    if (byUid) return byUid
  }
  if (address) {
    const lower = address.toLowerCase()
    return allPools.find((p) => p.underlying.toLowerCase() === lower)
  }
  return undefined
}

/**
 * The config group that actually contains the handed-off market(s).
 *
 * Needed because the config groups load on their own schedule, well after the
 * pools: a hand-off resolves and selects its market immediately, but the
 * by-config view has nothing yet and later settles on ITS default — a config
 * that need not contain the selected market at all. The user then lands on a
 * table where the row they clicked isn't listed, which reads as the
 * pre-selection having silently failed.
 *
 * Only used when the link carries no explicit `config` (Earn hands off a single
 * market, with no e-mode attached). An explicit config always wins — it names
 * the config the row's LTV and leverage were computed against.
 *
 * With both legs, only a group holding BOTH is a real answer: a loop has to
 * borrow the debt asset against the collateral asset inside one config, and a
 * group that merely lists the collateral would show leverage the pair can't
 * reach. A single leg matches on its own side.
 */
export function findConfigContaining(
  groups: PoolConfigGroup[] | undefined,
  collateralUid?: string | null,
  debtUid?: string | null
): string | null {
  if (!groups?.length || (!collateralUid && !debtUid)) return null
  const hasColl = (g: PoolConfigGroup) =>
    !collateralUid || !!g.collaterals?.some((c) => c.marketUid === collateralUid)
  const hasDebt = (g: PoolConfigGroup) =>
    !debtUid || !!g.borrowables?.some((b) => b.marketUid === debtUid)
  return groups.find((g) => hasColl(g) && hasDebt(g))?.configId ?? null
}

/** The optimizer hand-off params, read off a `URLSearchParams`. */
export interface OptimizerDeepLink {
  colAddr: string | null
  debtAddr: string | null
  colMarketUid: string | null
  debtMarketUid: string | null
  configId: string | null
  action: string | null
  amount: string | null
  /** True when the link identifies at least one leg — nothing to do otherwise. */
  hasPair: boolean
  /**
   * Stable identity of this hand-off. Consumers dedupe on it so a re-render
   * (or the param-stripping write itself) doesn't re-apply the selection over
   * a choice the user has since made.
   */
  signature: string
}

export function readOptimizerDeepLink(params: URLSearchParams): OptimizerDeepLink {
  const colAddr = params.get(OPTIMIZER_DEEPLINK_KEYS.collateral)
  const debtAddr = params.get(OPTIMIZER_DEEPLINK_KEYS.debt)
  const colMarketUid = params.get(OPTIMIZER_DEEPLINK_KEYS.colMarket)
  const debtMarketUid = params.get(OPTIMIZER_DEEPLINK_KEYS.debtMarket)
  const configId = params.get(OPTIMIZER_DEEPLINK_KEYS.config)
  const action = params.get(OPTIMIZER_DEEPLINK_KEYS.action)
  const amount = params.get(OPTIMIZER_DEEPLINK_KEYS.amount)
  return {
    colAddr,
    debtAddr,
    colMarketUid,
    debtMarketUid,
    configId,
    action,
    amount,
    hasPair: !!(colAddr || debtAddr || colMarketUid || debtMarketUid),
    signature: [
      colMarketUid ?? '',
      debtMarketUid ?? '',
      colAddr ?? '',
      debtAddr ?? '',
      configId ?? '',
      action ?? '',
      amount ?? '',
    ].join('|'),
  }
}

/** Strip every hand-off param, leaving unrelated ones (e.g. `riskTolerance`) intact. */
export function stripDeepLinkParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params)
  for (const k of Object.values(OPTIMIZER_DEEPLINK_KEYS)) next.delete(k)
  return next
}
