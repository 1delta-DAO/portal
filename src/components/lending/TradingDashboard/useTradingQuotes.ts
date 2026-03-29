import { useState, useCallback } from 'react'
import { useSendLendingTransaction } from '../../../hooks/useSendLendingTransaction'
import type { TradingOperation, TradingQuote, Tx } from './types'
import type { RateImpactEntry } from '../../../sdk/lending-helper/fetchLendingAction'
import { BACKEND_BASE_URL } from '../../../config/backend'
import type { LoopRangeSimulationBody } from '../../../sdk/lending-helper/fetchLoopRange'
import type { UserSubAccount } from '../../../hooks/lending/useUserData'

export function buildSimulationBody(sub: UserSubAccount): LoopRangeSimulationBody {
  return {
    balanceData: {
      borrowDiscountedCollateral: sub.balanceData.borrowDiscountedCollateral ?? 0,
      collateral: sub.balanceData.collateral,
      debt: sub.balanceData.debt,
      adjustedDebt: sub.balanceData.adjustedDebt ?? 0,
      deposits: sub.balanceData.deposits,
      nav: sub.balanceData.nav,
      deposits24h: sub.balanceData.deposits24h,
      debt24h: sub.balanceData.debt24h,
      nav24h: sub.balanceData.nav24h,
    },
    aprData: sub.aprData,
    modeId: String(sub.userConfig.selectedMode),
    positions: sub.positions.map((p) => ({
      marketUid: p.marketUid,
      deposits: String(p.deposits),
      depositsUSD: p.depositsUSD,
      debt: String(p.debt),
      debtUSD: p.debtUSD,
      debtStableUSD: p.debtStableUSD,
      collateralEnabled: p.collateralEnabled,
    })),
  }
}

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

export interface SimulationResult {
  pre: {
    healthFactor: number
    borrowCapacity: number
  }
  post: {
    healthFactor: number
    borrowCapacity: number
  }
}

interface TxSuccessState {
  operation: TradingOperation
  hash?: string
}

interface QuoteState {
  quotes: TradingQuote[]
  permissions: Tx[]
  transactions: Tx[]
  rateImpact: RateImpactEntry[] | null
  simulation: SimulationResult | null
  selectedIndex: number | null
  loading: boolean
  executingPermission: boolean
  executingTransaction: boolean
  executingQuote: boolean
  permissionsCompleted: number
  transactionsCompleted: number
  txSuccess: TxSuccessState | null
  error: string | null
}

export function useTradingQuotes(params: { chainId: string; account?: string }) {
  const { send } = useSendLendingTransaction({ chainId: params.chainId, account: params.account })

  const initialState: QuoteState = {
    quotes: [],
    permissions: [],
    transactions: [],
    rateImpact: null,
    simulation: null,
    selectedIndex: null,
    loading: false,
    executingPermission: false,
    executingTransaction: false,
    executingQuote: false,
    permissionsCompleted: 0,
    transactionsCompleted: 0,
    txSuccess: null,
    error: null,
  }

  const [state, setState] = useState<QuoteState>(initialState)

  const fetchQuotes = useCallback(
    async (
      operation: TradingOperation,
      params: Record<string, string | number | boolean | bigint>,
      account?: string,
      body?: LoopRangeSimulationBody
    ) => {
      setState((s) => ({
        ...s,
        loading: true,
        error: null,
        quotes: [],
        permissions: [],
        transactions: [],
        rateImpact: null,
        simulation: null,
        selectedIndex: null,
        permissionsCompleted: 0,
        transactionsCompleted: 0,
        txSuccess: null,
      }))

      try {
        const allParams = account ? { ...params, account } : params
        const qs = new URLSearchParams(Object.entries(allParams).map(([k, v]) => [k, String(v)]))

        const res = body
          ? await fetch(`${ENDPOINTS[operation]}?${qs}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
          : await fetch(`${ENDPOINTS[operation]}?${qs}`)
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

        const rateImpact: RateImpactEntry[] | null = envelope.data?.rateImpact ?? null

        const rawSim = envelope.data?.simulation
        const simulation: SimulationResult | null =
          rawSim?.pre && rawSim?.post
            ? {
                pre: {
                  healthFactor: rawSim.pre.healthFactor ?? 0,
                  borrowCapacity: rawSim.pre.borrowCapacity ?? 0,
                },
                post: {
                  healthFactor: rawSim.post.healthFactor ?? 0,
                  borrowCapacity: rawSim.post.borrowCapacity ?? 0,
                },
              }
            : null

        setState((s) => ({
          ...s,
          quotes,
          permissions,
          transactions,
          rateImpact,
          simulation,
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

  const executeNextPermission = useCallback(async () => {
    const idx = state.permissionsCompleted
    if (idx >= state.permissions.length) return
    setState((s) => ({ ...s, executingPermission: true, error: null }))
    const { ok, error: txError } = await send(state.permissions[idx])
    if (ok) {
      setState((s) => ({ ...s, executingPermission: false, permissionsCompleted: s.permissionsCompleted + 1 }))
    } else {
      setState((s) => ({ ...s, executingPermission: false, error: txError ?? 'Permission failed' }))
    }
  }, [state.permissionsCompleted, state.permissions, send])

  const executeNextTransaction = useCallback(async () => {
    const idx = state.transactionsCompleted
    if (idx >= state.transactions.length) return
    setState((s) => ({ ...s, executingTransaction: true, error: null }))
    const { ok, error: txError } = await send(state.transactions[idx])
    if (ok) {
      setState((s) => ({ ...s, executingTransaction: false, transactionsCompleted: s.transactionsCompleted + 1 }))
    } else {
      setState((s) => ({ ...s, executingTransaction: false, error: txError ?? 'Transaction failed' }))
    }
  }, [state.transactionsCompleted, state.transactions, send])

  const executeQuote = useCallback(async (operation: TradingOperation) => {
    if (state.selectedIndex === null) return
    setState((s) => ({ ...s, executingQuote: true, error: null }))
    const quote = state.quotes[state.selectedIndex]
    const { ok, error: txError, hash } = await send(quote.tx)
    if (ok) {
      setState((s) => ({ ...s, executingQuote: false, txSuccess: { operation, hash } }))
    } else {
      setState((s) => ({ ...s, executingQuote: false, error: txError ?? 'Execution failed' }))
    }
  }, [state.selectedIndex, state.quotes, send])

  const dismissSuccess = useCallback(() => {
    setState((s) => ({ ...s, txSuccess: null, quotes: [], permissions: [], transactions: [], permissionsCompleted: 0, transactionsCompleted: 0, selectedIndex: null }))
  }, [])

  const reset = useCallback(() => {
    setState(initialState)
  }, [])

  const allPermissionsDone = state.permissions.length === 0 || state.permissionsCompleted >= state.permissions.length
  const allTransactionsDone = state.transactions.length === 0 || state.transactionsCompleted >= state.transactions.length

  return {
    ...state,
    allPermissionsDone,
    allTransactionsDone,
    fetchQuotes,
    selectQuote,
    executeNextPermission,
    executeNextTransaction,
    executeQuote,
    dismissSuccess,
    reset,
  }
}
