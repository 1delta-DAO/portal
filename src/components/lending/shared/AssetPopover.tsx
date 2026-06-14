import React from 'react'
import { IrmDetailsButton } from './IrmDock'
import { PortalPopover, PopoverField, CopyRow } from '../../common/PortalPopover'
import { formatPrice } from '../../../utils/format'

interface AssetPopoverProps {
  address?: string
  name: string
  symbol: string
  logoURI?: string
  children?: React.ReactNode
  positionDot?: boolean
  marketUid?: string
  marketName?: string
  currentDepositRate?: number
  currentBorrowRate?: number
  /** Market price (from price feed) */
  priceUsd?: number
  /** Oracle price in USD */
  oraclePriceUsd?: number
  /** Chain ID for display */
  chainId?: string
}

/**
 * Inline asset icon + children with a click-triggered popover showing
 * address (copiable), name, symbol, price and a link to the IRM details.
 *
 * Thin wrapper over the shared {@link PortalPopover} — supplies the asset's
 * identity and field rows; the portal shell / positioning lives in the
 * primitive.
 */
export const AssetPopover: React.FC<AssetPopoverProps> = ({
  address,
  name,
  symbol,
  logoURI,
  children,
  positionDot,
  marketUid,
  marketName,
  currentDepositRate,
  currentBorrowRate,
  priceUsd,
  oraclePriceUsd,
  chainId,
}) => (
  <PortalPopover
    logoURI={logoURI}
    symbol={symbol}
    fallbackText={symbol || name}
    positionDot={positionDot}
    trigger={children}
  >
    {marketName && <PopoverField label="Market" value={marketName} />}
    <PopoverField label="Symbol" value={symbol} />
    {name && name !== symbol && <PopoverField label="Name" value={name} />}
    {chainId && <PopoverField label="Chain" value={chainId} />}
    {address && <CopyRow label="Address" value={address} />}
    {(priceUsd != null || oraclePriceUsd != null) && (
      <div className="flex items-start gap-2">
        <span className="text-base-content/50 shrink-0 w-16">Price</span>
        <div className="flex flex-col gap-0.5">
          {priceUsd != null && (
            <span className="font-medium tabular-nums">
              {formatPrice(priceUsd)}
              <span className="text-base-content/40 font-normal ml-1">market</span>
            </span>
          )}
          {oraclePriceUsd != null && (
            <span className="font-medium tabular-nums">
              {formatPrice(oraclePriceUsd)}
              <span className="text-base-content/40 font-normal ml-1">oracle</span>
            </span>
          )}
        </div>
      </div>
    )}
    {marketUid && (
      <>
        <CopyRow label="Mkt ID" value={marketUid} />
        <div className="flex items-start gap-2 pt-1">
          <span className="text-base-content/50 shrink-0 w-16">Details</span>
          <IrmDetailsButton
            marketUid={marketUid}
            marketName={marketName ?? name}
            currentDepositRate={currentDepositRate}
            currentBorrowRate={currentBorrowRate}
          />
        </div>
      </>
    )}
  </PortalPopover>
)
