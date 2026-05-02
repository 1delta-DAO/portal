import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useIrmData } from '../../../hooks/lending/useIrmData'
import { IrmCurveChart } from './IrmChart'
import { EmptyState } from '../../common/EmptyState'

// Resolved at render time from the active DaisyUI theme so legend swatches
// and stat numbers re-color on theme switch instead of staying neon.
const DEPOSIT_COLOR = 'var(--color-success)'
const BORROW_COLOR  = 'var(--color-warning)'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface IrmPanelEntry {
  marketUid: string
  marketName: string
  currentDepositRate?: number
  currentBorrowRate?: number
}

interface IrmDockContextType {
  open: (entry: IrmPanelEntry) => void
  close: (marketUid: string) => void
  panels: IrmPanelEntry[]
}

const IrmDockContext = createContext<IrmDockContextType>({
  open: () => {},
  close: () => {},
  panels: [],
})

export function useIrmDock() {
  return useContext(IrmDockContext)
}

// ---------------------------------------------------------------------------
// Individual docked panel
// ---------------------------------------------------------------------------

interface IrmDockedPanelProps extends IrmPanelEntry {
  onClose: () => void
  /** On mobile panels go full-width; on desktop they are fixed-width */
  fullWidth?: boolean
}

function IrmDockedPanel({
  marketUid, marketName,
  currentDepositRate, currentBorrowRate, onClose, fullWidth,
}: IrmDockedPanelProps) {
  const { data, isLoading, error } = useIrmData(marketUid)
  const lenderKey = data?.lenderKey ?? marketUid.split(':')[0] ?? marketUid
  const currentUtilization = data?.currentUtilization

  return (
    <div
      className={`bg-base-100 border border-base-300 rounded-2xl shadow-2xl flex flex-col ${
        fullWidth ? 'w-full' : 'w-90'
      }`}
    >
      {/* ── Header ── */}
      <div className="px-4 pt-3 pb-3 border-b border-base-300 shrink-0">
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="badge badge-sm font-bold tracking-wide text-[10px] bg-base-300 border-0"
              title={lenderKey}
            >
              {lenderKey.length > 18 ? `${lenderKey.slice(0, 18)}…` : lenderKey}
            </span>
            <span className="text-[10px] text-base-content/40 uppercase tracking-wider">IRM</span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-circle shrink-0 -mt-0.5 -mr-1"
            onClick={onClose}
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p className="font-semibold text-base leading-tight mb-3 truncate" title={marketName}>
          {marketName}
        </p>

        {/* Current rate stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-base-200 px-3 py-2">
            <p className="text-[10px] text-base-content/45 mb-1 leading-none">Deposit APR</p>
            <p className="text-lg font-bold leading-none tabular-nums" style={{ color: DEPOSIT_COLOR }}>
              {currentDepositRate !== undefined ? `${currentDepositRate.toFixed(2)}%` : '—'}
            </p>
          </div>
          <div className="rounded-xl bg-base-200 px-3 py-2">
            <p className="text-[10px] text-base-content/45 mb-1 leading-none">Borrow APR</p>
            <p className="text-lg font-bold leading-none tabular-nums" style={{ color: BORROW_COLOR }}>
              {currentBorrowRate !== undefined ? `${currentBorrowRate.toFixed(2)}%` : '—'}
            </p>
          </div>
          <div className="rounded-xl bg-base-200 px-3 py-2">
            <p className="text-[10px] text-base-content/45 mb-1 leading-none">Utilization</p>
            <p className="text-lg font-bold leading-none tabular-nums text-base-content/70">
              {currentUtilization !== undefined ? `${(currentUtilization * 100).toFixed(1)}%` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="p-3 flex-1">
        {isLoading && (
          <div className="flex items-center justify-center h-24 gap-2 text-base-content/40 text-sm">
            <span className="loading loading-spinner loading-sm" />
            Loading…
          </div>
        )}

        {error && (
          <EmptyState
            title="IRM data unavailable"
            description="No curve data returned for this market"
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-full h-full"
                fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            }
          />
        )}

        {!isLoading && !error && data === null && (
          <EmptyState
            title="No data available"
            description="This market has no IRM curve"
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-full h-full"
                fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3l18 18M10.5 10.677A2 2 0 0113.5 12.5" />
                <path d="M17 17H3V7a4 4 0 011.173-2.826M7 7h10v6" />
              </svg>
            }
          />
        )}

        {data && (
          <>
            {/* Legend */}
            <div className="flex items-center gap-4 mb-2 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 rounded inline-block" style={{ background: DEPOSIT_COLOR }} />
                <span className="text-base-content/55">Deposit APR</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 rounded inline-block" style={{ background: BORROW_COLOR }} />
                <span className="text-base-content/55">Borrow APR</span>
              </span>
              {currentUtilization !== undefined && (
                <span className="flex items-center gap-1.5 ml-auto text-[10px] text-base-content/35">
                  <svg width="12" height="8" viewBox="0 0 12 8">
                    <line x1="0" y1="4" x2="12" y2="4" stroke="currentColor" strokeDasharray="3 2" strokeWidth="1.5" />
                  </svg>
                  current
                </span>
              )}
            </div>

            <IrmCurveChart points={data.points} currentUtilization={currentUtilization} />
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dock container
// ---------------------------------------------------------------------------

function IrmDockContainer({ panels, close }: { panels: IrmPanelEntry[]; close: (uid: string) => void }) {
  if (panels.length === 0) return null

  return createPortal(
    <>
      {/* Desktop: horizontal row anchored bottom-left */}
      <div className="hidden sm:flex fixed bottom-4 left-4 z-9990 flex-row items-end gap-3"
        style={{ maxWidth: 'calc(100vw - 2rem)' }}
      >
        {panels.map((p) => (
          <IrmDockedPanel key={p.marketUid} {...p} onClose={() => close(p.marketUid)} />
        ))}
      </div>

      {/* Mobile: vertical stack anchored bottom, full width */}
      <div className="flex sm:hidden fixed bottom-0 left-0 right-0 z-9990 flex-col gap-2 p-3 pb-safe"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        {panels.map((p) => (
          <IrmDockedPanel key={p.marketUid} {...p} onClose={() => close(p.marketUid)} fullWidth />
        ))}
      </div>
    </>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function IrmDockProvider({ children }: { children: ReactNode }) {
  const [panels, setPanels] = useState<IrmPanelEntry[]>([])

  const open = useCallback((entry: IrmPanelEntry) => {
    setPanels((prev) => {
      if (prev.some((p) => p.marketUid === entry.marketUid)) {
        // already open — bring to front
        return [...prev.filter((p) => p.marketUid !== entry.marketUid), entry]
      }
      return [...prev, entry]
    })
  }, [])

  const close = useCallback((marketUid: string) => {
    setPanels((prev) => prev.filter((p) => p.marketUid !== marketUid))
  }, [])

  return (
    <IrmDockContext.Provider value={{ open, close, panels }}>
      {children}
      <IrmDockContainer panels={panels} close={close} />
    </IrmDockContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Button used inside AssetPopover
// ---------------------------------------------------------------------------

interface IrmDetailsButtonProps {
  marketUid: string
  marketName: string
  currentDepositRate?: number
  currentBorrowRate?: number
}

export function IrmDetailsButton({
  marketUid, marketName, currentDepositRate, currentBorrowRate,
}: IrmDetailsButtonProps) {
  const { open, close, panels } = useIrmDock()
  const isOpen = panels.some((p) => p.marketUid === marketUid)

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (isOpen) {
        close(marketUid)
      } else {
        open({ marketUid, marketName, currentDepositRate, currentBorrowRate })
      }
    },
    [isOpen, open, close, marketUid, marketName, currentDepositRate, currentBorrowRate],
  )

  return (
    <button
      type="button"
      className={`inline-flex items-center gap-0.5 text-[10px] hover:underline transition-colors ${
        isOpen ? 'text-primary/50' : 'text-primary'
      }`}
      onClick={handleClick}
    >
      {isOpen ? 'Close IRM' : 'IRM'}
      {!isOpen && (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5 opacity-60"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      )}
    </button>
  )
}
