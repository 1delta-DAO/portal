import { useState, useCallback } from 'react'
import { apiFetchEnvelope } from '../sdk/http'
import { useSendLendingTransaction, type LendingTx } from './useSendLendingTransaction'
import type { RawCurrency } from '../types/currency'
import type { SpotSwapTx } from './useSpotSwapQuote'

export interface XChainSwapQuote {
  /** Bridge name for cross-chain quotes, aggregator name on same-chain fallback */
  label: string
  tradeInput: number
  tradeOutput: number
  /** Estimated bridging duration in seconds (cross-chain only) */
  estimatedDuration?: number
  /** This bridge's deposit contract — the ERC-20 approve spender */
  approvalTarget?: string
  approvalRequired?: boolean
  tx: SpotSwapTx
}

/** `data` half of the `/v1/actions/swap/x-chain` response. */
interface XChainQuoteData {
  /** `'spot'` when the backend fell back to the same-chain meta-aggregator. */
  fallback?: string
  quotes?: Array<{
    bridge?: string
    aggregator?: string
    tradeInput: number
    tradeOutput: number
    estimatedDuration?: number
    approvalTarget?: string
    approvalRequired?: boolean
  }>
  currencyIn?: RawCurrency
  currencyOut?: RawCurrency
}

/** `actions` half — one transaction per route, matched positionally to `data.quotes`. */
interface XChainQuoteActions {
  alternatives?: SpotSwapTx[]
  permissions?: SpotSwapTx[]
}

interface XChainSwapState {
  quotes: XChainSwapQuote[]
  currencyIn: RawCurrency | null
  currencyOut: RawCurrency | null
  permissions: SpotSwapTx[]
  /** true when the backend fell back to the spot meta-aggregator (same chain) */
  isSpotFallback: boolean
  /** true when the last fetch succeeded but no route quoted the pair */
  noRoutes: boolean
  selectedIndex: number | null
  loading: boolean
  executing: boolean
  error: string | null
  txSuccess: { hash?: string } | null
}

export interface XChainSwapParams {
  fromChainId: string
  toChainId: string
  tokenIn: string
  tokenOut: string
  amount: string
  slippage: number
  account?: string
  receiver?: string
  order?: 'CHEAPEST' | 'FASTEST'
}

const EMPTY_STATE: XChainSwapState = {
  quotes: [],
  currencyIn: null,
  currencyOut: null,
  permissions: [],
  isSpotFallback: false,
  noRoutes: false,
  selectedIndex: null,
  loading: false,
  executing: false,
  error: null,
  txSuccess: null,
}

/**
 * Cross-chain swap quotes via GET /v1/actions/swap/x-chain.
 *
 * Unlike spot, every bridge has its own deposit contract, so approvals in
 * `actions.permissions` are per bridge (description carries the bridge
 * name). Use `permissionsForSelected` to only surface the approve matching
 * the chosen quote.
 */
export function useXChainSwapQuote(params: { fromChainId: string; account?: string }) {
  // Transactions execute on the source chain
  const { send } = useSendLendingTransaction({
    chainId: params.fromChainId,
    account: params.account,
  })

  const [state, setState] = useState<XChainSwapState>(EMPTY_STATE)

  const fetchQuote = useCallback(async (swapParams: XChainSwapParams) => {
    setState((s) => ({
      ...s,
      loading: true,
      error: null,
      quotes: [],
      currencyIn: null,
      currencyOut: null,
      permissions: [],
      isSpotFallback: false,
      noRoutes: false,
      selectedIndex: null,
    }))

    try {
      const qs = new URLSearchParams()
      qs.set('fromChainId', swapParams.fromChainId)
      qs.set('toChainId', swapParams.toChainId)
      qs.set('tokenIn', swapParams.tokenIn)
      qs.set('tokenOut', swapParams.tokenOut)
      qs.set('amount', swapParams.amount)
      qs.set('slippage', String(swapParams.slippage))
      if (swapParams.account) qs.set('account', swapParams.account)
      if (swapParams.receiver) qs.set('receiver', swapParams.receiver)
      if (swapParams.order) qs.set('order', swapParams.order)

      // Envelope, not `apiFetch`: one executable transaction per bridge route
      // comes back under `actions.alternatives`, positionally matched to
      // `data.quotes`. Same shape as the spot quote.
      const envelope = await apiFetchEnvelope<XChainQuoteData, XChainQuoteActions>(
        '/v1/actions/swap/x-chain',
        { params: Object.fromEntries(qs) }
      )

      const data = envelope.data ?? ({} as XChainQuoteData)
      const isSpotFallback = data.fallback === 'spot'
      const rawQuotes: Array<{
        bridge?: string
        aggregator?: string
        tradeInput: number
        tradeOutput: number
        estimatedDuration?: number
        approvalTarget?: string
        approvalRequired?: boolean
      }> = data.quotes ?? []
      const alternatives: SpotSwapTx[] = envelope.actions?.alternatives ?? []

      const quotes: XChainSwapQuote[] = rawQuotes.map((q, i) => ({
        label: q.bridge ?? q.aggregator ?? 'Unknown',
        tradeInput: q.tradeInput ?? 0,
        tradeOutput: q.tradeOutput ?? 0,
        estimatedDuration: q.estimatedDuration,
        approvalTarget: q.approvalTarget,
        approvalRequired: q.approvalRequired,
        tx: alternatives[i] ?? { to: '', data: '', value: '0' },
      }))

      const permissions: SpotSwapTx[] = envelope.actions?.permissions ?? []

      setState((s) => ({
        ...s,
        quotes,
        currencyIn: data.currencyIn ?? null,
        currencyOut: data.currencyOut ?? null,
        permissions,
        isSpotFallback,
        noRoutes: quotes.length === 0,
        selectedIndex: quotes.length > 0 ? 0 : null,
        loading: false,
      }))

      return { quotes, permissions }
    } catch (e: any) {
      setState((s) => ({ ...s, loading: false, error: e.message ?? 'Unknown error' }))
      return null
    }
  }, [])

  const selectQuote = useCallback((index: number) => {
    setState((s) => ({ ...s, selectedIndex: index }))
  }, [])

  /**
   * Approvals relevant to a quote: on spot fallback all permissions apply
   * (single composer spender). Cross-chain, approves are matched
   * STRUCTURALLY by spender === the quote's `approvalTarget` — several
   * bridges can share one spender (the 1delta composer for composed
   * routes), so name matching is not reliable. Description matching stays
   * as fallback for older API responses without `spender`.
   */
  const permissionsForQuote = useCallback(
    (quote: XChainSwapQuote | null): SpotSwapTx[] => {
      if (!quote) return []
      if (state.isSpotFallback) return state.permissions
      if (quote.approvalRequired === false) return []
      return state.permissions.filter((p) =>
        p.spender && quote.approvalTarget
          ? p.spender.toLowerCase() === quote.approvalTarget.toLowerCase()
          : (p.description ?? '').includes(quote.label)
      )
    },
    [state.permissions, state.isSpotFallback]
  )

  const executePermission = useCallback(
    async (tx: SpotSwapTx) => {
      const { ok, error: txError } = await send(tx as LendingTx)
      if (!ok) {
        setState((s) => ({ ...s, error: txError ?? 'Permission failed' }))
      }
    },
    [send]
  )

  const executeSwap = useCallback(async () => {
    if (state.selectedIndex === null) return

    setState((s) => ({ ...s, executing: true, error: null }))
    const quote = state.quotes[state.selectedIndex]
    const { ok, error: txError, hash } = await send(quote.tx as LendingTx)
    if (ok) {
      setState((s) => ({ ...s, executing: false, txSuccess: { hash } }))
    } else {
      setState((s) => ({ ...s, executing: false, error: txError ?? 'Swap execution failed' }))
    }
  }, [state.selectedIndex, state.quotes, send])

  const dismissSuccess = useCallback(() => {
    setState((s) => ({ ...s, txSuccess: null, quotes: [], permissions: [], selectedIndex: null }))
  }, [])

  const reset = useCallback(() => {
    setState(EMPTY_STATE)
  }, [])

  return {
    ...state,
    fetchQuote,
    selectQuote,
    permissionsForQuote,
    executePermission,
    executeSwap,
    dismissSuccess,
    reset,
  }
}
