/**
 * The two-call permit contract on the swap endpoints
 * (worker-api PERMIT_SWAP_BRIDGE_PLAN.md).
 *
 * With `permit=auto`, `/v1/actions/swap/{spot,x-chain}` additionally answer
 * `actions.signatures[]` — an EIP-712 payload the user can sign INSTEAD of
 * sending the ERC-20 approve — plus, on spot, a `buildId` per quote row.
 * The signed second call is a POST of the SAME endpoint with
 * `{ permits: [{permitId, signature}], builds }`:
 *
 * - spot with `builds`: the cached builds are re-headed with the permit and
 *   answered WITHOUT re-quoting — the price the user saw is the price they
 *   execute; the approve permission disappears.
 * - x-chain (no builds): the endpoint re-quotes with the permit riding inside
 *   the composed calldata; routes whose bytes carry it report
 *   `permitApplied: true` and need no approve. Router-spender bridges keep
 *   theirs and are named in `permitSkipped`.
 *
 * Builds expire after ~3 minutes (`BUILD_EXPIRED`) — but the SIGNATURE binds
 * token/spender/value/nonce, not the route, so recovery is re-quote and
 * resubmit the SAME signature. `signPermitOffer` is the one place the typed
 * data is prepared for the wallet (the API includes `EIP712Domain` in `types`
 * for raw signers; viem derives it from `domain` and rejects the duplicate).
 */

import type { WalletClient } from 'viem'

/** One entry of `actions.signatures[]`. */
export interface PermitSignatureRequest {
  /** Opaque handle — round-trips verbatim in the POST body. */
  permitId: string
  /** `erc2612` | `dai` | `permit2` | … */
  kind: string
  /** Ready for `eth_signTypedData_v4`; numeric fields are decimal strings. */
  typedData: {
    domain: Record<string, unknown>
    types: Record<string, unknown>
    primaryType: string
    message: Record<string, unknown>
  }
  /** Which permission kind it replaces (`ERC20` | `Lender`). */
  replaces: string
  /** Who the signature authorises — match against a quote's `approvalTarget`. */
  spender?: string
  description: string
  /** True when the grant is NOT amount-scoped — surface it to the user. */
  unscoped: boolean
  /** Unix seconds after which the signature is worthless (~30 min). */
  deadline: string
}

/** Why a permit was NOT offered for a permission (the approve stands). */
export interface PermitSkip {
  replaces: string
  reason: string
}

/** The signed half, POSTed back to the same endpoint. */
export interface PermitSubmission {
  permitId: string
  signature: string
}

/** The `actions` additions `permit=auto` produces. */
export interface PermitActions {
  signatures?: PermitSignatureRequest[]
  permitSkipped?: PermitSkip[]
}

/**
 * Sign one offer. Strips `EIP712Domain` from `types` (viem derives the domain
 * type from `domain` itself and treats an explicit copy as an unknown struct).
 */
export async function signPermitOffer(
  walletClient: WalletClient,
  offer: PermitSignatureRequest
): Promise<PermitSubmission> {
  const { EIP712Domain: _dropped, ...types } = offer.typedData.types as Record<string, unknown>
  // The typed data is server-built and dynamic, so viem's compile-time
  // typed-data inference has nothing to infer from — cast the request whole.
  const signature = await walletClient.signTypedData({
    account: walletClient.account!,
    domain: offer.typedData.domain,
    types,
    primaryType: offer.typedData.primaryType,
    message: offer.typedData.message,
  } as Parameters<WalletClient['signTypedData']>[0])
  return { permitId: offer.permitId, signature }
}

/** Seconds until the offer's deadline (negative = already expired). */
export function permitSecondsLeft(offer: PermitSignatureRequest, nowMs = Date.now()): number {
  return Number(offer.deadline) - Math.floor(nowMs / 1000)
}
