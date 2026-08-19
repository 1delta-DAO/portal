/**
 * Fluid smart vaults (T2 / T3 / T4) — the one place the app learns that a
 * market side can be a two-token LP rather than a single asset.
 *
 * THE ASSUMPTION THIS BREAKS. Every lending screen we have is built on "a
 * market has ONE collateral asset and ONE debt asset, and a position is an
 * amount of each". A Fluid smart side is not that. It is **one position — a
 * share count over a two-token DEX LP** — whose token composition drifts with
 * the pool and is not user-controllable. The per-leg market rows the API serves
 * are a *projection* of that position, not two positions.
 *
 * | type | collateral | debt   | what the UI must render              |
 * | ---- | ---------- | ------ | ------------------------------------ |
 * | T1   | 1 token    | 1 token| the ordinary UI, unchanged           |
 * | T2   | LP (2)     | 1 token| LP on the supply side only           |
 * | T3   | 1 token    | LP (2) | LP on the borrow side only           |
 * | T4   | LP (2)     | LP (2) | LP on both — often the SAME pool     |
 *
 * EVERY EXPORT DEGRADES TO THE ORDINARY ANSWER. `positionSupplyRate` falls back
 * to the row's own `depositRate`, `groupByVault` returns one group per row,
 * `isAutoBalanced` is false. That fallback is what keeps T1 and every other
 * lender byte-identical, and it is also what makes this safe to call
 * unconditionally instead of behind a lender check.
 *
 * DO NOT PATTERN-MATCH THE LENDER NAME. A smart vault is named
 * `Fluid wstETH+ETH-wstETH+ETH 2` — `+` joins the LP legs, `-` splits the sides
 * — and splitting on `-` yields `wstETH+ETH` twice, i.e. a market that looks
 * same-asset. Read `autoBalanced` and `fluid` and nothing else.
 *
 * WHAT IS AND IS NOT REFUSED — and why there is no gate here for it.
 *
 * There is deliberately NO client-side availability check in this module. An
 * earlier version had one, and it was inverted against reality on both counts:
 *
 *   - **Looping is SERVED on T2, T3 and T4.** The gate refused all three, on
 *     the reading that a smart debt side must borrow the PAIR — two tokens out,
 *     two swaps back, which the loop shape cannot express. That holds for a
 *     BALANCED borrow only: Fluid accepts a single-sided move on either side
 *     and rebalances internally, so the loop borrows one leg and repays one.
 *     All three are fork-proven and production serves them; the gate was hiding
 *     a working feature on 158 auto-balanced Ethereum rows.
 *   - **Migrate is refused on T3/T4** (composer-routed; the smart debt side has
 *     no sized path through that builder yet) and the gate said nothing.
 *
 * Both remaining refusals are things a client cannot predict: the loop's is
 * ROUTE-dependent ("this loop's flash asset is neither leg of the debt LP"),
 * and migrate's is a server capability that is being extended. Build the
 * request and surface the 400 — which every call site already does, and which
 * `MigrateModal` states as its own design rule.
 *
 * See FLUID_SMART_UI_PLAN.md in the lending-sdks repo.
 */

/**
 * One side of a Fluid vault. `dex` and `perShare` are null on a SIMPLE side —
 * which covers T1 entirely and the debt side of a T2.
 */
export interface FluidSideInfo {
  /** Underlying legs in the vault's own token0/token1 order. */
  assets: { underlying: string; decimals: number }[]
  dex: string | null
  /**
   * Token units per 1e18 LP shares, parallel to `assets`, **each in its own
   * decimals**. This is the share↔token conversion.
   *
   * A SNAPSHOT, never a property of the user's deposit: the pool re-sets the
   * split on every trade and whenever the range shifts around its centre price.
   */
  perShare: [string, string] | null
}

/** The smart-vault descriptor as the API serves it on a market row. */
export interface FluidSmartInfo {
  /** Raw `TYPE()`: 20000 = T2, 30000 = T3, 40000 = T4. */
  vaultType?: number
  /**
   * THE POSITION'S RATE, value-weighted across the legs.
   *
   * A leg's own `depositRate` is not wrong — every dollar in the LP earns the
   * DEX trading yield whichever token it sits in — it simply describes a
   * position nobody can hold. On vault #77 the legs read 11.81 % and 8.19 %
   * while the position earns 10.33 %, so a "best APR" taken as the max over
   * legs overstates it by 1.5 points.
   */
  basketSupplyRate?: number
  basketBorrowRate?: number
  isSmartCol?: boolean
  isSmartDebt?: boolean
  /**
   * Both legs of the LP, in the vault's token0/token1 order.
   *
   * THE ORDER IS LOAD-BEARING — a two-input deposit form maps its inputs to it
   * positionally, and swapping them lands the amounts on the wrong legs.
   */
  collateralPair?: string[]
  debtPair?: string[]
  /** Percent APR the LP earns. Supply ADDS it; debt NETS it off. */
  supplyDexTradingRate?: number
  borrowDexTradingRate?: number
  collateral?: FluidSideInfo
  loan?: FluidSideInfo
}

/**
 * The minimum a row must carry to be asked these questions. Deliberately
 * structural rather than `PoolDataItem | PoolEntry`: the two market shapes
 * differ (numbers vs strings) and both flow through here.
 */
export interface SmartVaultRow {
  marketUid: string
  /** True ⇒ this row's asset is one leg of a pool-rebalanced basket. */
  autoBalanced?: boolean
  fluid?: FluidSmartInfo | null
}

export const VAULT_TYPE_T1 = 10000
export const VAULT_TYPE_T2 = 20000
export const VAULT_TYPE_T3 = 30000
export const VAULT_TYPE_T4 = 40000

/**
 * Is this row's asset independently holdable?
 *
 * BRANCH ON THIS AND NOTHING ELSE. It is deliberately lender-agnostic — Lista
 * SmartLP's collateral receipt and GMX's GM/GLV baskets are the same shape, and
 * either integration can set it — so a consumer learns the concept once rather
 * than learning each protocol.
 */
export function isAutoBalanced(row: SmartVaultRow | null | undefined): boolean {
  return row?.autoBalanced === true
}

/** The descriptor, or undefined on an ordinary market. */
export function smartInfo(row: SmartVaultRow | null | undefined): FluidSmartInfo | undefined {
  const f = row?.fluid
  return f && (f.isSmartCol || f.isSmartDebt) ? f : undefined
}

/** Is this market a smart vault at all (any of T2/T3/T4)? */
export function isSmartVault(row: SmartVaultRow | null | undefined): boolean {
  return smartInfo(row) !== undefined
}

/**
 * Is the SUPPLY side of this VAULT a two-token LP?
 *
 * VAULT-level, not row-level. Every row of a smart vault carries the same
 * descriptor, so this is true on rows that are not themselves collateral legs —
 * see {@link rowIsLegOf}, which is what a per-row question must use.
 */
export function hasSmartCollateral(row: SmartVaultRow | null | undefined): boolean {
  return smartInfo(row)?.isSmartCol === true
}

/** Is the BORROW side of this VAULT a two-token LP? Vault-level, as above. */
export function hasSmartDebt(row: SmartVaultRow | null | undefined): boolean {
  return smartInfo(row)?.isSmartDebt === true
}

/**
 * The underlying this row is keyed on, read off the market uid
 * (`<LENDER_KEY>:<chainId>:<underlying>`).
 *
 * From the uid rather than from a field because the two market shapes disagree
 * and one of them lies: `PoolEntry.underlyingAddress` is typed as a required
 * string and is served on ZERO of the 377 live Fluid rows (the address is under
 * `underlyingInfo.asset.address`). The uid is present and correct on both.
 */
export function rowAsset(row: SmartVaultRow | null | undefined): string | null {
  const parts = row?.marketUid?.split(':')
  return parts && parts.length >= 3 ? parts[2].toLowerCase() : null
}

/**
 * Is THIS ROW one of the legs of that side's LP?
 *
 * The distinction {@link hasSmartCollateral} cannot make, and the one that
 * decides whether a basket rate applies to the row in front of you.
 *
 * A **T2** (smart collateral, plain debt) emits three rows — two collateral
 * legs and the loan token — and all three carry `isSmartCol: true`, because the
 * descriptor describes the VAULT. The loan row is not in the collateral basket
 * and does not earn its rate: on the live osETH+ETH / wstETH vault the two
 * collateral legs earn 0.00017 % and the loan row's own deposit rate is a
 * different number entirely. Attributing the basket rate to it is the same
 * class of error as attributing a leg rate to the position — just pointing the
 * other way. 17 Ethereum rows were doing exactly that.
 */
export function rowIsLegOf(
  row: SmartVaultRow | null | undefined,
  side: 'collateral' | 'debt'
): boolean {
  const info = smartInfo(row)
  if (!info) return false
  if (side === 'collateral' ? !info.isSmartCol : !info.isSmartDebt) return false
  const pair = side === 'collateral' ? info.collateralPair : info.debtPair
  const me = rowAsset(row)
  if (!pair || !me) return false
  return pair.some((a) => a.toLowerCase() === me)
}

/** `T2` / `T3` / `T4`, or null for an ordinary market. */
export function vaultTypeLabel(row: SmartVaultRow | null | undefined): string | null {
  const t = smartInfo(row)?.vaultType
  if (t === VAULT_TYPE_T2) return 'T2'
  if (t === VAULT_TYPE_T3) return 'T3'
  if (t === VAULT_TYPE_T4) return 'T4'
  return null
}

/**
 * The POSITION's supply APR — the basket figure when THIS ROW is a leg of an
 * LP collateral side, the row's own rate otherwise.
 *
 * Use this everywhere a rate is displayed or ranked. `legRate` is passed in
 * rather than read off the row because the two market shapes serialize it
 * differently (`depositRate` is a number on `/lending/latest` and a string on
 * `/lending/pools`).
 *
 * Gated on {@link rowIsLegOf}, NOT on the vault's `isSmartCol`: a T2's loan row
 * shares the vault descriptor but is not in the collateral basket, and blending
 * its rate into one is wrong in the same way that showing a leg rate as the
 * position's is wrong.
 */
export function positionSupplyRate(row: SmartVaultRow | null | undefined, legRate: number): number {
  const basket = smartInfo(row)?.basketSupplyRate
  return rowIsLegOf(row, 'collateral') && typeof basket === 'number' ? basket : legRate
}

/** The same for the borrow side. Can legitimately be NEGATIVE on a smart debt. */
export function positionBorrowRate(row: SmartVaultRow | null | undefined, legRate: number): number {
  const basket = smartInfo(row)?.basketBorrowRate
  return rowIsLegOf(row, 'debt') && typeof basket === 'number' ? basket : legRate
}

/** Does the displayed rate differ from this leg's own? Drives the "basket" hint. */
export function isBasketRate(
  row: SmartVaultRow | null | undefined,
  side: 'supply' | 'borrow'
): boolean {
  return rowIsLegOf(row, side === 'supply' ? 'collateral' : 'debt')
}

// ---------------------------------------------------------------------------
// Vault-level grouping (§4.2)
// ---------------------------------------------------------------------------

/**
 * The lender key a marketUid belongs to. Market uids are
 * `<LENDER_KEY>:<chainId>:<underlying>` and a Fluid vault IS a lender key, so
 * this is the vault identity.
 */
export function lenderKeyOf(marketUid: string): string {
  const i = marketUid.indexOf(':')
  return i === -1 ? marketUid : marketUid.slice(0, i)
}

export interface VaultGroup<T extends SmartVaultRow> {
  /** `lenderInfo.key` — for a Fluid smart vault this IS the market. */
  key: string
  /**
   * The row that represents the group in a collapsed table. For a smart vault
   * this is a projection of the position, so its per-leg totals are not the
   * vault's — read the group, not the row, for anything aggregate.
   */
  primary: T
  /** Every leg, in the order the API served them. */
  legs: T[]
  /** True when the group is one smart vault rather than N ordinary markets. */
  smart: boolean
}

/**
 * Group market rows into the positions they actually are.
 *
 * A T4 emits up to four rows for ONE vault, merging where a token sits on both
 * sides. Rendered flat, those are four independent markets at the same LTV and
 * a user picking "the wstETH one" has no way to know it is the same position as
 * "the ETH one" — the failure the earn surface has already been burned by four
 * times (see AGENTS.md, "Two rows that render identically"). Grouping fixes the
 * cause; suffixing the names would only paper over it.
 *
 * ORDINARY MARKETS ARE NOT GROUPED. Two Aave rows under one lender key are two
 * real markets, so only rows that declare themselves smart collapse; everything
 * else comes back as a group of one and renders exactly as before.
 */
export function groupByVault<T extends SmartVaultRow>(rows: T[]): VaultGroup<T>[] {
  const out: VaultGroup<T>[] = []
  const byKey = new Map<string, VaultGroup<T>>()

  for (const row of rows) {
    if (!isSmartVault(row)) {
      out.push({ key: row.marketUid, primary: row, legs: [row], smart: false })
      continue
    }
    const key = lenderKeyOf(row.marketUid)
    const existing = byKey.get(key)
    if (existing) {
      existing.legs.push(row)
      continue
    }
    const group: VaultGroup<T> = { key, primary: row, legs: [row], smart: true }
    byKey.set(key, group)
    out.push(group)
  }
  return out
}

// ---------------------------------------------------------------------------
// Share ↔ token conversion (§4.3, §4.4)
// ---------------------------------------------------------------------------

const WAD = 10n ** 18n

const toBigInt = (v: string | bigint | null | undefined): bigint | null => {
  if (typeof v === 'bigint') return v
  if (typeof v !== 'string' || v.trim() === '') return null
  try {
    return BigInt(v)
  } catch {
    return null
  }
}

/** The side descriptor for one half of the vault, or undefined when simple. */
export function sideInfo(
  row: SmartVaultRow | null | undefined,
  side: 'collateral' | 'debt'
): FluidSideInfo | undefined {
  const f = smartInfo(row)
  if (!f) return undefined
  const s = side === 'collateral' ? f.collateral : f.loan
  return s && s.perShare && s.assets?.length === 2 ? s : undefined
}

/**
 * Which leg of the side is `underlying`, or -1.
 *
 * Positional, because the vault's token0/token1 order is what the action
 * builder's `amount` / `amount1` pair maps onto.
 */
export function legIndexOf(side: FluidSideInfo, underlying: string): number {
  const want = underlying.toLowerCase()
  return side.assets.findIndex((a) => a.underlying.toLowerCase() === want)
}

/**
 * Given `amountRaw` of the leg at `legIndex`, the amount of the OTHER leg that
 * matches the pool's current ratio.
 *
 * This is what pre-fills the second input of a balanced deposit. The decimals
 * cancel — each `perShare` entry is already in its own leg's decimals — so this
 * is exact integer arithmetic with no scaling step to get wrong.
 *
 * Returns null when the side is simple, the ratio is unreadable, or the leg is
 * priced at zero. Null means "do not pre-fill", never "deposit nothing".
 */
export function balancedCounterAmount(
  side: FluidSideInfo,
  legIndex: number,
  amountRaw: string | bigint
): bigint | null {
  if (!side.perShare) return null
  if (legIndex !== 0 && legIndex !== 1) return null
  const amount = toBigInt(amountRaw)
  const self = toBigInt(side.perShare[legIndex])
  const other = toBigInt(side.perShare[legIndex === 0 ? 1 : 0])
  if (amount === null || self === null || other === null || self === 0n) return null
  if (amount < 0n) return null
  return (amount * other) / self
}

/**
 * LP shares that `amountRaw` of the leg at `legIndex` corresponds to at the
 * pool's current ratio.
 *
 * AN ESTIMATE, AND ONLY THAT. Never send it as a `minShares` / `maxShares`
 * bound: the pools are concentrated, so a constant-product estimate understates
 * price impact exactly where it matters. Leave the bound unset and let the API
 * quote it off the DexResolver.
 */
export function sharesForLegAmount(
  side: FluidSideInfo,
  legIndex: number,
  amountRaw: string | bigint
): bigint | null {
  if (!side.perShare) return null
  const amount = toBigInt(amountRaw)
  const per = toBigInt(side.perShare[legIndex])
  if (amount === null || per === null || per === 0n) return null
  return (amount * WAD) / per
}

/**
 * The token split a share balance currently represents, parallel to
 * `side.assets`.
 *
 * This is what a position panel shows instead of "you deposited X" — which
 * stops being true at the first block, because depositing one leg mints a claim
 * on BOTH. Label it as drifting wherever it is rendered.
 */
export function splitForShares(
  side: FluidSideInfo,
  sharesRaw: string | bigint
): [bigint, bigint] | null {
  if (!side.perShare) return null
  const shares = toBigInt(sharesRaw)
  const p0 = toBigInt(side.perShare[0])
  const p1 = toBigInt(side.perShare[1])
  if (shares === null || p0 === null || p1 === null) return null
  return [(shares * p0) / WAD, (shares * p1) / WAD]
}

// ---------------------------------------------------------------------------
// Exits (§4.4) and leverage (§4.5)
// ---------------------------------------------------------------------------

/**
 * Does closing this position need TWO transactions?
 *
 * A T4 full close does: the API returns `transactions: [repayAll,
 * burnCollateral]` with `route: 'sequential'` and `atomic: false`. This is not
 * a preference — the single-call form reverts — so a UI that only reads the
 * first transaction silently does half a close.
 */
export function needsSequentialClose(row: SmartVaultRow | null | undefined): boolean {
  return hasSmartCollateral(row) && hasSmartDebt(row)
}

export function basketIntrinsicYield<T extends SmartVaultRow>(
  row: T | null | undefined,
  side: 'collateral' | 'debt',
  siblings: readonly T[],
  intrinsicOf: (r: T) => number,
  weightOf: (r: T) => number
): number | null {
  if (!rowIsLegOf(row, side)) return null
  const info = smartInfo(row)!
  const pair = (side === 'collateral' ? info.collateralPair : info.debtPair) ?? []
  const wanted = new Set(pair.map((a) => a.toLowerCase()))
  const vault = lenderKeyOf(row!.marketUid)

  let weighted = 0
  let total = 0
  for (const s of siblings) {
    if (lenderKeyOf(s.marketUid) !== vault) continue
    const asset = rowAsset(s)
    if (!asset || !wanted.has(asset)) continue
    const w = weightOf(s)
    if (!Number.isFinite(w) || w <= 0) continue
    const iy = intrinsicOf(s)
    weighted += (Number.isFinite(iy) ? iy : 0) * w
    total += w
  }
  return total > 0 ? weighted / total : null
}
