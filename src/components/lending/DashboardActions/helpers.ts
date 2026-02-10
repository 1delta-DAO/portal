/** Lenders that support multiple sub-accounts per user */
const MULTI_ACCOUNT_LENDERS = new Set(['INIT'])

export function lenderSupportsSubAccounts(lender?: string): boolean {
  if (!lender) return false
  return MULTI_ACCOUNT_LENDERS.has(lender)
}
