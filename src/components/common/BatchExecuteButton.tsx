import { useState } from 'react'

interface BatchExecuteButtonProps {
  /** Ordered labels of the calls in the bundle, top to bottom. */
  steps: string[]
  /** Verb for the button, e.g. "Execute Loop". */
  label: string
  onExecute: () => void
  executing: boolean
  disabled?: boolean
  /** Wallet reports `atomic: 'ready'` — first batch prompts the 7702 upgrade. */
  needsUpgrade?: boolean
  className?: string
}

/**
 * One-confirmation replacement for a sequential "approve → setup → execute"
 * button stack, rendered only where the wallet advertises atomic batching
 * (see `useAtomicBatch`). The bundled steps stay visible — collapsed by
 * default — so the single confirmation is never a black box.
 */
export function BatchExecuteButton({
  steps,
  label,
  onExecute,
  executing,
  disabled,
  needsUpgrade,
  className = 'btn btn-success btn-sm w-full',
}: BatchExecuteButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-1.5">
      {steps.length > 1 && (
        <div className="rounded-lg border border-base-300 bg-base-200/40 text-xs">
          <button
            type="button"
            className="flex w-full items-center justify-between px-2.5 py-1.5 text-left cursor-pointer"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="text-base-content/70">
              {steps.length} steps bundled into 1 transaction
            </span>
            <span className="text-base-content/40 text-[10px]">{open ? '▲' : '▼'}</span>
          </button>
          {open && (
            <ol className="px-2.5 pb-1.5 space-y-0.5">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-1.5 text-[11px] text-base-content/60">
                  <span className="tabular-nums text-base-content/40">{i + 1}.</span>
                  <span className="truncate">{s}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {needsUpgrade && (
        <p className="text-[10px] leading-tight text-base-content/50 px-1">
          Your wallet will ask once to enable batching for this account (EIP-7702). Everything runs
          atomically — if any step fails, nothing is applied.
        </p>
      )}

      <button
        type="button"
        className={className}
        disabled={disabled || executing}
        onClick={onExecute}
      >
        {executing ? (
          <span className="loading loading-spinner loading-xs" />
        ) : steps.length > 1 ? (
          `${label} (1 transaction)`
        ) : (
          label
        )}
      </button>
    </div>
  )
}
