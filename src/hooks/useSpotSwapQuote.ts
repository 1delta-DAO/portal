import { useState, useCallback, useRef } from 'react'
import { useWalletClient } from 'wagmi'
import { apiFetchEnvelope, ApiError } from '../sdk/http'
import {
  signPermitOffer,
  type PermitActions,
  type PermitSignatureRequest,
  type PermitSkip,
  type PermitSubmission,
} from '../sdk/permits'
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
  quotes?: Array<{
    aggregator: string
    tradeInput: number
    tradeOutput: number
    /** Present under `permit=auto` — the cached build the signed POST splices. */
    buildId?: string
  }>
  currencyIn?: RawCurrency
  currencyOut?: RawCurrency
}

/**
 * `actions` half. Note `alternatives` rather than `transactions`: the quote
 * endpoint returns one executable transaction *per aggregator*, positionally
 * matched to `data.quotes`, so the user can pick a route. Under `permit=auto`
 * it additionally carries `signatures` / `permitSkipped`.
 */
interface SpotQuoteActions extends PermitActions {
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
  /** Permit offer(s) standing in for the approve — sign one instead. */
  signatures: PermitSignatureRequest[]
  /** Why no permit was offered, when `permit=auto` asked for one. */
  permitSkipped: PermitSkip[]
  /** True once a signed permit is spliced into the quotes — no approve needed. */
  permitApplied: boolean
  signing: boolean
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

const EMPTY_QUOTE_STATE = {
  quotes: [] as SpotSwapQuote[],
  currencyIn: null,
  currencyOut: null,
  permissions: [] as SpotSwapTx[],
  signatures: [] as PermitSignatureRequest[],
  permitSkipped: [] as PermitSkip[],
  permitApplied: false,
  selectedIndex: null,
}

export function useSpotSwapQuote(params: {
  chainId: string
  account?: string
  /**
   * The permit switch: quotes fetch with `permit=auto`, and a token that
   * supports one gets a signature offer next to the approve. Signing runs the
   * two-call flow — POST `{permits, builds}` splices the SAME quoted builds
   * with the permit, no re-quote.
   */
  permitEnabled?: boolean
}) {
  const { send } = useSendLendingTransaction({ chainId: params.chainId, account: params.account })
  const { data: walletClient } = useWalletClient()
  const {
    supported: batchSupported,
    needsUpgrade: batchNeedsUpgrade,
    sendBatch,
  } = useAtomicBatch({ chainId: params.chainId, account: params.account })

  // Read at call time, not closure time, so flipping the switch doesn't have
  // to invalidate `fetchQuote`'s identity (the panel debounces off it).
  const permitEnabledRef = useRef(params.permitEnabled ?? false)
  permitEnabledRef.current = params.permitEnabled ?? false

  /** Query params of the last quote — the signed POST re-calls the SAME request. */
  const lastQueryRef = useRef<Record<string, string> | null>(null)
  /** buildIds of the last quote, positionally matching `quotes`. */
  const buildsRef = useRef<string[]>([])

  const [state, setState] = useState<SpotSwapState>({
    ...EMPTY_QUOTE_STATE,
    signing: false,
    loading: false,
    executing: false,
    error: null,
    txSuccess: null,
  })

  /** Map one envelope (quote or splice response) into the hook's state shape. */
  const ingestEnvelope = useCallback(
    (
      data: SpotQuoteData,
      actions: SpotQuoteActions | null | undefined,
      opts: { permitApplied: boolean }
    ) => {
      const rawQuotes = data.quotes ?? []
      const alternatives: SpotSwapTx[] = actions?.alternatives ?? []

      const quotes: SpotSwapQuote[] = rawQuotes.map((q, i) => ({
        aggregator: q.aggregator ?? 'Unknown',
        tradeInput: q.tradeInput ?? 0,
        tradeOutput: q.tradeOutput ?? 0,
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
        selectedIndex: quotes.length > 0 ? 0 : null,
        loading: false,
        signing: false,
      }))

      return { quotes, permissions }
    },
    []
  )

  const fetchQuote = useCallback(
    async (swapParams: SpotSwapParams) => {
      setState((s) => ({
        ...s,
        loading: true,
        error: null,
        ...EMPTY_QUOTE_STATE,
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
        if (permitEnabledRef.current && swapParams.account) qs.set('permit', 'auto')

        const query = Object.fromEntries(qs)
        lastQueryRef.current = query

        // Envelope, not `apiFetch`: the executable transactions come back under
        // `actions`, alongside the quote numbers in `data`.
        const envelope = await apiFetchEnvelope<SpotQuoteData, SpotQuoteActions>(
          '/v1/actions/swap/spot',
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
   * The signed half of the two-call permit flow: sign the offered EIP-712
   * payload, POST it back with the quoted `buildId`s, and take the spliced
   * response — same prices, permit inside the calldata, approve gone.
   *
   * `BUILD_EXPIRED` (builds live ~3 min) is recovered transparently: the
   * SIGNATURE binds token/spender/value/nonce rather than the route, so a
   * re-quote plus a resubmit of the SAME signature completes the flow without
   * asking the user to sign twice.
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

    let submission: PermitSubmission
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

    const splice = async () =>
      apiFetchEnvelope<SpotQuoteData, SpotQuoteActions>('/v1/actions/swap/spot', {
        params: query,
        body: {
          permits: [submission],
          ...(buildsRef.current.length > 0 ? { builds: buildsRef.current } : {}),
        },
      })

    try {
      let envelope
      try {
        envelope = await splice()
      } catch (e) {
        if (!(e instanceof ApiError) || e.code !== 'BUILD_EXPIRED') throw e
        // Builds went stale while the user was signing — refresh them with the
        // same request (which re-issues buildIds) and resubmit the signature.
        const requote = await apiFetchEnvelope<SpotQuoteData, SpotQuoteActions>(
          '/v1/actions/swap/spot',
          { params: query }
        )
        buildsRef.current = (requote.data?.quotes ?? [])
          .map((q) => q.buildId)
          .filter((b): b is string => !!b)
        envelope = await splice()
      }
      ingestEnvelope(envelope.data ?? {}, envelope.actions, { permitApplied: true })
    } catch (e: any) {
      const stale = e instanceof ApiError && (e.code === 'PERMIT_STALE' || e.code === 'PERMIT_EXPIRED')
      setState((s) => ({
        ...s,
        signing: false,
        // A stale/expired permit needs a fresh signature — surface that rather
        // than the raw code.
        error: stale
          ? 'The signed permit is no longer valid — refresh the quote and sign again'
          : (e.message ?? 'Applying the permit failed'),
      }))
    }
  }, [state.signatures, walletClient, ingestEnvelope])

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
    setState((s) => ({ ...s, txSuccess: null, ...EMPTY_QUOTE_STATE }))
  }, [])

  const reset = useCallback(() => {
    lastQueryRef.current = null
    buildsRef.current = []
    setState({
      ...EMPTY_QUOTE_STATE,
      signing: false,
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
    signAndApplyPermit,
    executePermission,
    executeSwap,
    executeAll,
    dismissSuccess,
    reset,
  }
}
