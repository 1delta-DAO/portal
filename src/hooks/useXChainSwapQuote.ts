import { useState, useCallback, useRef } from 'react'
import { useWalletClient } from 'wagmi'
import type { Address, Hex } from 'viem'
import { apiFetchEnvelope, ApiError } from '../sdk/http'
import {
  signPermitOffer,
  type PermitActions,
  type PermitSignatureRequest,
  type PermitSkip,
} from '../sdk/permits'
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
  /**
   * True when the signed permit rides INSIDE this route's calldata (verified
   * against the assembled bytes by the API): no approve needed for it. Only
   * composed routes — the ones whose spender is the 1delta composer — can
   * carry it; router-spender bridges keep their approve.
   */
  permitApplied?: boolean
  /**
   * Tracking key for bridges that do not track by source tx hash (Mayan's
   * order id, NEAR Intents' per-quote deposit address) — passed to
   * `/v1/data/bridge/status` as `orderId`.
   */
  orderId?: string
  /** Destination gas this route delivers when `destinationGas` was asked for. */
  destinationGas?: DestinationGas
  tx: SpotSwapTx
}

/**
 * The `destinationGas` block of an x-chain quote row (worker-api
 * `destinationGas.ts`). `native-drop`: the bridge drops it inside the route's
 * own transaction. `batch`: a NEAR Intents deposit (`transaction`) rides
 * beside the route — sent with it in one `wallet_sendCalls` where the wallet
 * supports it, right after it otherwise.
 */
export interface DestinationGas {
  /** destination native, base units */
  amount: string
  decimals: number
  mode: 'native-drop' | 'batch'
  /** `output`: out of the bridged amount · `value`: in the route's msg.value · `gas-leg`: a separate deposit */
  paidFrom: 'output' | 'value' | 'gas-leg'
  /** source native, when known */
  cost?: { amount: string; decimals: number; usd?: number }
  bridge?: string
  /** batch only: the gas leg's status key */
  orderId?: string
  /** batch only: the gas leg's transaction (EVM `{to,data,value}`) */
  transaction?: SpotSwapTx & { description?: string; chainType?: string }
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
    permitApplied?: boolean
    orderId?: string
    destinationGas?: DestinationGas
    /** Same-chain spot fallback only, under `permit=auto`. */
    buildId?: string
  }>
  currencyIn?: RawCurrency
  currencyOut?: RawCurrency
}

/** `actions` half — one transaction per route, matched positionally to `data.quotes`. */
interface XChainQuoteActions extends PermitActions {
  alternatives?: SpotSwapTx[]
  permissions?: SpotSwapTx[]
}

interface XChainSwapState {
  quotes: XChainSwapQuote[]
  currencyIn: RawCurrency | null
  currencyOut: RawCurrency | null
  permissions: SpotSwapTx[]
  /** Permit offer standing in for the composed routes' approve. */
  signatures: PermitSignatureRequest[]
  /** Routes/reasons the approve stands for (router-spender bridges, etc.). */
  permitSkipped: PermitSkip[]
  /** True once the signed permit was applied — covered routes need no approve. */
  permitApplied: boolean
  signing: boolean
  /** true when the backend fell back to the spot meta-aggregator (same chain) */
  isSpotFallback: boolean
  /** true when the last fetch succeeded but no route quoted the pair */
  noRoutes: boolean
  selectedIndex: number | null
  loading: boolean
  executing: boolean
  error: string | null
  /** `batchId` when sent as one EIP-5792 batch; `gasHash` for a separately sent gas leg */
  txSuccess: { hash?: string; batchId?: string; gasHash?: string } | null
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
  /** destination native to deliver with the transfer (decimal, or `auto` on Solana) */
  destinationGas?: string
}

const EMPTY_STATE: XChainSwapState = {
  quotes: [],
  currencyIn: null,
  currencyOut: null,
  permissions: [],
  signatures: [],
  permitSkipped: [],
  permitApplied: false,
  signing: false,
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
 *
 * With `permitEnabled`, the quote asks for a permit (`permit=auto`): ONE
 * composer-scoped signature covers every composed route, and the signed POST
 * re-quotes with the permit riding inside their calldata (`permitApplied`
 * per route). Router-spender bridges keep their approve either way.
 */
export function useXChainSwapQuote(params: {
  fromChainId: string
  account?: string
  permitEnabled?: boolean
}) {
  // Transactions execute on the source chain
  const { send } = useSendLendingTransaction({
    chainId: params.fromChainId,
    account: params.account,
  })
  const { data: walletClient } = useWalletClient()

  const permitEnabledRef = useRef(params.permitEnabled ?? false)
  permitEnabledRef.current = params.permitEnabled ?? false

  /** Query params of the last quote — the signed POST re-calls the SAME request. */
  const lastQueryRef = useRef<Record<string, string> | null>(null)
  /** buildIds from the same-chain spot fallback (cross-chain issues none yet). */
  const buildsRef = useRef<string[]>([])

  const [state, setState] = useState<XChainSwapState>(EMPTY_STATE)

  const ingestEnvelope = useCallback(
    (
      data: XChainQuoteData,
      actions: XChainQuoteActions | null | undefined,
      opts: { permitApplied: boolean }
    ) => {
      const isSpotFallback = data.fallback === 'spot'
      const rawQuotes = data.quotes ?? []
      const alternatives: SpotSwapTx[] = actions?.alternatives ?? []

      const quotes: XChainSwapQuote[] = rawQuotes.map((q, i) => ({
        label: q.bridge ?? q.aggregator ?? 'Unknown',
        tradeInput: q.tradeInput ?? 0,
        tradeOutput: q.tradeOutput ?? 0,
        estimatedDuration: q.estimatedDuration,
        approvalTarget: q.approvalTarget,
        approvalRequired: q.approvalRequired,
        permitApplied: q.permitApplied,
        orderId: q.orderId,
        destinationGas: q.destinationGas,
        tx: alternatives[i] ?? { to: '', data: '', value: '0' },
      }))

      buildsRef.current = rawQuotes.map((q) => q.buildId).filter((b): b is string => !!b)

      const permissions: SpotSwapTx[] = actions?.permissions ?? []
      const signatures = actions?.signatures ?? []
      const permitSkipped = actions?.permitSkipped ?? []

      setState((s) => ({
        ...s,
        quotes,
        currencyIn: data.currencyIn ?? s.currencyIn,
        currencyOut: data.currencyOut ?? s.currencyOut,
        permissions,
        signatures,
        permitSkipped,
        permitApplied: opts.permitApplied,
        isSpotFallback,
        noRoutes: quotes.length === 0,
        selectedIndex: quotes.length > 0 ? 0 : null,
        loading: false,
        signing: false,
      }))

      return { quotes, permissions }
    },
    []
  )

  const fetchQuote = useCallback(
    async (swapParams: XChainSwapParams) => {
      setState((s) => ({
        ...s,
        loading: true,
        error: null,
        quotes: [],
        currencyIn: null,
        currencyOut: null,
        permissions: [],
        signatures: [],
        permitSkipped: [],
        permitApplied: false,
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
        if (swapParams.destinationGas) qs.set('destinationGas', swapParams.destinationGas)
        if (permitEnabledRef.current && swapParams.account) qs.set('permit', 'auto')

        const query = Object.fromEntries(qs)
        lastQueryRef.current = query

        // Envelope, not `apiFetch`: one executable transaction per bridge route
        // comes back under `actions.alternatives`, positionally matched to
        // `data.quotes`. Same shape as the spot quote.
        const envelope = await apiFetchEnvelope<XChainQuoteData, XChainQuoteActions>(
          '/v1/actions/swap/x-chain',
          { params: query }
        )

        return ingestEnvelope(envelope.data ?? {}, envelope.actions, { permitApplied: false })
      } catch (e: any) {
        setState((s) => ({ ...s, loading: false, error: e.message ?? 'Unknown error' }))
        return null
      }
    },
    [ingestEnvelope]
  )

  /**
   * Sign the composer-scoped offer and POST it back. Cross-chain this
   * re-quotes with the permit inside the composed calldata; on the same-chain
   * spot fallback the returned `buildId`s are sent too, so the exact quoted
   * builds are spliced without a re-quote. `BUILD_EXPIRED` (fallback path
   * only) is recovered by re-quoting and resubmitting the SAME signature.
   */
  const signAndApplyPermit = useCallback(async () => {
    const offer = state.signatures[0]
    const query = lastQueryRef.current
    if (!offer || !query) return
    if (!walletClient) {
      setState((s) => ({ ...s, error: 'Wallet not connected' }))
      return
    }

    setState((s) => ({ ...s, signing: true, error: null }))

    let submission
    try {
      submission = await signPermitOffer(walletClient, offer)
    } catch (e: any) {
      setState((s) => ({
        ...s,
        signing: false,
        error: e?.shortMessage ?? e?.message ?? 'Signature rejected',
      }))
      return
    }

    const submit = async () =>
      apiFetchEnvelope<XChainQuoteData, XChainQuoteActions>('/v1/actions/swap/x-chain', {
        params: query,
        body: {
          permits: [submission],
          ...(buildsRef.current.length > 0 ? { builds: buildsRef.current } : {}),
        },
      })

    try {
      let envelope
      try {
        envelope = await submit()
      } catch (e) {
        if (!(e instanceof ApiError) || e.code !== 'BUILD_EXPIRED') throw e
        const requote = await apiFetchEnvelope<XChainQuoteData, XChainQuoteActions>(
          '/v1/actions/swap/x-chain',
          { params: query }
        )
        buildsRef.current = (requote.data?.quotes ?? [])
          .map((q) => q.buildId)
          .filter((b): b is string => !!b)
        envelope = await submit()
      }
      ingestEnvelope(envelope.data ?? {}, envelope.actions, { permitApplied: true })
    } catch (e: any) {
      const stale =
        e instanceof ApiError && (e.code === 'PERMIT_STALE' || e.code === 'PERMIT_EXPIRED')
      setState((s) => ({
        ...s,
        signing: false,
        error: stale
          ? 'The signed permit is no longer valid — refresh the quote and sign again'
          : (e.message ?? 'Applying the permit failed'),
      }))
    }
  }, [state.signatures, walletClient, ingestEnvelope])

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
      if (quote.permitApplied) return []
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
    const gasTx = quote.destinationGas?.mode === 'batch' ? quote.destinationGas.transaction : undefined

    // A route with a separate gas leg: try ONE batched signature (EIP-5792
    // `wallet_sendCalls`), and fall back to two transactions — the bridge
    // first, then the gas leg — where the wallet does not batch.
    if (gasTx && !gasTx.chainType && walletClient) {
      try {
        const { id } = await walletClient.sendCalls({
          account: walletClient.account!,
          chain: walletClient.chain,
          calls: [quote.tx, gasTx].map((t) => ({
            to: t.to as Address,
            data: (t.data || '0x') as Hex,
            value: BigInt(t.value || 0),
          })),
        })
        // The bridge's status tracker keys on the source tx hash: read it off
        // the batch's receipt (one transaction on an atomic 7702 batch).
        let hash: string | undefined
        try {
          const status = await walletClient.waitForCallsStatus({ id, timeout: 120_000 })
          hash = status.receipts?.[0]?.transactionHash
        } catch {
          // the batch was submitted; only its receipt could not be read here
        }
        setState((s) => ({ ...s, executing: false, txSuccess: { hash, batchId: id } }))
        return
      } catch (e: any) {
        // 4200 / 'method not found' = no EIP-5792 support → sequential below;
        // a user rejection ends here
        if (e?.code === 4001 || /reject|denied/i.test(e?.shortMessage ?? e?.message ?? '')) {
          setState((s) => ({ ...s, executing: false, error: 'Rejected in wallet' }))
          return
        }
      }
    }

    const { ok, error: txError, hash } = await send(quote.tx as LendingTx)
    if (!ok) {
      setState((s) => ({ ...s, executing: false, error: txError ?? 'Swap execution failed' }))
      return
    }
    if (gasTx && !gasTx.chainType) {
      const gas = await send(gasTx as LendingTx)
      if (!gas.ok) {
        setState((s) => ({
          ...s,
          executing: false,
          txSuccess: { hash },
          error: `Bridge sent, but the destination gas deposit failed: ${gas.error ?? 'unknown error'}`,
        }))
        return
      }
      setState((s) => ({ ...s, executing: false, txSuccess: { hash, gasHash: gas.hash } }))
      return
    }
    setState((s) => ({ ...s, executing: false, txSuccess: { hash } }))
  }, [state.selectedIndex, state.quotes, send, walletClient])

  const dismissSuccess = useCallback(() => {
    setState((s) => ({
      ...s,
      txSuccess: null,
      quotes: [],
      permissions: [],
      signatures: [],
      permitSkipped: [],
      permitApplied: false,
      selectedIndex: null,
    }))
  }, [])

  const reset = useCallback(() => {
    lastQueryRef.current = null
    buildsRef.current = []
    setState(EMPTY_STATE)
  }, [])

  return {
    ...state,
    fetchQuote,
    selectQuote,
    permissionsForQuote,
    signAndApplyPermit,
    executePermission,
    executeSwap,
    dismissSuccess,
    reset,
  }
}
