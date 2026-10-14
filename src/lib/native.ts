import { zeroAddress } from 'viem'

/**
 * Native SOL — the System Program id. It is the token list's native row on
 * Solana and the spelling the bridges use (LI.FI, Relay, DZap); the worker
 * accepts it everywhere (`utils/solanaNative.ts` there). `So111…112` is
 * wrapped SOL, a different balance.
 */
export const SOLANA_NATIVE = '11111111111111111111111111111111'

/** The native asset's address on a chain: the zero address on EVM. */
export function nativeAddressFor(chainId: string | undefined): string {
  return chainId === 'solana' ? SOLANA_NATIVE : zeroAddress
}

/**
 * The key a token-list address is stored under: lower-case on EVM, where
 * the hex is case-insensitive, and VERBATIM on Solana, where base58 is
 * case-significant — lower-casing a mint names a different account.
 */
export function tokenKey(chainId: string | undefined, address: string): string {
  return chainId === 'solana' ? address : address.toLowerCase()
}
