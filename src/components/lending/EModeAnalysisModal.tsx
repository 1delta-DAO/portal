import React, { useEffect, useState } from 'react'
import type { UserSubAccount } from '../../hooks/lending/useUserData'
import {
  fetchEModeList,
  fetchEModeAnalysis,
  type EModeCategory,
  type EModeAnalysisEntry,
  type EModeAnalysisBody,
} from '../../sdk/lending-helper/fetchEMode'

// ============================================================================
// E-Mode Button — shows current mode, opens the analysis modal on click
// ============================================================================

interface EModeBadgeProps {
  subAccount: UserSubAccount
  lender: string
  chainId: string
}

export const EModeBadge: React.FC<EModeBadgeProps> = ({ subAccount, lender, chainId }) => {
  const [open, setOpen] = useState(false)
  const mode = subAccount.userConfig.selectedMode

  return (
    <>
      <button
        type="button"
        className="badge badge-sm badge-outline gap-1 cursor-pointer hover:bg-base-200 transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        title="View e-mode options"
      >
        <span className="text-[9px] font-bold uppercase">E-Mode</span>
        <span className="text-[10px]">{mode === 0 ? 'Off' : `#${mode}`}</span>
      </button>

      {open && (
        <EModeAnalysisModal
          subAccount={subAccount}
          lender={lender}
          chainId={chainId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

// ============================================================================
// E-Mode Analysis Modal
// ============================================================================

interface EModeAnalysisModalProps {
  subAccount: UserSubAccount
  lender: string
  chainId: string
  onClose: () => void
}

const EModeAnalysisModal: React.FC<EModeAnalysisModalProps> = ({
  subAccount,
  lender,
  chainId,
  onClose,
}) => {
  const [categories, setCategories] = useState<EModeCategory[]>([])
  const [analysis, setAnalysis] = useState<EModeAnalysisEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const currentMode = subAccount.userConfig.selectedMode
  const hasPositions = subAccount.positions.some(
    (p) => p.depositsUSD > 0 || p.debtUSD > 0
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      // 1. Fetch available e-mode categories
      const listRes = await fetchEModeList({ lender, chain: chainId })
      if (cancelled) return

      if (!listRes.success || !listRes.data) {
        setError(listRes.error ?? 'Failed to load e-mode categories')
        setLoading(false)
        return
      }

      // Find the entry for this lender/chain
      const entry = listRes.data.find(
        (e) => e.lender === lender && e.chainId === chainId
      )
      const cats = entry?.categories ?? []
      setCategories(cats)

      // If only one mode (or none), no analysis needed
      if (cats.length <= 1) {
        setLoading(false)
        return
      }

      // 2. If the user has positions, run the analysis
      if (hasPositions) {
        const body: EModeAnalysisBody = {
          accountId: subAccount.accountId,
          health: subAccount.health,
          borrowCapacityUSD: subAccount.borrowCapacityUSD,
          balanceData: {
            collateral: subAccount.balanceData.collateral,
            adjustedDebt: subAccount.balanceData.adjustedDebt,
            deposits: subAccount.balanceData.deposits,
            debt: subAccount.balanceData.debt,
            borrowDiscountedCollateral: subAccount.balanceData.borrowDiscountedCollateral,
            nav: subAccount.balanceData.nav,
          },
          positions: subAccount.positions.map((p) => ({
            marketUid: p.marketUid,
            depositsUSD: p.depositsUSD,
            debtUSD: p.debtUSD,
            debtStableUSD: p.debtStableUSD,
            collateralEnabled: p.collateralEnabled,
          })),
          userConfig: {
            selectedMode: subAccount.userConfig.selectedMode,
            id: subAccount.userConfig.id,
            isWhitelisted: subAccount.userConfig.isWhitelisted,
          },
        }

        const analysisRes = await fetchEModeAnalysis({ lender, chain: chainId, body })
        if (cancelled) return

        if (analysisRes.success && analysisRes.data) {
          setAnalysis(analysisRes.data)
        } else {
          // Non-fatal: just show categories without analysis
          console.warn('E-mode analysis failed:', analysisRes.error)
        }
      }

      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [lender, chainId, subAccount, hasPositions])

  // Build a lookup from analysis results
  const analysisMap = new Map<number, EModeAnalysisEntry>()
  if (analysis) {
    for (const entry of analysis) {
      analysisMap.set(entry.modeId, entry)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" onClick={onClose}>
      {/* backdrop */}
      <div className="absolute inset-0 bg-base-300/40 backdrop-blur-sm" />

      {/* modal */}
      <div
        className="relative z-50 bg-base-100 rounded-box shadow-lg w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-base-300">
          <h3 className="font-semibold text-sm">E-Mode Options</h3>
          <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-4 space-y-3">
          {/* Current mode */}
          <div className="text-xs text-base-content/60">
            Current mode:{' '}
            <span className="font-semibold text-base-content">
              {currentMode === 0
                ? 'Default (No E-Mode)'
                : categories.find((c) => c.id === currentMode)?.label ?? `Mode #${currentMode}`}
            </span>
          </div>

          {loading && (
            <div className="flex justify-center py-8">
              <span className="loading loading-spinner loading-md" />
            </div>
          )}

          {error && (
            <div className="alert alert-error text-xs">
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && categories.length <= 1 && (
            <div className="text-sm text-base-content/60 text-center py-4">
              No additional e-mode categories available for this lender.
            </div>
          )}

          {!loading && !error && categories.length > 1 && (
            <div className="space-y-2">
              {categories.map((cat) => {
                const isCurrent = cat.id === currentMode
                const entry = analysisMap.get(cat.id)

                return (
                  <div
                    key={cat.id}
                    className={`rounded-lg border p-3 space-y-2 ${
                      isCurrent
                        ? 'border-primary bg-primary/5'
                        : entry && !entry.canSwitch
                          ? 'border-base-300 opacity-60'
                          : 'border-base-300'
                    }`}
                  >
                    {/* Mode header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{cat.label}</span>
                        {isCurrent && (
                          <span className="badge badge-primary badge-xs">Current</span>
                        )}
                        {entry && !isCurrent && (
                          entry.canSwitch ? (
                            <span className="badge badge-success badge-xs">Safe</span>
                          ) : (
                            <span className="badge badge-error badge-xs">Blocked</span>
                          )
                        )}
                      </div>
                      {cat.id === 0 && (
                        <span className="text-[10px] text-base-content/50">Default</span>
                      )}
                    </div>

                    {/* Analysis data — always show health factor when available */}
                    {entry && (
                      <div className="space-y-1.5">
                        {/* Health factor */}
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-base-content/60">Hypothetical Health:</span>
                          {entry.healthFactor != null ? (
                            <span
                              className={`badge badge-xs font-semibold ${
                                entry.healthFactor < 1
                                  ? 'badge-error'
                                  : entry.healthFactor < 1.1
                                    ? 'badge-error'
                                    : entry.healthFactor < 1.3
                                      ? 'badge-warning'
                                      : 'badge-success'
                              }`}
                            >
                              {entry.healthFactor.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-base-content/40">n/a (no debt)</span>
                          )}
                          {entry.healthFactor != null && entry.healthFactor < 1 && (
                            <span className="text-error text-[10px]">Would be liquidatable</span>
                          )}
                        </div>

                        {/* Supported assets */}
                        {entry.supportedAssets.length > 0 && (
                          <div className="text-xs">
                            <span className="text-base-content/60">Supported Assets:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {entry.supportedAssets.map((uid) => (
                                <span
                                  key={uid}
                                  className="badge badge-outline badge-xs"
                                  title={uid}
                                >
                                  {uid.length > 20 ? `${uid.slice(0, 16)}...` : uid}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* No analysis hint */}
                    {!entry && hasPositions && !loading && analysis !== null && (
                      <div className="text-[10px] text-base-content/40">
                        No analysis data for this mode.
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {!loading && !hasPositions && categories.length > 1 && (
            <div className="text-xs text-base-content/50 text-center">
              Deposit assets to see switching analysis.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
