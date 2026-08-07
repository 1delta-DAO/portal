import { useEffect, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import { useBatchMode } from '../../contexts/BatchMode'
import { batchableChains, useAtomicBatch } from '../../hooks/useAtomicBatch'

/**
 * App-wide settings dropdown. Currently holds the atomic-batching switch —
 * the one control that changes how *every* multi-step flow is confirmed, so it
 * belongs in the navbar rather than inside any single action panel — plus a
 * readout of what the connected wallet actually reported, so "why is there no
 * one-click button?" has an answer on screen instead of in the console.
 */
export function SettingsMenu() {
  const { batchEnabled, setBatchEnabled } = useBatchMode()
  const { address, chainId } = useAccount()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Scoped to the chain the WALLET is on — that is the account the upgrade
  // would apply to, and the only chain we can act on from here.
  const {
    atomicStatus,
    chainNotListed,
    capabilities,
    probing,
    probeError,
    upgradeAccount,
    sending,
    error: upgradeError,
  } = useAtomicBatch({ chainId: String(chainId ?? '') })

  const otherChains = batchableChains(capabilities).filter((c) => c.chainId !== chainId)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  /** One honest line about the connected wallet on its current chain. */
  const statusLine = !address
    ? 'Connect a wallet to detect support.'
    : probing
      ? 'Detecting wallet support…'
      : atomicStatus === 'supported'
        ? `Active on chain ${chainId} — multi-step flows run as one transaction.`
        : atomicStatus === 'ready'
          ? `Available on chain ${chainId}. Your account isn't upgraded yet — the first batch (or the button below) will ask your wallet to do it.`
          : atomicStatus === 'unsupported'
            ? `Your wallet reports no atomic batching on chain ${chainId}, so flows stay step-by-step.`
            : chainNotListed
              ? // The wallet answered — it just doesn't offer batching here.
                // Wallets enable 7702 chain by chain; this is their gate, not
                // the chain's and not ours.
                `Your wallet doesn't offer batching on chain ${chainId} yet, so flows stay step-by-step. Support is enabled per chain by the wallet.`
              : probeError
                ? `Your wallet doesn't answer the EIP-5792 capability probe, so flows stay step-by-step. (${probeError})`
                : `Your wallet returned no capabilities for chain ${chainId}, so flows stay step-by-step.`

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-circle"
        onClick={() => setOpen((v) => !v)}
        aria-label="Settings"
        title="Settings"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open && (
        // Width is capped to the viewport so the panel can't hang off a narrow
        // screen; long diagnostics wrap rather than widen it.
        <div className="absolute right-0 top-full mt-2 z-50 w-80 max-w-[calc(100vw-1.5rem)] max-h-[75vh] overflow-y-auto overflow-x-hidden overscroll-contain rounded-box border border-base-300 bg-base-100 p-3 shadow-lg space-y-2">
          <div className="text-xs font-semibold text-base-content/70">Transactions</div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-sm mt-0.5"
              checked={batchEnabled}
              onChange={(e) => setBatchEnabled(e.target.checked)}
            />
            <span className="flex-1">
              <span className="block text-sm font-medium leading-tight">One-click batching</span>
              <span className="block text-[11px] leading-tight text-base-content/60 mt-0.5">
                Bundle approvals, setup steps and the action itself into a single atomic
                confirmation (EIP-5792 / EIP-7702). Falls back to step-by-step wherever your wallet
                doesn't support it.
              </span>
            </span>
          </label>

          <div className="rounded-lg bg-base-200/60 px-2 py-1.5 text-[10px] leading-tight text-base-content/60 space-y-1 break-words">
            <div>{statusLine}</div>
            {otherChains.length > 0 && (
              <div>
                {atomicStatus ? 'Also available' : 'Available'} on chain
                {otherChains.length > 1 ? 's' : ''} {otherChains.map((c) => c.chainId).join(', ')}.
              </div>
            )}
            {!batchEnabled && (
              <div className="text-warning/80">
                Switch is off — every flow runs step by step regardless.
              </div>
            )}
          </div>

          {/* Upgrade is the wallet's job; we just give it a reason to happen now
              rather than in the middle of a real action. Only offered when the
              wallet says the account is upgradeable but not yet upgraded. */}
          {atomicStatus === 'ready' && (
            <div className="space-y-1">
              <button
                type="button"
                className="btn btn-outline btn-sm w-full"
                disabled={sending}
                onClick={() => upgradeAccount()}
              >
                {sending ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  'Enable batching for this account'
                )}
              </button>
              <p className="text-[10px] leading-tight text-base-content/50">
                Sends one empty transaction so your wallet can perform the EIP-7702 upgrade now.
                Skipping this is fine — the first batched action prompts for it anyway.
              </p>
            </div>
          )}

          {upgradeError && (
            <div className="text-[10px] leading-tight text-error break-words">{upgradeError}</div>
          )}

          {/* Raw probe response — the fastest way to tell a wallet that lacks
              5792 apart from one that answers with an unexpected shape. */}
          {address && !probing && (
            <details className="text-[10px] text-base-content/50">
              <summary className="cursor-pointer">Wallet capability response</summary>
              {/* Wrap rather than scroll sideways — a horizontal scrollbar
                  inside a dropdown reads as clipped content. */}
              <pre className="mt-1 max-h-40 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all rounded bg-base-200/60 p-1.5 text-[9px] leading-tight">
                {JSON.stringify(capabilities ?? {}, null, 1)}
                {probeError ? `\n\nprobe error: ${probeError}` : ''}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
