import { Routes, Route, Navigate } from 'react-router-dom'
import { LenderTab } from './components/lending/LendingTab'
import { ThemeSwitcher } from './components/themeSwitcher'
import { WalletConnect } from './components/connect'
import { PortalLogo } from './components/PortalLogo'
import { IrmDockProvider } from './components/lending/shared/IrmDock'
import { ErrorBoundary } from './components/common/ErrorBoundary'

export default function App() {
  return (
    <IrmDockProvider>
      <div className="min-h-screen bg-base-200 text-base-content overflow-x-hidden">
        <div className="navbar min-h-14 sm:min-h-16 bg-base-100 shadow-lg fixed top-0 left-0 right-0 z-50 px-3 sm:px-6 lg:px-8">
          <div className="flex-1 min-w-0 gap">
            <h1 className="text-xl sm:text-3xl inline-flex items-center gap-0">
              <span className="text-primary">P</span>
              <PortalLogo className="w-[1.35em] h-[1.35em]" />
              <span className="text-primary">RTAL</span>
            </h1>
          </div>
          <div className="flex gap-2 items-center">
            <ThemeSwitcher />
            <WalletConnect />
          </div>
        </div>

        <main className="max-w-7xl mx-auto pt-16 sm:pt-24 pb-4 sm:pb-8 px-0 sm:px-6 lg:px-8">
          <div className="space-y-4 flex flex-col items-center">
            <div className="w-full">
              {/* On mobile the card goes edge-to-edge: no rounded corners,
                  no shadow, no horizontal margin — every pixel of width
                  is reclaimed for the data. Desktop keeps the framed look. */}
              <div className="card bg-base-100 sm:shadow-xl rounded-none sm:rounded-2xl">
                <div className="card-body p-3 sm:p-6">
                  <ErrorBoundary>
                    <Routes>
                      <Route path="/:tab?/:chainId?/:lender?" element={<LenderTab />} />
                      <Route path="*" element={<Navigate to="/earn" replace />} />
                    </Routes>
                  </ErrorBoundary>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </IrmDockProvider>
  )
}
