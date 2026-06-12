import React from 'react'
import {
  useVaultRequestAction,
  useVaultWithdrawals,
  withdrawalKey,
} from '../../../../../hooks/vaults'
import type { VaultEntry, VaultWithdrawalRequest } from '../../../../../sdk/vaults-helper'
import { formatTokenAmount } from '../../../actions/format'
import { PROVIDER_LABELS } from './helpers'

interface PendingWithdrawalsProps {
  chainId: string
  account?: string
  /** Catalog map (lowercased vault address → entry) for provider routing. */
  catalogByVault: Map<string, VaultEntry>
}

/** Seconds-or-ISO → human "ready in" hint, or null when already matured/unknown. */
function readyHint(readyAt?: number | string): string | null {
  if (readyAt == null) return null
  const ms =
    typeof readyAt === 'number'
      ? readyAt * 1000
      : Number.isFinite(Number(readyAt))
        ? Number(readyAt) * 1000
        : Date.parse(readyAt)
  if (!Number.isFinite(ms)) return null
  const diff = ms - Date.now()
  if (diff <= 0) return null
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  if (days > 0) return `~${days}d ${hours}h`
  const mins = Math.floor((diff % 3_600_000) / 60_000)
  return hours > 0 ? `~${hours}h ${mins}m` : `~${mins}m`
}

/**
 * Lists the user's pending/claimable async-vault withdrawals (lst, gmx,
 * lagoon) and lets them claim matured requests or cancel pending ones. Renders
 * nothing when there are no requests, so it's safe to always mount.
 */
export const PendingWithdrawals: React.FC<PendingWithdrawalsProps> = ({
  chainId,
  account,
  catalogByVault,
}) => {
  const { requests, isLoading, error, refetch } = useVaultWithdrawals({
    chainId,
    account,
  })
  const { run, busyKey, error: actionError } = useVaultRequestAction({
    chainId,
    account,
  })

  if (!account) return null
  if (!isLoading && !error && requests.length === 0) return null

  const providerFor = (req: VaultWithdrawalRequest) =>
    catalogByVault.get(req.lst.toLowerCase())?.provider

  const act = async (
    verb: 'claim' | 'cancel',
    req: VaultWithdrawalRequest
  ) => {
    const provider = providerFor(req)
    if (!provider) return
    const ok = await run(verb, provider, req)
    if (ok) refetch()
  }

  return (
    <div className="w-full p-0 sm:p-4 space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Pending withdrawals</h3>
        {isLoading && <span className="loading loading-spinner loading-xs" />}
        <span className="text-xs text-base-content/50">{requests.length}</span>
      </div>

      {error ? (
        <div className="text-error text-xs flex items-center gap-2">
          <span>{error.message}</span>
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-box border border-base-300">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Vault</th>
                <th>Amount</th>
                <th>Status</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => {
                const provider = providerFor(req)
                const key = withdrawalKey(req)
                const busy = busyKey === key
                const claimable = req.status === 'claimable'
                const hint = readyHint(req.readyAt)
                return (
                  <tr key={key}>
                    <td>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {req.symbol ?? req.brand ?? 'Vault'}
                        </span>
                        {provider && (
                          <span className="text-[10px] text-base-content/50">
                            {PROVIDER_LABELS[provider]}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="tabular-nums">
                      {req.amountUnderlying
                        ? formatTokenAmount(req.amountUnderlying)
                        : '—'}
                    </td>
                    <td>
                      <span
                        className={`badge badge-sm ${
                          claimable ? 'badge-success' : 'badge-ghost'
                        }`}
                      >
                        {claimable ? 'Claimable' : 'Pending'}
                      </span>
                      {!claimable && hint && (
                        <span className="text-[10px] text-base-content/50 ml-1">{hint}</span>
                      )}
                    </td>
                    <td className="text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          className="btn btn-xs btn-success"
                          disabled={!claimable || !provider || busy}
                          onClick={() => act('claim', req)}
                          title={!provider ? 'Unknown vault — refresh catalog' : undefined}
                        >
                          {busy ? <span className="loading loading-spinner loading-xs" /> : 'Claim'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost"
                          disabled={!provider || busy}
                          onClick={() => act('cancel', req)}
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {actionError && <div className="text-error text-xs">{actionError}</div>}
    </div>
  )
}
