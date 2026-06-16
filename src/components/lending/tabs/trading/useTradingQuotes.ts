import { useState, useCallback } from 'react'
import { useSendLendingTransaction } from '../../../../hooks/useSendLendingTransaction'
import type { TradingOperation, TradingQuote, Tx } from './types'
import type { RateImpactEntry } from '../../../../sdk/lending-helper/fetchLendingAction'
import { BACKEND_BASE_URL } from '../../../../config/backend'
import type { LoopRangeSimulationBody } from '../../../../sdk/lending-helper/fetchLoopRange'
import type { UserSubAccount } from '../../../../hooks/lending/useUserData'

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

interface QuoteDeltaItem {
  amount: string | number
  amountUSD: number
  position: string
  asset?: {
    decimals?: number
    symbol?: string
    logoURI?: string
  }
}

interface QuoteDeltas {
  aggregator: string
  tradeInput: number
  tradeOutput: number
  deltas?: QuoteDeltaItem[]
}

/** Convert a raw delta amount string to its native-unit float value. */
function deltaNativeAbs(d: QuoteDeltaItem): number {
  const decimals = d.asset?.decimals ?? 0
  const raw = typeof d.amount === 'string' ? parseFloat(d.amount) : d.amount
  if (!Number.isFinite(raw)) return 0
  return Math.abs(raw) / 10 ** decimals
}

/** Pick the delta whose native-unit magnitude is closest to `target`. */
function matchDeltaByAmount(
  deltas: QuoteDeltaItem[],
  target: number,
  exclude?: QuoteDeltaItem
): QuoteDeltaItem | undefined {
  if (!deltas.length || !Number.isFinite(target) || target === 0) return undefined
  let best: QuoteDeltaItem | undefined
  let bestDiff = Infinity
  for (const d of deltas) {
    if (d === exclude) continue
    const diff = Math.abs(deltaNativeAbs(d) - target)
    if (diff < bestDiff) {
      bestDiff = diff
      best = d
    }
  }
  return best
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
    let tradeAmountInUSD: number | undefined
    let tradeAmountOutUSD: number | undefined
    let inSymbol: string | undefined
    let inLogoURI: string | undefined
    let outSymbol: string | undefined
    let outLogoURI: string | undefined
    let positionCollateralUSD: number | undefined
    let positionDebtUSD: number | undefined

    const deltas = q.deltas as QuoteDeltas | undefined
    if (deltas) {
      aggregator = deltas.aggregator ?? 'Unknown'
      tradeAmountIn = deltas.tradeInput ?? 0
      tradeAmountOut = deltas.tradeOutput ?? 0
      const items = deltas.deltas ?? []

      for (const d of items) {
        if (d.position === 'collateral') positionCollateralUSD = d.amountUSD
        else if (d.position === 'debt') positionDebtUSD = d.amountUSD
      }

      // Match each delta to the input / output side of the swap by native
      // magnitude. Each quote's `tradeInput` / `tradeOutput` are token-unit
      // floats; we compare against |delta.amount| / 10^decimals to find the
      // owner-asset on each side, then read its USD + logo from there.
      const inDelta = matchDeltaByAmount(items, tradeAmountIn)
      const outDelta = matchDeltaByAmount(items, tradeAmountOut, inDelta)
      if (inDelta) {
        tradeAmountInUSD = Math.abs(inDelta.amountUSD)
        inSymbol = inDelta.asset?.symbol
        inLogoURI = inDelta.asset?.logoURI
      }
      if (outDelta) {
        tradeAmountOutUSD = Math.abs(outDelta.amountUSD)
        outSymbol = outDelta.asset?.symbol
        outLogoURI = outDelta.asset?.logoURI
      }
    }

    let priceImpactUSD: number | undefined
    let priceImpactPct: number | undefined
    if (tradeAmountInUSD != null && tradeAmountOutUSD != null) {
      priceImpactUSD = tradeAmountOutUSD - tradeAmountInUSD
      if (tradeAmountInUSD > 0) priceImpactPct = priceImpactUSD / tradeAmountInUSD
    }

    // Transaction data comes from actions.alternatives (matched by index),
    // or falls back to tx on the quote object itself
    const tx: Tx = alternatives[i] ?? q.tx ?? { to: '', data: '', value: '0' }

    return {
      aggregator,
      tradeAmountIn,
      tradeAmountOut,
      tradeAmountInUSD,
      tradeAmountOutUSD,
      priceImpactUSD,
      priceImpactPct,
      inSymbol,
      inLogoURI,
      outSymbol,
      outLogoURI,
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
  executingPermissionIdx: number | null
  executingTransactionIdx: number | null
  executingQuote: boolean
  completedPermissions: number[]
  completedTransactions: number[]
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
    executingPermissionIdx: null,
    executingTransactionIdx: null,
    executingQuote: false,
    completedPermissions: [],
    completedTransactions: [],
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
        completedPermissions: [],
        completedTransactions: [],
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

  const executeNextPermission = useCallback(async (idx: number) => {
    if (idx < 0 || idx >= state.permissions.length) return
    setState((s) => ({ ...s, executingPermissionIdx: idx, error: null }))
    const { ok, error: txError } = await send(state.permissions[idx])
    setState((s) => ({
      ...s,
      executingPermissionIdx: null,
      completedPermissions: ok && !s.completedPermissions.includes(idx) ? [...s.completedPermissions, idx] : s.completedPermissions,
      error: ok ? null : (txError ?? 'Permission failed'),
    }))
  }, [state.permissions, send])

  const executeNextTransaction = useCallback(async (idx: number) => {
    if (idx < 0 || idx >= state.transactions.length) return
    setState((s) => ({ ...s, executingTransactionIdx: idx, error: null }))
    const { ok, error: txError } = await send(state.transactions[idx])
    setState((s) => ({
      ...s,
      executingTransactionIdx: null,
      completedTransactions: ok && !s.completedTransactions.includes(idx) ? [...s.completedTransactions, idx] : s.completedTransactions,
      error: ok ? null : (txError ?? 'Transaction failed'),
    }))
  }, [state.transactions, send])

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
    setState((s) => ({ ...s, txSuccess: null, quotes: [], permissions: [], transactions: [], completedPermissions: [], completedTransactions: [], selectedIndex: null }))
  }, [])

  const reset = useCallback(() => {
    setState(initialState)
  }, [])

  const allPermissionsDone = state.completedPermissions.length >= state.permissions.length
  const allTransactionsDone = state.completedTransactions.length >= state.transactions.length

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
