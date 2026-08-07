import { useCallback, useState } from 'react'
import type { Address, Hex } from 'viem'
import { useAccount, useCapabilities, useWalletClient } from 'wagmi'
import { useSyncChain } from './useSyncChain'
import { useLendingQueryRefresh } from './useLendingQueryRefresh'
import { useBatchMode } from '../contexts/BatchMode'
import type { LendingTx } from './useSendLendingTransaction'

export interface BatchResult {
  ok: boolean
  error?: string
  /** Hash of the transaction the bundle landed in (last receipt). */
  hash?: string
}

/** EIP-5792 atomic capability, as reported per chain. */
export type AtomicStatus = 'supported' | 'ready' | 'unsupported'

/**
 * Read the atomic capability for one chain out of a `wallet_getCapabilities`
 * response, tolerating both spellings in the wild:
 *
 *  - final EIP-5792: `atomic: { status: 'supported' | 'ready' | 'unsupported' }`
 *  - earlier drafts: `atomicBatch: { supported: boolean }` — still what several
 *    shipped wallets return, and what viem does NOT map, so without this branch
 *    a wallet that batches perfectly well reads as unsupported.
 *
 * `undefined` means the chain wasn't in the response at all.
 */
export function atomicStatusOf(entry: any): AtomicStatus | undefined {
  if (!entry) return undefined
  const status = entry.atomic?.status
  if (status === 'supported' || status === 'ready' || status === 'unsupported') return status
  const legacy = entry.atomicBatch?.supported
  if (legacy === true) return 'supported'
  if (legacy === false) return 'unsupported'
  return undefined
}

/** Same, indexed out of the full per-chain record. */
export function atomicStatusFor(
  capabilities: Record<number, any> | undefined,
  chainId: number
): AtomicStatus | undefined {
  if (!Number.isFinite(chainId)) return undefined
  return atomicStatusOf(capabilities?.[chainId])
}

/** Every chain in the response that can batch, for diagnostics in settings. */
export function batchableChains(
  capabilities: Record<number, any> | undefined
): { chainId: number; status: AtomicStatus }[] {
  if (!capabilities) return []
  return Object.keys(capabilities)
    .map((k) => Number(k))
    .map((chainId) => ({ chainId, status: atomicStatusFor(capabilities, chainId) }))
    .filter(
      (e): e is { chainId: number; status: AtomicStatus } =>
        e.status === 'supported' || e.status === 'ready'
    )
    .sort((a, b) => a.chainId - b.chainId)
}

/**
 * Atomic multi-call execution via EIP-5792 `wallet_sendCalls`.
 *
 * The dapp never crafts EIP-7702 delegations itself: wallets (MetaMask smart
 * accounts, Coinbase, OKX, Ambire, …) expose atomic batching through 5792 and
 * fulfil it for EOAs with their own 7702 upgrade — with their own upgrade UX on
 * first use. Contract wallets (Safe) satisfy the same interface natively.
 *
 * Support is probed per chain at runtime (`capabilities[chainId].atomic`), so
 * there is nothing to hardcode: wherever the wallet says no — or the user has
 * flipped the global switch off — `supported` is false and the caller must fall
 * back to its sequential button stack.
 *
 * Calls execute **in order inside one transaction**, so permission grants land
 * before the composer call that consumes them, and an atomic revert leaves no
 * dangling approvals behind.
 */
export function useAtomicBatch(params: { chainId: string; account?: string }) {
  const { chainId, account } = params
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { batchEnabled } = useBatchMode()
  const { syncChain } = useSyncChain()
  const { refreshAfterTx } = useLendingQueryRefresh({ chainId, account })

  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => setError(null), [])

  // Wallets that don't implement `wallet_getCapabilities` throw here; the query
  // simply errors and `data` stays undefined → unsupported → sequential path.
  // The probe is NOT gated on `batchEnabled`: the settings panel reports what
  // the wallet can do even while the switch is off, so turning it on isn't a
  // shot in the dark.
  const {
    data: capabilities,
    isLoading: probing,
    error: probeErrorRaw,
    refetch: refetchCapabilities,
  } = useCapabilities({
    account: address,
    query: {
      enabled: !!address,
      retry: false,
      staleTime: 60_000,
    },
  })

  const numericChainId = Number(chainId)
  const validChainId = Number.isFinite(numericChainId) && numericChainId > 0
  const unfilteredStatus = atomicStatusFor(capabilities, numericChainId)

  /** The unfiltered probe produced a real per-chain list (however long). */
  const answeredBroadly = !probeErrorRaw && !!capabilities && Object.keys(capabilities).length > 0

  // Fallback probe, scoped to the one chain we're about to act on.
  //
  // `wallet_getCapabilities(address)` is supposed to answer for every chain the
  // wallet knows, but some wallets answer only for the chain they're currently
  // on — or return `{}` outright — and only give a real answer when asked about
  // a specific chain. Without this, batching silently disappears on every chain
  // except whichever one the wallet happens to be sitting on.
  //
  // It fires ONLY when the broad probe told us nothing at all. If the wallet did
  // return a chain list that simply omits ours, that IS the answer — asking
  // again per-chain just makes viem return `undefined`, which react-query
  // rejects as "data is undefined", producing a bogus "wallet doesn't answer
  // the probe" in the UI for what is really "this chain isn't supported".
  const needsScopedProbe =
    !!address && validChainId && !probing && unfilteredStatus === undefined && !answeredBroadly

  const {
    data: scopedCaps,
    isLoading: scopedProbing,
    error: scopedErrorRaw,
  } = useCapabilities({
    account: address,
    chainId: numericChainId as never,
    query: {
      enabled: needsScopedProbe,
      retry: false,
      staleTime: 60_000,
    },
  })

  const errorText = (e: unknown) =>
    (e as any)?.shortMessage ?? (e as Error | undefined)?.message ?? null

  // A scoped probe for a chain the wallet knows nothing about resolves to
  // `undefined`, which react-query surfaces as an error. That's an answer
  // ("no capability here"), not a probe failure — don't report it as one.
  const scopedErrorText = errorText(scopedErrorRaw)
  const scopedFoundNothing = !!scopedErrorText && /data is undefined/i.test(scopedErrorText)

  const probeError = probeErrorRaw
    ? (errorText(probeErrorRaw) ?? 'Wallet did not answer the capability probe')
    : scopedErrorRaw && !scopedFoundNothing
      ? (scopedErrorText ?? 'Wallet did not answer the capability probe')
      : null

  /** The wallet answered, but has nothing at all to say about this chain. */
  const chainNotListed =
    !probeError && unfilteredStatus === undefined && (answeredBroadly || scopedFoundNothing)

  // A chain-scoped response is the capability object itself, not a record.
  const atomicStatus = unfilteredStatus ?? atomicStatusOf(scopedCaps)

  /**
   * `'ready'` means the wallet *can* batch but will prompt the user to upgrade
   * their EOA (7702 delegation) on the first batch — worth a one-line hint in
   * the UI. `'supported'` means it already batches with no extra prompt.
   */
  const needsUpgrade = atomicStatus === 'ready'
  const supported =
    batchEnabled && !!walletClient && (atomicStatus === 'supported' || atomicStatus === 'ready')

  /**
   * Send `calls` as one all-or-nothing bundle. Never falls back mid-flow: if
   * this rejects (user declined the upgrade, wallet errored), nothing executed
   * and the caller can safely offer the sequential path with 0 steps completed.
   */
  const sendBatch = useCallback(
    async (calls: LendingTx[]): Promise<BatchResult> => {
      if (!walletClient) {
        const msg = 'Wallet not connected'
        setError(msg)
        return { ok: false, error: msg }
      }
      if (calls.length === 0) {
        const msg = 'Nothing to execute'
        setError(msg)
        return { ok: false, error: msg }
      }

      setSending(true)
      setError(null)

      try {
        const synced = await syncChain(numericChainId)
        if (!synced) {
          const msg = `Failed to switch to chain ${chainId}`
          setError(msg)
          return { ok: false, error: msg }
        }

        const { id } = await walletClient.sendCalls({
          calls: calls.map((c) => ({
            to: c.to as Address,
            data: c.data as Hex,
            value: BigInt(c.value || 0),
          })),
          // All-or-nothing. Without this a wallet is free to split the bundle
          // into sequential transactions, which would defeat the guarantee that
          // a failure leaves no partial grants behind.
          forceAtomic: true,
        })

        const result = await walletClient.waitForCallsStatus({
          id,
          pollingInterval: 2_000,
          timeout: 300_000,
        })

        if (result.status !== 'success') {
          const msg =
            result.status === 'pending'
              ? 'Batch is still pending — check your wallet for the status'
              : 'Batch reverted — no changes were made'
          setError(msg)
          return { ok: false, error: msg }
        }

        refreshAfterTx()
        const receipts = result.receipts ?? []
        return { ok: true, hash: receipts[receipts.length - 1]?.transactionHash }
      } catch (e: any) {
        const msg = e.shortMessage ?? e.message ?? 'Batch transaction failed'
        console.error('Batch transaction failed:', e)
        setError(msg)
        return { ok: false, error: msg }
      } finally {
        setSending(false)
      }
    },
    [walletClient, chainId, numericChainId, syncChain, refreshAfterTx]
  )

  /**
   * Explicitly perform the wallet's account upgrade, without waiting for a real
   * action to trigger it. Sends the cheapest possible bundle — one no-op
   * self-call with no calldata — which makes the wallet do its EIP-7702
   * delegation (and show whatever upgrade UX it has) up front.
   *
   * This still costs one on-chain transaction, so it is offered as a button the
   * user presses, never fired automatically.
   */
  const upgradeAccount = useCallback(async (): Promise<BatchResult> => {
    if (!address) {
      const msg = 'Wallet not connected'
      setError(msg)
      return { ok: false, error: msg }
    }
    const result = await sendBatch([{ to: address, data: '0x', value: '0' }])
    if (result.ok) {
      // Re-probe: a 'ready' account reads back as 'supported' once delegated.
      await refetchCapabilities()
    }
    return result
  }, [address, sendBatch, refetchCapabilities])

  return {
    supported,
    needsUpgrade,
    atomicStatus,
    chainNotListed,
    capabilities,
    probing: probing || scopedProbing,
    probeError,
    sendBatch,
    upgradeAccount,
    sending,
    error,
    clearError,
  }
}
