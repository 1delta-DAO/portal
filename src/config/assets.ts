// Static-asset bases — every hardcoded logo / token-list URL in one place, so
// a fork that mirrors these repos (or serves its own assets) edits one file.
//
// These are public raw.githubusercontent.com URLs, fetched straight from the
// browser — no backend involvement, no envelope, no auth headers.

/** Chain logos: `<base>/<chainId>.webp`. */
export const CHAIN_LOGO_BASE = 'https://raw.githubusercontent.com/1delta-DAO/chains/main'

export const chainLogoUrl = (chainId: string | number) => `${CHAIN_LOGO_BASE}/${chainId}.webp`

/** Lender / protocol icons: `<base>/lender/<lender>.webp` (lender lowercased). */
export const PROTOCOL_ICON_BASE = 'https://raw.githubusercontent.com/1delta-DAO/protocol-icons/main'

export const lenderIconUrl = (lender: string) =>
  `${PROTOCOL_ICON_BASE}/lender/${lender.toLowerCase()}.webp`

/** Lender info assets (logos used by the vaults catalog): `<base>/<slug>/logo.svg`. */
export const LENDER_INFO_BASE =
  'https://raw.githubusercontent.com/1delta-DAO/asset-list-config/main/lender-info'

export const lenderInfoLogoUrl = (slug: string) => `${LENDER_INFO_BASE}/${slug}/logo.svg`

/** Per-chain token lists: `<base>/<chainId>.json`. */
export const TOKEN_LIST_BASE = 'https://raw.githubusercontent.com/1delta-DAO/token-lists/main'

export const tokenListUrl = (chainId: string) => `${TOKEN_LIST_BASE}/${chainId}.json`
