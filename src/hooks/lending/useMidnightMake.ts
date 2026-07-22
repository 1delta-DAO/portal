import { useState, useCallback } from 'react'
import { useWalletClient } from 'wagmi'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Address, Hex } from 'viem'
import { BACKEND_BASE_URL } from '../../config/backend'
import { getIndependentPublicClient } from '../../lib/lib-utils'
import { useSendLendingTransaction } from '../useSendLendingTransaction'

/**
 * Morpho Midnight MAKE — post your OWN limit offer (the "Make" side of the order
 * book) and manage/cancel open offers. Unlike a take, a make is signed then
 * PUBLISHED on-chain to the mempool contract; the worker does the offer/ratifier
 * math ({@link file://.../midnightMake.ts}), the wallet just signs + sends:
 *
 *   GET  /v1/actions/midnight/make      → typed-data + inputs (+ authorize tx)
 *   (wallet) signTypedData(typedData)
 *   POST /v1/actions/midnight/finalize  → the mempool publish tx
 *
 * A one-time `setIsAuthorized(ratifier)` is sent first when the maker hasn't
 * authorized the ratifier yet (checked on-chain).
 */

const isAuthorizedAbi = [
  {
    type: 'function',
    name: 'isAuthorized',
    stateMutability: 'view',
    inputs: [
      { name: 'authorizer', type: 'address' },
      { name: 'authorized', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

export interface MakeOfferParams {
  chainId: string
  /** `MORPHO_MIDNIGHT_<id>` lender key. */
  lender: string
  side: 'lend' | 'borrow'
  /** Rate the maker offers (APR %). */
  aprPct: number
  /** Offer size, loan-token units (already scaled to decimals). */
  size: bigint
  /** Offer expiry, unix seconds. */
  expirySec: number
  account: Address
}

interface MakeBuild {
  typedData: any
  inputs: any
  authorization: { to: Address; data: Hex; value: string; ratifier: Address }
  aprPctSnapped: number
  maturity: number
}

export function useMidnightMake(chainId: string, account?: string) {
  const { data: walletClient } = useWalletClient()
  const { send } = useSendLendingTransaction({ chainId, account })
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)
  const [step, setStep] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const makeOffer = useCallback(
    async (p: MakeOfferParams): Promise<{ ok: boolean; hash?: string }> => {
      if (!walletClient) {
        setError('Wallet not connected')
        return { ok: false }
      }
      setPending(true)
      setError(null)
      try {
        // 1. Build the offer typed-data on the worker.
        setStep('Building offer…')
        const sp = new URLSearchParams({
          chainId: p.chainId,
          lender: p.lender,
          side: p.side,
          aprPct: String(p.aprPct),
          size: p.size.toString(),
          expiry: String(Math.floor(p.expirySec)),
          account: p.account,
        })
        const buildRes = await fetch(`${BACKEND_BASE_URL}/v1/actions/midnight/make?${sp}`)
        const buildJson: any = await buildRes.json()
        if (!buildRes.ok || !buildJson?.data?.typedData) {
          throw new Error(buildJson?.error?.message ?? `Build failed (${buildRes.status})`)
        }
        const build: MakeBuild = buildJson.data

        // 2. One-time ratifier authorization (only if not yet authorized).
        setStep('Checking authorization…')
        let authorized = false
        try {
          const pc = getIndependentPublicClient(p.chainId)
          if (pc) {
            authorized = (await pc.readContract({
              address: build.authorization.to,
              abi: isAuthorizedAbi,
              functionName: 'isAuthorized',
              args: [p.account, build.authorization.ratifier],
            })) as boolean
          }
        } catch {
          authorized = false // can't read → offer the authorize tx to be safe
        }
        if (!authorized) {
          setStep('Authorizing ratifier (one-time)…')
          const a = await send({
            to: build.authorization.to,
            data: build.authorization.data,
            value: build.authorization.value,
          })
          if (!a.ok) throw new Error(a.error ?? 'Authorization failed')
        }

        // 3. Sign the offer (EIP-712) with the wallet.
        setStep('Sign the offer…')
        const signature = (await walletClient.signTypedData(build.typedData)) as Hex

        // 4. Finalize → the mempool publish tx.
        setStep('Publishing offer…')
        const finRes = await fetch(`${BACKEND_BASE_URL}/v1/actions/midnight/finalize`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ inputs: build.inputs, signature }),
        })
        const finJson: any = await finRes.json()
        const tx = finJson?.actions?.transactions?.[0]
        if (!finRes.ok || !tx) {
          throw new Error(finJson?.error?.message ?? `Finalize failed (${finRes.status})`)
        }
        const r = await send(tx)
        if (!r.ok) throw new Error(r.error ?? 'Publish failed')

        // Refresh the open-offers list.
        queryClient.invalidateQueries({
          queryKey: ['midnightOpenOffers', p.chainId, p.lender, p.account.toLowerCase()],
        })
        return { ok: true, hash: r.hash }
      } catch (e: any) {
        setError(e?.shortMessage ?? e?.message ?? 'Failed to post offer')
        return { ok: false }
      } finally {
        setPending(false)
        setStep(null)
      }
    },
    [walletClient, send, queryClient]
  )

  return { makeOffer, pending, step, error }
}

// ── Open offers (read) + cancel ─────────────────────────────────────────────

export interface MidnightOpenOffer {
  marketId: string
  lender: string
  side: 'lend' | 'borrow'
  tick: string
  aprPct: number
  size: string
  expiry: number
  root: Hex
}

export function useMidnightOpenOffers(params: {
  chainId?: string
  lender?: string
  account?: string
  enabled?: boolean
}) {
  const { chainId, lender, account, enabled = true } = params
  const isMidnight = !!lender && lender.toUpperCase().startsWith('MORPHO_MIDNIGHT')

  const query = useQuery<{ offers: MidnightOpenOffer[] }>({
    queryKey: ['midnightOpenOffers', chainId, lender, account?.toLowerCase()],
    enabled: enabled && isMidnight && !!chainId && !!account,
    queryFn: async () => {
      const sp = new URLSearchParams({
        chainId: chainId!,
        lender: lender!,
        account: account!,
      })
      const r = await fetch(`${BACKEND_BASE_URL}/v1/data/lending/midnight/open-offers?${sp}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json: any = await r.json()
      return { offers: (json?.data?.offers ?? []) as MidnightOpenOffer[] }
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  })

  return {
    offers: query.data?.offers ?? [],
    isLoading: query.isLoading,
    error: query.error,
  }
}

export function useMidnightCancelOffer(chainId: string, account?: string) {
  const { send } = useSendLendingTransaction({ chainId, account })
  const queryClient = useQueryClient()
  const [cancelling, setCancelling] = useState<string | null>(null)

  const cancel = useCallback(
    async (root: Hex, lender?: string): Promise<boolean> => {
      if (!account) return false
      setCancelling(root)
      try {
        const sp = new URLSearchParams({ chainId, account, root })
        const res = await fetch(`${BACKEND_BASE_URL}/v1/actions/midnight/cancel?${sp}`)
        const json: any = await res.json()
        const tx = json?.actions?.transactions?.[0]
        if (!res.ok || !tx) return false
        const r = await send(tx)
        if (r.ok) {
          queryClient.invalidateQueries({
            queryKey: ['midnightOpenOffers', chainId, lender, account.toLowerCase()],
          })
        }
        return r.ok
      } catch {
        return false
      } finally {
        setCancelling(null)
      }
    },
    [chainId, account, send, queryClient]
  )

  return { cancel, cancelling }
}

/**
 * Early-exit SELL — sell held credit units into the book before maturity (take
 * bids). `amountUnits` = face units to sell (loan-token face value; settle 1:1).
 * You receive loan token now at market price (a discount to face).
 */
export function useMidnightSell(chainId: string, account?: string) {
  const { send } = useSendLendingTransaction({ chainId, account })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sell = useCallback(
    async (lender: string, amountUnits: bigint): Promise<{ ok: boolean; hash?: string }> => {
      if (!account) return { ok: false }
      setPending(true)
      setError(null)
      try {
        const sp = new URLSearchParams({
          chainId,
          lender,
          amount: amountUnits.toString(),
          account,
        })
        const res = await fetch(`${BACKEND_BASE_URL}/v1/actions/midnight/sell?${sp}`)
        const json: any = await res.json()
        const tx = json?.actions?.transactions?.[0]
        if (!res.ok || !tx) {
          throw new Error(json?.error?.message ?? `Sell failed (${res.status})`)
        }
        const r = await send(tx)
        if (!r.ok) throw new Error(r.error ?? 'Sell failed')
        return { ok: true, hash: r.hash }
      } catch (e: any) {
        setError(e?.shortMessage ?? e?.message ?? 'Sell failed')
        return { ok: false }
      } finally {
        setPending(false)
      }
    },
    [chainId, account, send]
  )

  return { sell, pending, error }
}
