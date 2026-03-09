import { useState, useCallback } from 'react'
import { useSendLendingTransaction } from '../../../hooks/useSendLendingTransaction'
import type { TradingOperation, TradingQuote, Tx } from './types'
import { BACKEND_BASE_URL } from '../../../config/backend'

const ENDPOINTS: Record<TradingOperation, string> = {
  Loop: `${BACKEND_BASE_URL}/v1/actions/loop/leverage`,
  ColSwap: `${BACKEND_BASE_URL}/v1/actions/loop/collateral-swap`,
  DebtSwap: `${BACKEND_BASE_URL}/v1/actions/loop/debt-swap`,
  Close: `${BACKEND_BASE_URL}/v1/actions/loop/close`,
}

interface QuoteDeltas {
  aggregator: string
  tradeInput: number
  tradeOutput: number
  deltas?: Array<{ amountUSD: number; position: string }>
}

function normalizeQuotes(
  _operation: TradingOperation,
  rawQuotes: any[],
  alternatives: Tx[] = []
): TradingQuote[] {
  return rawQuotes.map((q, i) => {
    let aggregator = 'Unknown'
    let tradeAmountIn = 0
    let tradeAmountOut = 0
    let positionCollateralUSD: number | undefined
    let positionDebtUSD: number | undefined

    const deltas = q.deltas as QuoteDeltas | undefined
    if (deltas) {
      aggregator = deltas.aggregator ?? 'Unknown'
      tradeAmountIn = deltas.tradeInput ?? 0
      tradeAmountOut = deltas.tradeOutput ?? 0
      // Loop responses include nested deltas with per-position USD values
      if (deltas.deltas) {
        for (const d of deltas.deltas) {
          if (d.position === 'collateral') positionCollateralUSD = d.amountUSD
          else if (d.position === 'debt') positionDebtUSD = d.amountUSD
        }
      }
    }

    // Transaction data comes from actions.alternatives (matched by index),
    // or falls back to tx on the quote object itself
    const tx: Tx = alternatives[i] ?? q.tx ?? { to: '', data: '', value: '0' }

    return {
      aggregator,
      tradeAmountIn,
      tradeAmountOut,
      positionCollateralUSD,
      positionDebtUSD,
      tx,
    }
  })
}

interface QuoteState {
  quotes: TradingQuote[]
  permissions: Tx[]
  transactions: Tx[]
  selectedIndex: number | null
  loading: boolean
  executing: boolean
  error: string | null
}

export function useTradingQuotes(params: { chainId: string; account?: string }) {
  const { send } = useSendLendingTransaction({ chainId: params.chainId, account: params.account })

  const [state, setState] = useState<QuoteState>({
    quotes: [],
    permissions: [],
    transactions: [],
    selectedIndex: null,
    loading: false,
    executing: false,
    error: null,
  })

  const fetchQuotes = useCallback(
    async (
      operation: TradingOperation,
      params: Record<string, string | number | boolean | bigint>,
      account?: string
    ) => {
      setState((s) => ({
        ...s,
        loading: true,
        error: null,
        quotes: [],
        permissions: [],
        transactions: [],
        selectedIndex: null,
      }))

      try {
        const allParams = account ? { ...params, account } : params
        const qs = new URLSearchParams(Object.entries(allParams).map(([k, v]) => [k, String(v)]))

        const res = await fetch(`${ENDPOINTS[operation]}?${qs}`)
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`HTTP ${res.status}: ${text || res.statusText}`)
        }

        const envelope = await res.json()
        if (!envelope.success) {
          throw new Error(envelope.error?.message ?? 'API error')
        }
        const alternatives: Tx[] = envelope.actions?.alternatives ?? []
        const quotes = normalizeQuotes(operation, envelope.data?.quotes ?? [], alternatives)
        // Permissions: check both envelope.actions and envelope.data (varies by lender)
        const permissions: Tx[] = envelope.actions?.permissions ?? envelope.data?.permissions ?? []
        // Transactions: collateral enable/disable (e.g. Compound V2 / Venus)
        const transactions: Tx[] = envelope.actions?.transactions ?? envelope.data?.transactions ?? []

        setState((s) => ({
          ...s,
          quotes,
          permissions,
          transactions,
          selectedIndex: quotes.length > 0 ? 0 : null,
          loading: false,
        }))
      } catch (e: any) {
        setState((s) => ({ ...s, loading: false, error: e.message ?? 'Unknown error' }))
      }
    },
    []
  )

  const selectQuote = useCallback((index: number) => {
    setState((s) => ({ ...s, selectedIndex: index }))
  }, [])

  const executePermission = useCallback(
    async (tx: Tx) => {
      const { ok, error: txError } = await send(tx)
      if (!ok) {
        setState((s) => ({ ...s, error: txError ?? 'Permission failed' }))
      }
    },
    [send]
  )

  const executeTransaction = useCallback(
    async (tx: Tx) => {
      const { ok, error: txError } = await send(tx)
      if (!ok) {
        setState((s) => ({ ...s, error: txError ?? 'Transaction failed' }))
      }
    },
    [send]
  )

  const executeQuote = useCallback(async () => {
    if (state.selectedIndex === null) return

    setState((s) => ({ ...s, executing: true, error: null }))
    const quote = state.quotes[state.selectedIndex]
    const { ok, error: txError } = await send(quote.tx)
    setState((s) => ({
      ...s,
      executing: false,
      error: ok ? null : (txError ?? 'Execution failed'),
    }))
  }, [state.selectedIndex, state.quotes, send])

  const reset = useCallback(() => {
    setState({
      quotes: [],
      permissions: [],
      transactions: [],
      selectedIndex: null,
      loading: false,
      executing: false,
      error: null,
    })
  }, [])

  return {
    ...state,
    fetchQuotes,
    selectQuote,
    executePermission,
    executeTransaction,
    executeQuote,
    reset,
  }
}
