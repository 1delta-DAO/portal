import React from 'react'
import type { VaultEntry } from '../../../../../sdk/vaults-helper'
import { PROVIDER_LABELS, formatSupplyRate, isSupplyRateMeaningful } from './helpers'
import { abbreviateUsd } from '../../../../../utils/format'
import { PortalPopover, PopoverField, CopyRow } from '../../../../common/PortalPopover'

interface VaultPopoverProps {
  vault: VaultEntry
  chainId?: string
  /** Underlying token symbol / logo, used as fallbacks. */
  underlyingSymbol?: string
  underlyingLogo?: string
  children?: React.ReactNode
}

/**
 * Vault icon + children with a click-triggered popover showing the vault's
 * identity and classification (provider, curator, asset class, yield profile,
 * denomination), share price, APR, TVL, fee, and copiable addresses.
 *
 * Thin wrapper over the shared {@link PortalPopover}.
 */
export const VaultPopover: React.FC<VaultPopoverProps> = ({
  vault,
  chainId,
  underlyingSymbol,
  underlyingLogo,
  children,
}) => {
  const logo = vault.logoURI ?? underlyingLogo
  const sym = vault.symbol || vault.name
  const apr = isSupplyRateMeaningful(vault) ? formatSupplyRate(vault) : null

  return (
    <PortalPopover
      logoURI={logo}
      symbol={sym}
      fallbackText={sym}
      triggerTitle="Click for vault details"
      trigger={children}
    >
      {vault.name && vault.name !== sym && <PopoverField label="Name" value={vault.name} capitalize />}
      <PopoverField label="Provider" value={PROVIDER_LABELS[vault.provider] ?? vault.provider} capitalize />
      {vault.curator && <PopoverField label="Curator" value={vault.curator} capitalize />}
      {vault.assetGroup && <PopoverField label="Class" value={vault.assetGroup} capitalize />}
      {vault.yieldProfile && <PopoverField label="Profile" value={vault.yieldProfile} capitalize />}
      {vault.denomination && <PopoverField label="Denom." value={vault.denomination} capitalize />}
      {chainId && <PopoverField label="Chain" value={chainId} />}
      {apr && <PopoverField label="APR" value={<span className="text-success">{apr}</span>} />}
      {(vault.sharePriceUsd != null || vault.sharePrice != null) && (
        <div className="flex items-start gap-2">
          <span className="text-base-content/50 shrink-0 w-16">Share px</span>
          <span className="font-medium tabular-nums">
            {vault.sharePriceUsd != null
              ? `$${vault.sharePriceUsd.toLocaleString(undefined, { maximumFractionDigits: 4 })}`
              : `${vault.sharePrice!.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${underlyingSymbol ?? ''}`}
          </span>
        </div>
      )}
      {vault.totalAssetsUsd != null && vault.totalAssetsUsd > 0 && (
        <PopoverField
          label="TVL"
          value={<span className="tabular-nums">{abbreviateUsd(vault.totalAssetsUsd)}</span>}
        />
      )}
      {vault.fee != null && vault.fee > 0 && <PopoverField label="Fee" value={`${vault.fee.toFixed(2)}%`} />}
      {underlyingSymbol && <PopoverField label="Underlying" value={underlyingSymbol} />}
      <CopyRow label="Asset" value={vault.underlying} />
      <CopyRow label="Vault" value={vault.address} />
    </PortalPopover>
  )
}
