import { apiFetchEnvelope } from '../http'
import type { EarnActionKind } from './types'

/** One call the wallet has to make. Matches the worker's `Transaction`. */
export interface EarnTx {
  to: string
  data: string
  value: string
  /** Human label the backend attaches to approvals / setup steps. */
  description?: string
  /** `erc20-approval`, `credit-delegation`, … where the backend states it. */
  type?: string
  spender?: string
}

export interface EarnActionResult {
  /** Approvals and grants, in order, BEFORE the action itself. */
  permissions: EarnTx[]
  /** The action, as one or more ordered calls. */
  transactions: EarnTx[]
  /**
   * Calls that run AFTER the main action — e.g. unwrapping the WETH a close
   * freed. Ordered, and only meaningful once `transactions` has landed.
   */
  postTransactions: EarnTx[]
  /**
   * EIP-712 requests standing in for `permissions` entries.
   *
   * Surfaced rather than dropped: a permit that replaces an approval means the
   * approval is NOT in `permissions`, so ignoring these would send the action
   * with no allowance in place and revert.
   */
  signatures: unknown[]
}

/**
 * The `actions` block, as the worker's `successAction` builds it.
 *
 * **Not `data`.** The envelope carries informational fields under `data` and
 * every call under a sibling `actions` — so `apiFetchLoose`, which returns
 * `json.data ?? json`, silently discards the entire transaction machinery. It
 * produced an empty `transactions` on every row, which reads as "the builder
 * declined" rather than "the client looked in the wrong place".
 */
interface EarnActionEnvelope {
  transactions?: EarnTx[]
  permissions?: EarnTx[] | null
  postTransactions?: EarnTx[]
  signatures?: unknown[]
}

export interface FetchEarnActionParams {
  earnUid: string
  action: EarnActionKind
  /** Base units. The panel converts from the human amount. */
  amount?: string
  operator: string
  receiver?: string
  /** Deposits: what the user pays with. Withdrawals: what they receive. */
  payAsset?: string
  receiveAsset?: string
  /** Exit the whole position — lets the builder read the balance on-chain. */
  isAll?: boolean
  /** Withdrawals denominated in SHARES rather than the underlying. */
  isShares?: boolean
  /** Percent, not bps. Only sent where the capability asks for a bound. */
  slippage?: number
  /**
   * Anything a specific venue needs that this app does not model — Yield
   * Basis's `debt`/`minShares`, Strata's `claimToken`, Apyx's `tokenId`.
   *
   * Deliberately open: the dispatcher forwards unknown params verbatim, so a
   * newly integrated venue can take a parameter without a release here. The
   * server tells us WHICH via `capability.requires` / `inputs[].needs`.
   */
  extra?: Record<string, string | number | boolean | undefined>
}

/**
 * Build the calls for one earn action.
 *
 * One endpoint for both halves of the listing: `/v1/actions/earn/{action}`
 * resolves `earnUid` and delegates to the lending or vault builder that owns
 * the row. **This client never decides which** — that was the whole point of
 * the unified surface, and a `venueKind === 'vault'` branch here would put the
 * routing matrix straight back into the browser.
 */
export async function fetchEarnAction(
  params: FetchEarnActionParams
): Promise<{ success: true; result: EarnActionResult } | { success: false; error: string }> {
  try {
    const { actions } = await apiFetchEnvelope<unknown, EarnActionEnvelope>(
      `/v1/actions/earn/${params.action}`,
      {
        params: {
          earnUid: params.earnUid,
          amount: params.amount,
          operator: params.operator,
          receiver: params.receiver,
          payAsset: params.payAsset,
          receiveAsset: params.receiveAsset,
          isAll: params.isAll ? 'true' : undefined,
          isShares: params.isShares ? 'true' : undefined,
          slippage: params.slippage,
          ...(params.extra ?? {}),
        },
      }
    )

    const transactions = actions?.transactions ?? []

    if (transactions.length === 0) {
      // A 200 with nothing to send is not success — it is a builder that
      // declined without saying so, and returning `ok` here would leave the
      // user pressing a button that does nothing.
      return { success: false, error: 'The server returned no transaction' }
    }

    return {
      success: true,
      result: {
        permissions: actions?.permissions ?? [],
        transactions,
        postTransactions: actions?.postTransactions ?? [],
        signatures: actions?.signatures ?? [],
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
