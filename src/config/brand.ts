/**
 * Brand identity — the strings a fork edits to rebrand the app.
 *
 * What this file does NOT cover (edit those directly):
 *  - `index.html`: title, meta description, OG/Twitter URLs, theme-color
 *  - `public/`: favicons, app icons, og-image, site.webmanifest
 *  - `src/components/PortalLogo.tsx`: the logo mark itself
 *  - `src/styles/globals.css`: the theme palettes
 */
export const BRAND = {
  /** Product name — wallet-connect modals, wordmark, titles. */
  name: 'Portal',
  /** Publisher, for attribution strings. */
  org: '1delta',
  /**
   * Prefix for the localStorage keys the app writes (terms acknowledgements).
   * Changing it orphans users' stored acknowledgements — they will simply be
   * asked to acknowledge again.
   */
  storagePrefix: '1delta.',
} as const

/**
 * The navbar wordmark, split for the letter-spliced logo treatment:
 * first letter + logo standing in for the second + the rest.
 * "Portal" → `P` `◉` `RTAL`.
 */
export const WORDMARK = {
  head: BRAND.name[0].toUpperCase(),
  tail: BRAND.name.slice(2).toUpperCase(),
} as const
