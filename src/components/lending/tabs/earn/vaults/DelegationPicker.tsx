import React, { useEffect, useState } from 'react'
import { formatUnits } from 'viem'
import { abbreviateNumber } from '../../../../../utils/format'
import { useVaultValidators } from '../../../../../hooks/vaults'
import type {
  VaultDelegation,
  VaultValidatorItem,
} from '../../../../../sdk/vaults-helper'

interface DelegationPickerProps {
  chainId: string
  /** The LST vault's share-token address. */
  shareToken: string
  delegation: VaultDelegation
  /** Underlying decimals — used to format `receivableVotes` ("room"). */
  underlyingDecimals: number
  underlyingSymbol?: string
  /** Currently chosen id (null = use the server default / auto). */
  value: string | null
  onChange: (value: string | null) => void
}

const KIND_LABELS: Record<VaultDelegation['kind'], string> = {
  validator: 'validator',
  validatorGroup: 'validator group',
  node: 'node',
  pool: 'pool',
  vault: 'vault',
}

function shortId(id: string): string {
  return id.startsWith('0x') && id.length > 12
    ? `${id.slice(0, 6)}…${id.slice(-4)}`
    : id
}

function room(req: string | undefined, decimals: number): string | null {
  if (!req) return null
  try {
    return abbreviateNumber(Number(formatUnits(BigInt(req), decimals)))
  } catch {
    return null
  }
}

export const DelegationPicker: React.FC<DelegationPickerProps> = ({
  chainId,
  shareToken,
  delegation,
  underlyingDecimals,
  underlyingSymbol,
  value,
  onChange,
}) => {
  const kindLabel = KIND_LABELS[delegation.kind] ?? 'option'
  const isOffchain = delegation.source === 'offchain'
  const isOptional = !delegation.required

  // Optional pickers (e.g. stCELO, default 'auto') stay collapsed until the
  // user opts into choosing; required pickers (e.g. stCORE) are always open.
  const [advancedOpen, setAdvancedOpen] = useState(false)

  // Endpoint-sourced set: only fetch when actually shown. (Hook runs
  // unconditionally; `enabled` gates the network call.)
  const enabled = !isOffchain && (delegation.required || advancedOpen)
  const { validators, isLoading, error, refetch } = useVaultValidators({
    chainId,
    shareToken,
    enabled,
  })

  // Preselect the recommended (or first selectable) option once loaded, for
  // required pickers. Optional pickers default to "Auto" (null).
  useEffect(() => {
    if (isOffchain || !delegation.required || value || validators.length === 0) return
    const pick =
      validators.find((v) => v.recommended && v.selectable) ??
      validators.find((v) => v.selectable)
    if (pick) onChange(pick.id)
  }, [isOffchain, delegation.required, value, validators, onChange])

  // ── Off-chain id (e.g. Solv poolId): a free-form text input ──
  if (isOffchain) {
    return (
      <div className="rounded-lg border border-base-300 px-2 py-1.5 text-xs space-y-1">
        <label className="text-base-content/60 capitalize">{kindLabel}</label>
        <input
          type="text"
          spellCheck={false}
          className="input input-bordered input-xs w-full font-mono"
          placeholder={delegation.required ? 'Required' : 'Optional'}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value.trim() || null)}
        />
      </div>
    )
  }

  const renderOption = (v: VaultValidatorItem) => {
    const r = room(v.receivableVotes, underlyingDecimals)
    const parts = [shortId(v.id)]
    if (v.recommended) parts.push('★')
    if (r) parts.push(`room ${r}${underlyingSymbol ? ` ${underlyingSymbol}` : ''}`)
    return (
      <option key={v.id} value={v.id} disabled={!v.selectable}>
        {parts.join(' · ')}
        {!v.selectable ? ' (unavailable)' : ''}
      </option>
    )
  }

  const select = error ? (
    <div className="text-error text-[11px] flex items-center gap-2">
      <span>Couldn’t load {kindLabel}s</span>
      <button type="button" className="btn btn-xs btn-ghost" onClick={() => refetch()}>
        Retry
      </button>
    </div>
  ) : (
    <select
      className="select select-bordered select-xs w-full"
      value={value ?? ''}
      disabled={isLoading || validators.length === 0}
      onChange={(e) => onChange(e.target.value || null)}
    >
      {isOptional && <option value="">Auto (recommended)</option>}
      {!isOptional && !value && (
        <option value="" disabled>
          {isLoading ? 'Loading…' : `Select a ${kindLabel}`}
        </option>
      )}
      {validators.map(renderOption)}
    </select>
  )

  return (
    <div className="rounded-lg border border-base-300 px-2 py-1.5 text-xs space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-base-content/60 capitalize">{kindLabel}</span>
        {isOptional && (
          <button
            type="button"
            className="text-[10px] text-base-content/40 hover:text-base-content"
            onClick={() => setAdvancedOpen((o) => !o)}
          >
            {advancedOpen ? 'Use auto' : 'Choose'}
          </button>
        )}
      </div>
      {isOptional && !advancedOpen ? (
        <div className="text-[10px] text-base-content/50">
          Auto — the protocol picks the best {kindLabel}.
        </div>
      ) : (
        select
      )}
    </div>
  )
}
