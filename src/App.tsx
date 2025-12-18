import { useEffect } from 'react'
import { LenderTab } from './components/lending/LendingTab'
import { ThemeSwitcher } from './components/themeSwitcher'
import { WalletConnect } from './components/connect'
import { fetchLenderMetaFromDirAndInitialize } from '@1delta/margin-fetcher'
import { fetchLenderLabels } from '@1delta/lib-utils'

export default function App() {

  useEffect(() => {
    fetchLenderLabels()
    fetchLenderMetaFromDirAndInitialize()
  }, [])

  return (
    <div className="min-h-screen bg-base-200 text-base-content">
      <div className="navbar bg-base-100 shadow-lg">
        <div className="flex flex-row p-2 grow">
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              {/* Use theme primary instead of fixed gradient */}
              <h1 className="text-3xl font-bold text-primary">Allocator</h1>
            </div>
          </div>
          <div className="flex-none flex gap-3 items-center">
            <div className="flex-none flex gap-3 items-center">
              <ThemeSwitcher />
            </div>
            <div className="flex-none flex gap-3 items-center">
              <WalletConnect />
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="space-y-4 flex flex-col items-center">

          <div className="w-full min-w-[300px]">
            {/* use theme base classes instead of fixed hex */}
            <div className="card bg-base-100 shadow-xl rounded-2xl">
              <div className="card-body p-4 sm:p-6">
                 <LenderTab />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
