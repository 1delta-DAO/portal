import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Address } from 'viem'
import { ChainFilterSelect } from '../lending/shared/ChainFilter'
import { TokenSelector } from './index'
import type { RawCurrency } from '../../types/currency'
import { getCurrency } from '../../lib/trade-helpers/utils'
import { useChains } from '../../hooks/useChains'

type TokenSelectorModalProps = {
  open: boolean
  onClose: () => void
  currency?: RawCurrency
  onCurrencyChange: (currency: RawCurrency) => void
  onChainChange?: (chainId: string) => void
  query: string
  onQueryChange: (query: string) => void
  excludeAddresses?: Address[]
  showChainSelector?: boolean
  initialChainId?: string
}

export function TokenSelectorModal({
  open,
  onClose,
  currency,
  onCurrencyChange,
  onChainChange,
  query,
  onQueryChange,
  excludeAddresses,
  showChainSelector = false,
  initialChainId,
}: TokenSelectorModalProps) {
  const { chains } = useChains()
  const [chainId, setChainId] = useState<string | undefined>(
    initialChainId ?? currency?.chainId ?? '137'
  )

  useEffect(() => {
    if (open) {
      if (initialChainId) {
        setChainId(initialChainId)
      } else if (currency?.chainId) {
        setChainId(currency.chainId)
      }
    }
  }, [open, initialChainId, currency?.chainId])

  const tokenValue = useMemo(() => currency?.address as Address | undefined, [currency?.address])

  const handleTokenSelect = useCallback(
    (addr: Address) => {
      if (!chainId) return
      const selectedCurrency = getCurrency(chainId, addr)
      if (selectedCurrency) {
        onCurrencyChange(selectedCurrency)
      }
      onClose()
    },
    [chainId, onCurrencyChange, onClose]
  )

  const handleChainChange = useCallback(
    (cid: string) => {
      setChainId(cid)
      onChainChange?.(cid)
    },
    [onChainChange]
  )

  if (!open) return null

  return (
    <div className="modal modal-open" onClick={onClose}>
      <div
        className="modal-box max-w-2xl max-h-[90dvh] p-0 flex flex-col overflow-x-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-base-300 shrink-0">
          <h3 className="font-bold min-w-0 truncate">Select a token</h3>
          <button className="btn btn-sm btn-ghost shrink-0" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* search + chain selector. min-w-0 cascades so the input can shrink
            past its placeholder width on narrow viewports; the chain selector
            uses a basis instead of a hard min-width to avoid pushing the row
            past the modal width on mobile. */}
        <div className="px-4 py-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <input
              className="input input-bordered flex-1 min-w-0"
              placeholder="Search tokens"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
            />
            {showChainSelector && (
              <div className="shrink-0 basis-28 sm:basis-40 min-w-0">
                <ChainFilterSelect chains={chains} value={chainId ?? ''} onChange={handleChainChange} />
              </div>
            )}
          </div>
        </div>

        {/* Token list — explicitly vertical-only scroll. Any residual content
            overflow gets clipped, never sideways-scrolled. */}
        <div className="flex-1 min-w-0 px-4 pb-4 overflow-y-auto overflow-x-hidden">
          {chainId && (
            <div className="h-full min-w-0">
              <TokenSelector
                chainId={chainId}
                value={tokenValue}
                onChange={handleTokenSelect}
                excludeAddresses={excludeAddresses}
                query={query}
                onQueryChange={onQueryChange}
                showSearch={false}
                listMode={true}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
