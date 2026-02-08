import { useState, useCallback } from 'react'
import { Address, Hex } from 'viem'
import { useWalletClient } from 'wagmi'
import type { TradingOperation, TradingQuote, Tx } from './types'

const ENDPOINTS: Record<TradingOperation, string> = {
  Loop: 'https://portal.1delta.io/v1/actions/loop/leverage',
  ColSwap: 'https://portal.1delta.io/v1/actions/loop/collateral-swap',
  DebtSwap: 'https://portal.1delta.io/v1/actions/loop/debt-swap',
  Close: 'https://portal.1delta.io/v1/actions/loop/close',
}

interface QuoteDeltas {
  aggregator: string
  tradeInput: number
  tradeOutput: number
  deltas?: Array<{ amountUSD: number; position: string }>
}

function normalizeQuotes(_operation: TradingOperation, rawQuotes: any[]): TradingQuote[] {
  return rawQuotes.map((q) => {
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

    return {
      aggregator,
      tradeAmountIn,
      tradeAmountOut,
      positionCollateralUSD,
      positionDebtUSD,
      tx: q.tx as Tx,
    }
  })
}

interface QuoteState {
  quotes: TradingQuote[]
  permissions: Tx[]
  selectedIndex: number | null
  loading: boolean
  executing: boolean
  error: string | null
}

export function useTradingQuotes() {
  const { data: signer } = useWalletClient()

  const [state, setState] = useState<QuoteState>({
    quotes: [],
    permissions: [],
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

        const data = await res.json()
        const quotes = normalizeQuotes(operation, data.quotes ?? [])
        const permissions: Tx[] = data.permissionTxns ?? []

        setState((s) => ({
          ...s,
          quotes,
          permissions,
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
      if (!signer) return
      await signer.sendTransaction({
        to: tx.to as Address,
        data: tx.data as Hex,
        value: BigInt(tx.value ?? 0),
      })
    },
    [signer]
  )

  const executeQuote = useCallback(async () => {
    if (state.selectedIndex === null || !signer) return

    setState((s) => ({ ...s, executing: true, error: null }))
    try {
      const quote = state.quotes[state.selectedIndex]
      await signer.sendTransaction({
        to: quote.tx.to as Address,
        data: quote.tx.data as Hex,
        value: BigInt(quote.tx.value ?? 0),
      })
      setState((s) => ({ ...s, executing: false }))
    } catch (e: any) {
      setState((s) => ({ ...s, executing: false, error: e.message ?? 'Execution failed' }))
    }
  }, [state.selectedIndex, state.quotes, signer])

  const reset = useCallback(() => {
    setState({
      quotes: [],
      permissions: [],
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
    executeQuote,
    reset,
  }
}
