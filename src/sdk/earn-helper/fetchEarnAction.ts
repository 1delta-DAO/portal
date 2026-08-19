import { apiFetchEnvelope, type ApiPermission } from '../http'
import type { EarnActionKind } from './types'

/** One call the wallet has to make. Matches the worker's `Transaction`. */
export interface EarnTx extends ApiPermission {
  /** `erc20-approval`, `credit-delegation`, … where the backend states it. */
  type?: string
  spender?: string
  /**
   * Which aggregator built this route. Present on `alternatives` entries only,
   * and the only reliable handle for pairing one to its quoted numbers.
   */
  aggregator?: string
}

/**
 * One aggregator's version of the SAME action, with what it pays out.
 *
 * A route is not a step: every entry here is a complete transaction, and
 * exactly one of them gets sent. The list exists because the price differs
 * between them — on a Pendle PT the venue's own AMM and a general aggregator
 * routing into it can be half a percent apart, which is the whole reason the
 * user is offered the choice rather than handed the server's first pick.
 */
export interface EarnRoute {
  /** `Pendle`, `Enso`, … — as the server labelled the alternative. */
  aggregator: string
  /** Pay-asset units in (human, not base units). */
  tradeInput?: number
  /** Market-asset units out. */
  tradeOutput?: number
  tx: EarnTx
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
  /**
   * Every aggregator route the server built for this action, best first, when
   * it built more than one. Empty for an action that is not a trade — a plain
   * 4626 deposit has one way to happen.
   *
   * `transactions` already holds the winner, so a client that ignores this
   * behaves exactly as before.
   */
  routes: EarnRoute[]
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
/**
 * `data.quotes` — the informational half, with the calldata stripped out.
 *
 * TWO shapes reach here and both are load-bearing. A trade-shaped quote (a
 * Pendle PT, a secondary-market row) carries its aggregator and amounts at the
 * top level; a composed-zap quote (a pay-asset conversion into a lending
 * market or a vault) carries the same fields under `deltas`, because that path
 * also reports the position deltas the trade produces. Reading only one of
 * them leaves half the surface with routes that have a name and no price.
 */
interface EarnQuoteInfo {
  aggregator?: string
  tradeInput?: number
  tradeOutput?: number
  deltas?: { aggregator?: string; tradeInput?: number; tradeOutput?: number }
}

/** Flatten either quote shape to `{aggregator, tradeInput, tradeOutput}`. */
function normalizeQuote(q: EarnQuoteInfo): EarnQuoteInfo {
  return {
    aggregator: q.aggregator ?? q.deltas?.aggregator,
    tradeInput: q.tradeInput ?? q.deltas?.tradeInput,
    tradeOutput: q.tradeOutput ?? q.deltas?.tradeOutput,
  }
}

interface EarnActionEnvelope {
  transactions?: EarnTx[]
  /**
   * Aggregator-quoted builds (a pay-asset conversion), best output first.
   * The worker's `successAction` puts quote-list results HERE and leaves
   * `transactions` empty — reading only `transactions` reports "the server
   * returned no transaction" for every zap that actually succeeded.
   */
  alternatives?: EarnTx[]
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
  /**
   * Percent (`0.5` = 0.5 %). Converted to BASIS POINTS on the wire — the
   * worker's earn translator forwards `slippage` verbatim to routes that all
   * read it as bps (`/v1/actions/vaults/*` validates `[0, 10000]` bps;
   * `/v1/actions/lending/deposit`'s swap branch runs it through
   * `slippageBpsToPercent`). Sending percent unconverted quoted Pendle legs at
   * a 0.5 bps tolerance — 100× tighter than the user chose.
   */
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
    const { data, actions } = await apiFetchEnvelope<
      { quotes?: EarnQuoteInfo[] } | null,
      EarnActionEnvelope
    >(`/v1/actions/earn/${params.action}`, {
      params: {
        earnUid: params.earnUid,
        amount: params.amount,
        operator: params.operator,
        receiver: params.receiver,
        payAsset: params.payAsset,
        receiveAsset: params.receiveAsset,
        isAll: params.isAll ? 'true' : undefined,
        isShares: params.isShares ? 'true' : undefined,
        slippage:
          params.slippage != null && Number.isFinite(params.slippage)
            ? Math.round(params.slippage * 100)
            : undefined,
        ...(params.extra ?? {}),
      },
    })

    // A conversion (pay-asset zap, a PT trade) comes back as `alternatives` —
    // one built transaction per aggregator, sorted best-output-first by the
    // server. Take the winner as THE transaction; the rest are the same action
    // at a worse price, not steps to execute.
    const transactions = actions?.transactions?.length
      ? actions.transactions
      : actions?.alternatives?.length
        ? [actions.alternatives[0]]
        : []

    // Pair each alternative with its numbers. BY AGGREGATOR, not by index:
    // `data.quotes` keeps a quote that produced no calldata while
    // `alternatives` cannot, so on any such failure the index would pair one
    // aggregator's transaction with another's output — a mis-pairing that is
    // invisible, since both halves look right on their own.
    const quoteInfo = new Map<string, EarnQuoteInfo>()
    for (const raw of data?.quotes ?? []) {
      const q = normalizeQuote(raw ?? {})
      if (q.aggregator) quoteInfo.set(q.aggregator, q)
    }

    const routes: EarnRoute[] = (actions?.alternatives ?? [])
      .map((tx, i) => {
        const aggregator = tx.aggregator ?? tx.description ?? `Route ${i + 1}`
        const info = quoteInfo.get(aggregator)
        return {
          aggregator,
          tradeInput: info?.tradeInput,
          tradeOutput: info?.tradeOutput,
          tx,
        }
      })
      // One route is not a choice — offering it as one implies the others were
      // rejected rather than never existing.
      .filter((_, _i, all) => all.length > 1)

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
        routes,
        postTransactions: actions?.postTransactions ?? [],
        signatures: actions?.signatures ?? [],
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
