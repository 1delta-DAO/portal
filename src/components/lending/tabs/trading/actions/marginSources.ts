import {
  isAggregatePosition,
  type UserSubAccount,
} from '../../../../../sdk/lending-helper/userPositionTypes'

/**
 * A place the loop's margin can be funded from that is NOT the wallet: an
 * existing sub-account of the same lender that already holds the pay asset.
 *
 * This exists because of a Dolomite-shaped constraint. `GenericTraderProxyV2`
 * moves funds only BETWEEN a caller's own sub-accounts — `TransferCollateralParam`
 * is `{fromAccountNumber, toAccountNumber, …}` with no wallet leg and no payable
 * entry point — so wallet-funded margin has to be deposited in a SEPARATE
 * transaction before the loop can run. Margin that already sits inside Dolomite
 * does not: the transfer rides inside the leverage call itself, and the open
 * collapses from two transactions to one.
 */
export interface MarginSource {
  /** Sub-account the margin would be transferred FROM. `'0'` is the default account. */
  accountId: string
  /** Deposited balance in the pay asset, token units. */
  balance: string
  balanceUSD: number
  /**
   * The source account's CURRENT health, or null when it carries no debt.
   * Non-null means moving margin out reduces its collateral — deliberately not
   * projected forward here (per-asset collateral factors make a naive scaling
   * wrong), so the UI warns rather than inventing a post-move number.
   */
  health: number | null
}

/**
 * Sub-accounts that could fund `marketUid`'s asset as margin, richest first.
 *
 * `tradeAccountId` is excluded on purpose and is not an omission: the margin is
 * already where the trade needs it, so there is nothing to transfer, and the API
 * treats a source equal to the trade account as absent (falling back to the
 * wallet deposit). Offering it would hand the user a second transaction while
 * appearing to remove one.
 */
export function deriveMarginSources(args: {
  subAccounts: UserSubAccount[]
  /** Sub-account the loop opens into. `undefined` means the default account. */
  tradeAccountId?: string
  /** Market whose asset the margin is paid in. */
  marketUid?: string
}): MarginSource[] {
  const { subAccounts, marketUid } = args
  if (!marketUid) return []
  // An absent trade account IS the default account, not "no account" — without
  // this the default sub-account would offer to transfer margin to itself.
  const tradeAccountId = args.tradeAccountId ?? '0'

  const out: MarginSource[] = []
  for (const sub of subAccounts) {
    if (sub.accountId === tradeAccountId) continue
    for (const pos of sub.positions) {
      // Brokered markets put several entries under one marketUid; the aggregate
      // is the one carrying the whole deposit.
      if (pos.marketUid !== marketUid || !isAggregatePosition(pos)) continue
      const balance = String(pos.deposits ?? '0')
      if (!(Number(balance) > 0)) continue
      out.push({
        accountId: sub.accountId,
        balance,
        balanceUSD: pos.depositsUSD ?? 0,
        health: sub.health,
      })
      break
    }
  }
  return out.sort((a, b) => Number(b.balance) - Number(a.balance))
}
