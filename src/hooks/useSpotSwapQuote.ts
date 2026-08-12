import { useState, useCallback } from 'react'
import { apiFetchEnvelope } from '../sdk/http'
import { useSendLendingTransaction, type LendingTx } from './useSendLendingTransaction'
import { useAtomicBatch } from './useAtomicBatch'
import type { RawCurrency } from '../types/currency'

export interface SpotSwapQuote {
  aggregator: string
  tradeInput: number
  tradeOutput: number
  tx: SpotSwapTx
}

export interface SpotSwapTx {
  to: string
  data: string
  value: string
  description?: string
  /** ERC-20 approve spender (present on x-chain permission entries) */
  spender?: string
}

/** `data` half of the `/v1/actions/swap/spot` response. */
interface SpotQuoteData {
  quotes?: Array<{ aggregator: string; tradeInput: number; tradeOutput: number }>
  currencyIn?: RawCurrency
  currencyOut?: RawCurrency
}

/**
 * `actions` half. Note `alternatives` rather than `transactions`: the quote
 * endpoint returns one executable transaction *per aggregator*, positionally
 * matched to `data.quotes`, so the user can pick a route.
 */
interface SpotQuoteActions {
  alternatives?: SpotSwapTx[]
  permissions?: SpotSwapTx[]
}

interface SwapSuccess {
  hash?: string
}

interface SpotSwapState {
  quotes: SpotSwapQuote[]
  currencyIn: RawCurrency | null
  currencyOut: RawCurrency | null
  permissions: SpotSwapTx[]
  selectedIndex: number | null
  loading: boolean
  executing: boolean
  error: string | null
  txSuccess: SwapSuccess | null
}

export interface SpotSwapParams {
  chainId: string
  tokenIn: string
  tokenOut: string
  amount: string
  slippage: number
  tradeType: 0 | 1
  account?: string
  receiver?: string
  usePendleMintRedeem?: boolean
}

export function useSpotSwapQuote(params: { chainId: string; account?: string }) {
  const { send } = useSendLendingTransaction({ chainId: params.chainId, account: params.account })
  const {
    supported: batchSupported,
    needsUpgrade: batchNeedsUpgrade,
    sendBatch,
  } = useAtomicBatch({ chainId: params.chainId, account: params.account })

  const [state, setState] = useState<SpotSwapState>({
    quotes: [],
    currencyIn: null,
    currencyOut: null,
    permissions: [],
    selectedIndex: null,
    loading: false,
    executing: false,
    error: null,
    txSuccess: null,
  })

  const fetchQuote = useCallback(async (swapParams: SpotSwapParams) => {
    setState((s) => ({
      ...s,
      loading: true,
      error: null,
      quotes: [],
      currencyIn: null,
      currencyOut: null,
      permissions: [],
      selectedIndex: null,
    }))

    try {
      const qs = new URLSearchParams()
      qs.set('chainId', swapParams.chainId)
      qs.set('tokenIn', swapParams.tokenIn)
      qs.set('tokenOut', swapParams.tokenOut)
      qs.set('amount', swapParams.amount)
      qs.set('slippage', String(swapParams.slippage))
      qs.set('tradeType', String(swapParams.tradeType))

      if (swapParams.account) qs.set('account', swapParams.account)
      if (swapParams.receiver) qs.set('receiver', swapParams.receiver)
      if (swapParams.usePendleMintRedeem) qs.set('usePendleMintRedeem', 'true')

      // Envelope, not `apiFetch`: the executable transactions come back under
      // `actions`, alongside the quote numbers in `data`.
      const envelope = await apiFetchEnvelope<SpotQuoteData, SpotQuoteActions>(
        '/v1/actions/swap/spot',
        {
          params: Object.fromEntries(qs),
        }
      )

      const data = envelope.data ?? ({} as SpotQuoteData)
      const rawQuotes: Array<{ aggregator: string; tradeInput: number; tradeOutput: number }> =
        data.quotes ?? []
      const alternatives: SpotSwapTx[] = envelope.actions?.alternatives ?? []

      const quotes: SpotSwapQuote[] = rawQuotes.map((q, i) => ({
        aggregator: q.aggregator ?? 'Unknown',
        tradeInput: q.tradeInput ?? 0,
        tradeOutput: q.tradeOutput ?? 0,
        tx: alternatives[i] ?? { to: '', data: '', value: '0' },
      }))

      const permissions: SpotSwapTx[] = envelope.actions?.permissions ?? []

      setState((s) => ({
        ...s,
        quotes,
        currencyIn: data.currencyIn ?? null,
        currencyOut: data.currencyOut ?? null,
        permissions,
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

  /** Atomic path: approval(s) + the selected swap in one confirmation. */
  const executeAll = useCallback(async () => {
    if (state.selectedIndex === null) return
    const quote = state.quotes[state.selectedIndex]
    if (!quote) return

    setState((s) => ({ ...s, executing: true, error: null }))
    const calls = [...state.permissions, quote.tx] as LendingTx[]
    const { ok, error: txError, hash } = await sendBatch(calls)
    if (ok) {
      setState((s) => ({ ...s, executing: false, txSuccess: { hash } }))
    } else {
      setState((s) => ({ ...s, executing: false, error: txError ?? 'Swap execution failed' }))
    }
  }, [state.selectedIndex, state.quotes, state.permissions, sendBatch])

  const dismissSuccess = useCallback(() => {
    setState((s) => ({ ...s, txSuccess: null, quotes: [], permissions: [], selectedIndex: null }))
  }, [])

  const reset = useCallback(() => {
    setState({
      quotes: [],
      currencyIn: null,
      currencyOut: null,
      permissions: [],
      selectedIndex: null,
      loading: false,
      executing: false,
      error: null,
      txSuccess: null,
    })
  }, [])

  return {
    ...state,
    batchSupported,
    batchNeedsUpgrade,
    fetchQuote,
    selectQuote,
    executePermission,
    executeSwap,
    executeAll,
    dismissSuccess,
    reset,
  }
}
