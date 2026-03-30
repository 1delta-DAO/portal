import { useState, useCallback } from 'react'
import { BACKEND_BASE_URL } from '../config/backend'
import { useSendLendingTransaction, type LendingTx } from './useSendLendingTransaction'
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

  const fetchQuote = useCallback(
    async (swapParams: SpotSwapParams) => {
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

        const res = await fetch(`${BACKEND_BASE_URL}/v1/actions/swap/spot?${qs}`)
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`HTTP ${res.status}: ${text || res.statusText}`)
        }

        const envelope = await res.json()
        if (!envelope.success) {
          throw new Error(envelope.error?.message ?? 'API error')
        }

        const data = envelope.data ?? {}
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
    },
    []
  )

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
    fetchQuote,
    selectQuote,
    executePermission,
    executeSwap,
    dismissSuccess,
    reset,
  }
}
