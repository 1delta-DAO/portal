import React from 'react'
import type { PermitSignatureRequest, PermitSkip } from '../../sdk/permits'
import { permitSecondsLeft } from '../../sdk/permits'

/**
 * The permit switch + signature card shared by the spot and cross-chain swap
 * panels (the two-call permit flow — see `sdk/permits.ts`). The switch only
 * changes what the QUOTE asks for (`permit=auto`); whether a signature is
 * actually offered is the API's per-token answer, rendered by the card.
 */

export function PermitToggle({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className="flex items-center justify-between gap-2 px-1 cursor-pointer">
      <span className="text-xs text-base-content/60 flex items-center gap-1.5">
        Gasless approval
        <span className="badge badge-outline badge-xs text-[9px] px-1">Permit</span>
        <span
          className="tooltip tooltip-right text-base-content/30"
          data-tip="Sign an EIP-712 permit instead of sending an approval transaction — the permit executes inside the swap itself. Offered when the token supports it."
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </span>
      <input
        type="checkbox"
        className="toggle toggle-primary toggle-xs"
        checked={enabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}

/** The signature offer — shown between the quotes and the execute button. */
export function PermitSignCard({
  offer,
  signing,
  onSign,
}: {
  offer: PermitSignatureRequest
  signing: boolean
  onSign: () => void
}) {
  const minutesLeft = Math.max(0, Math.floor(permitSecondsLeft(offer) / 60))
  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-2.5 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium flex items-center gap-1.5">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-primary">
            <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
            <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
          </svg>
          Sign instead of approving
        </span>
        <span className="text-[10px] text-base-content/40">
          {offer.kind} · valid ~{minutesLeft} min
        </span>
      </div>
      <p className="text-[11px] text-base-content/60">
        One signature replaces the ERC-20 approval — it executes inside the swap transaction, so
        there is one less transaction to send{offer.unscoped ? '' : ' and it is scoped to this exact amount'}.
      </p>
      <button
        type="button"
        className="btn btn-primary btn-sm w-full"
        disabled={signing}
        onClick={onSign}
      >
        {signing ? (
          <>
            <span className="loading loading-spinner loading-xs" />
            Waiting for signature…
          </>
        ) : (
          'Sign Permit'
        )}
      </button>
    </div>
  )
}

/** Confirmation chip once the signed permit is inside the quoted calldata. */
export function PermitAppliedChip() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-success px-1">
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
          clipRule="evenodd"
        />
      </svg>
      Permit applied — no approval transaction needed
    </div>
  )
}

/** Why the API kept the approve, when the switch asked for a permit. */
export function PermitSkippedHint({ skipped }: { skipped: PermitSkip[] }) {
  if (skipped.length === 0) return null
  return (
    <div className="text-[10px] text-base-content/40 px-1 space-y-0.5">
      {skipped.map((s, i) => (
        <p key={i}>No permit: {s.reason}</p>
      ))}
    </div>
  )
}
