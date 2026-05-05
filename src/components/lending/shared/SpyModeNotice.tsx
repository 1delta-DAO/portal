import React from 'react'

/**
 * Banner shown above action panels when spy mode is active. Actions remain
 * enabled (quotes can be fetched, transactions built) so the developer can
 * test flows against accounts with real balances — signing the final tx will
 * fail because the connected wallet isn't the spied address. This banner
 * makes that expectation explicit.
 */
export const SpyModeNotice: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-[11px] leading-snug text-base-content/70 ${className}`}
  >
    <div className="flex items-center gap-1.5">
      <span className="text-warning text-sm leading-none" aria-hidden>
        ⦿
      </span>
      <span className="font-semibold text-warning">Spy mode</span>
      <span className="text-base-content/55">— quotes work, signing will fail</span>
    </div>
  </div>
)
