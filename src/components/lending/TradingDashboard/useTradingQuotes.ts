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

interface LoopPosition {
  aggregator: string
  positionDebtUSD: number
  positionCollateralUSD: number
  tradeAmountInUSD: number
  tradeAmountOutUSD: number
}

interface SwapDeltas {
  aggregator: string
  tradeInput: number
  tradeOutput: number
}

interface ClosePosition {
  aggregator: string
  tradeAmountInUSD: number
  tradeAmountOutUSD: number
}

function normalizeQuotes(operation: TradingOperation, rawQuotes: any[]): TradingQuote[] {
  return rawQuotes.map((q) => {
    let aggregator = 'Unknown'
    let tradeAmountInUSD = 0
    let tradeAmountOutUSD = 0
    let positionCollateralUSD: number | undefined
    let positionDebtUSD: number | undefined

    if (operation === 'Loop') {
      const pos = q.position as LoopPosition
      aggregator = pos.aggregator
      tradeAmountInUSD = pos.tradeAmountInUSD
      tradeAmountOutUSD = pos.tradeAmountOutUSD
      positionCollateralUSD = pos.positionCollateralUSD
      positionDebtUSD = pos.positionDebtUSD
    } else if (operation === 'ColSwap' || operation === 'DebtSwap') {
      const deltas = q.deltas as SwapDeltas
      aggregator = deltas.aggregator ?? 'Unknown'
      tradeAmountInUSD = deltas.tradeInput ?? 0
      tradeAmountOutUSD = deltas.tradeOutput ?? 0
    } else {
      const pos = q.position as ClosePosition
      aggregator = pos.aggregator
      tradeAmountInUSD = pos.tradeAmountInUSD
      tradeAmountOutUSD = pos.tradeAmountOutUSD
    }

    return {
      aggregator,
      tradeAmountInUSD,
      tradeAmountOutUSD,
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
