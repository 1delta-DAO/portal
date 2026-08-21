import React from 'react'
import { Logo } from './Logo'
import { chainLogoUrl } from '../../config/assets'
import { getChainName } from '../../lib/lib-utils'

interface Props {
  /** The subject's own artwork — a venue logo, a token logo. */
  src?: string | null
  alt?: string
  fallbackText?: string
  /** Chain the row lives on. Omitted ⇒ no badge, same as `showChain={false}`. */
  chainId?: string
  /** Subject size in px. The badge scales from it. */
  size?: number
  /** Extra classes for the circular crop around the subject (rings, borders). */
  className?: string
  /**
   * Hide the badge where the chain is already stated once for the whole view
   * (a single-chain panel), so it is not repeated down every row.
   */
  showChain?: boolean
  /**
   * Circular crop for the subject. True for coins and chains, which read as
   * round everywhere; false for lender / venue artwork, which is square or a
   * wordmark and loses its identifying parts inside a circle. The chain badge
   * itself is always round — it is a chain.
   */
  round?: boolean
  /** Appended to the subject's own tooltip, e.g. `Morpho · Base`. */
  title?: string
}

/**
 * A logo with the chain it belongs to badged onto its corner.
 *
 * Multi-chain tables list rows from several chains interleaved, and a row is
 * only actionable on its own chain — so the chain is part of the row's
 * identity. It rides the logo rather than taking a column because these tables
 * are already at their width budget: the venue/asset column is the one that
 * truncates first, and a separate Chain column costs ~12% of the table to
 * repeat one small fact. The full chain name stays in the tooltip.
 */
export const ChainBadgedLogo: React.FC<Props> = ({
  src,
  alt = '',
  fallbackText,
  chainId,
  size = 24,
  className = '',
  showChain = true,
  round = true,
  title,
}) => {
  const badge = Math.max(9, Math.round(size * 0.44))
  const chainName = chainId ? getChainName(chainId) : ''
  const withBadge = showChain && !!chainId

  return (
    <span
      className="relative inline-flex shrink-0 leading-none"
      style={{ width: size, height: size }}
      title={title ?? (withBadge ? `${alt} · ${chainName}` : alt)}
    >
      {/* Token/chain art is a mix of square and round sources, so a circular
          crop unifies them. Protocol art is left alone — see `round`. */}
      <span className={`${round ? 'overflow-hidden rounded-full' : ''} ${className}`}>
        <Logo
          src={src}
          alt={alt}
          size={size}
          fallbackText={fallbackText ?? alt}
          className={round ? 'rounded-full object-contain' : 'protocol-logo'}
        />
      </span>
      {withBadge && (
        // The ring is what keeps the badge readable over dark and light logos
        // alike — without it a chain mark blends into whatever it sits on.
        <span
          className="absolute -bottom-0.5 -right-0.5 overflow-hidden rounded-full bg-base-100 ring-1 ring-base-100"
          style={{ width: badge, height: badge }}
        >
          <Logo
            src={chainLogoUrl(chainId!)}
            alt={chainName}
            size={badge}
            fallbackText={chainName}
            className="rounded-full block"
          />
        </span>
      )}
    </span>
  )
}
