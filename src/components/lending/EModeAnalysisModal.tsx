import React, { useEffect, useMemo, useState } from 'react'
import type { UserSubAccount } from '../../hooks/lending/useUserData'
import { usePoolConfigData } from '../../hooks/lending/usePoolData'
import { useSendLendingTransaction } from '../../hooks/useSendLendingTransaction'
import {
  fetchEModeList,
  fetchEModeAnalysis,
  fetchEModeSwitch,
  type EModeCategory,
  type EModeAnalysisEntry,
} from '../../sdk/lending-helper/fetchEMode'

// ============================================================================
// Mode Button — shows current borrow mode, opens the analysis modal on click
// ============================================================================

interface EModeBadgeProps {
  subAccount: UserSubAccount
  lender: string
  chainId: string
  account?: string
}

export const EModeBadge: React.FC<EModeBadgeProps> = ({ subAccount, lender, chainId, account }) => {
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
        title="Borrow mode — defines collateral and debt parameters"
      >
        <span className="text-[9px] font-bold uppercase">Mode</span>
        <span className="text-[10px]">{mode === 0 ? 'Off' : `#${mode}`}</span>
      </button>

      {open && (
        <EModeAnalysisModal
          subAccount={subAccount}
          lender={lender}
          chainId={chainId}
          account={account}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

// ============================================================================
// Mode Analysis Modal
// ============================================================================

interface EModeAnalysisModalProps {
  subAccount: UserSubAccount
  lender: string
  chainId: string
  account?: string
  onClose: () => void
}

const EModeAnalysisModal: React.FC<EModeAnalysisModalProps> = ({
  subAccount,
  lender,
  chainId,
  account,
  onClose,
}) => {
  const { send } = useSendLendingTransaction({ chainId, account })

  const [categories, setCategories] = useState<EModeCategory[]>([])
  const [analysis, setAnalysis] = useState<EModeAnalysisEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [switchingMode, setSwitchingMode] = useState<number | null>(null)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [switchSuccess, setSwitchSuccess] = useState<number | null>(null)

  // Pool config data — already cached by react-query, used as fallback source for e-mode categories
  const { data: configGroups } = usePoolConfigData(chainId, lender)

  // Derive e-mode categories from pool config groups (no extra API call needed)
  const derivedCategories = useMemo(() => {
    if (!configGroups || configGroups.length === 0) return []
    const seen = new Map<number, string>()
    for (const g of configGroups) {
      const cat = Number(g.category)
      if (!seen.has(cat)) seen.set(cat, g.label)
    }
    return Array.from(seen, ([id, label]) => ({ id, label }))
  }, [configGroups])

  const currentMode = subAccount.userConfig.selectedMode
  const hasPositions = subAccount.positions.some(
    (p) => p.depositsUSD > 0 || p.debtUSD > 0
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      // 1. Try fetching e-mode categories from API
      let cats: EModeCategory[] = []
      const listRes = await fetchEModeList({ lender, chain: chainId })
      if (cancelled) return

      if (listRes.success && listRes.data) {
        const entry = listRes.data.find(
          (e) => e.lender === lender && e.chainId === chainId
        )
        cats = entry?.categories ?? []
      }

      // 2. Fall back to categories derived from pool config data
      if (cats.length === 0 && derivedCategories.length > 0) {
        cats = derivedCategories
      }

      setCategories(cats)

      // If only one mode (or none), no analysis needed
      if (cats.length <= 1) {
        setLoading(false)
        return
      }

      // 3. If the user has positions, run the analysis
      if (hasPositions && account) {
        const analysisRes = await fetchEModeAnalysis({
          lender,
          chain: chainId,
          operator: account,
          accountId: subAccount.accountId,
        })
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
  }, [lender, chainId, subAccount, hasPositions, derivedCategories])

  // Build a lookup from analysis results
  const analysisMap = new Map<number, EModeAnalysisEntry>()
  if (analysis) {
    for (const entry of analysis) {
      analysisMap.set(entry.modeId, entry)
    }
  }

  // Determine if a mode is eligible for switching
  const canSwitchTo = (catId: number): boolean => {
    if (catId === currentMode) return false
    if (!account) return false
    // If there's no analysis (no positions), any non-current mode is switchable
    if (!hasPositions) return true
    const entry = analysisMap.get(catId)
    // If analysis is available, respect canSwitch flag
    if (entry) return entry.canSwitch
    // No analysis entry for this mode — allow if user has no positions
    return !hasPositions
  }

  const handleSwitch = async (targetMode: number) => {
    if (!account) return

    setSwitchingMode(targetMode)
    setSwitchError(null)
    setSwitchSuccess(null)

    const res = await fetchEModeSwitch({ chainId, lender, eMode: targetMode })

    if (!res.success || !res.data) {
      setSwitchError(res.error ?? 'Failed to build mode switch transaction')
      setSwitchingMode(null)
      return
    }

    const { ok, error: txError } = await send(res.data)
    if (ok) {
      setSwitchSuccess(targetMode)
    } else {
      setSwitchError(txError ?? 'Transaction failed')
    }
    setSwitchingMode(null)
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
          <h3 className="font-semibold text-sm" title="Borrow mode — defines collateral and debt parameters">Mode Options</h3>
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
                ? 'Default'
                : categories.find((c) => c.id === currentMode)?.label ?? `Mode #${currentMode}`}
            </span>
          </div>

          {/* Switch success banner */}
          {switchSuccess != null && (
            <div className="alert alert-success text-xs py-2">
              <span>
                Switched to{' '}
                <span className="font-semibold">
                  {categories.find((c) => c.id === switchSuccess)?.label ?? `Mode #${switchSuccess}`}
                </span>
                . Positions are refreshing...
              </span>
            </div>
          )}

          {/* Switch error banner */}
          {switchError && (
            <div className="alert alert-error text-xs py-2">
              <span>{switchError}</span>
            </div>
          )}

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
              No additional borrow modes available for this lender.
            </div>
          )}

          {!loading && !error && categories.length > 1 && (
            <div className="space-y-2">
              {categories.map((cat) => {
                const isCurrent = cat.id === currentMode
                const entry = analysisMap.get(cat.id)
                const eligible = canSwitchTo(cat.id)
                const isSwitching = switchingMode === cat.id

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
                      <div className="flex items-center gap-2">
                        {cat.id === 0 && (
                          <span className="text-[10px] text-base-content/50">Default</span>
                        )}
                        {!isCurrent && eligible && (
                          <button
                            type="button"
                            className="btn btn-xs btn-primary"
                            disabled={isSwitching || switchingMode != null}
                            onClick={() => handleSwitch(cat.id)}
                          >
                            {isSwitching ? (
                              <span className="loading loading-spinner loading-xs" />
                            ) : (
                              'Switch'
                            )}
                          </button>
                        )}
                      </div>
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
