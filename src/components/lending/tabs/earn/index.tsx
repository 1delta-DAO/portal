import { useMemo, useState } from 'react'
import { UserLenderPositionsTable } from './UserPositionsTable'
import { UserAssetsTable } from './UserAssetsTable'
import { LendingPoolsTable } from './MarketsView'
import { VaultsView } from './vaults'
import type { ChainTokenBalance } from '../../../../hooks/lending/useLendingBalances'
import type { LenderInfoMap } from '../../../../hooks/lending/usePoolData'
import type { UserDataResult } from '../../../../hooks/lending/useUserData'
import type { RawCurrency } from '../../../../types/currency'

type EarnMode = 'lending' | 'vaults'

interface EarnTabProps {
  account?: string
  /** Chains being browsed. Earn is multi-chain; the first entry is the primary. */
  chainIds: string[]
  /** Token metadata keyed by chain, since rows can come from any of them. */
  tokensByChain?: Record<string, Record<string, RawCurrency>>
  userData?: UserDataResult
  lenderInfoMap?: LenderInfoMap
  lendingBalances: ChainTokenBalance[]
  isLendingBalancesLoading: boolean
  lendingBalancesError: any
  /** Chains whose balance fetch failed — surfaced as a partial-result note. */
  balanceFailedChains?: string[]
  isLoading: boolean
  userDataError: any
  refetchUserData: () => void
}

export function EarnTab({
  account,
  chainIds,
  tokensByChain,
  userData,
  lenderInfoMap,
  lendingBalances,
  isLendingBalancesLoading,
  lendingBalancesError,
  balanceFailedChains,
  isLoading,
  userDataError,
  refetchUserData,
}: EarnTabProps) {
  // Top-level Pure Lending / Vaults switcher. Deliberately *not* persisted —
  // Lending is the canonical Earn experience, so every visit lands there by
  // default. Users opt into Vaults explicitly per session.
  const [mode, setMode] = useState<EarnMode>('lending')

  const [earnSubTab, setEarnSubTab] = useState<'assets' | 'positions'>('assets')
  const [filterOwned, setFilterOwned] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null)

  const externalAssetFilter = useMemo(() => {
    if (selectedAsset) return selectedAsset
    if (!filterOwned || lendingBalances.length === 0) return ''
    // Addresses only — the same token address can exist on several chains and
    // the markets table matches on address, so a cross-chain owned-set is a
    // superset filter rather than a per-chain one.
    return Array.from(new Set(lendingBalances.map((b) => b.address.toLowerCase()))).join(',')
  }, [selectedAsset, filterOwned, lendingBalances])

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Pure Lending / Vaults switcher — always visible so users can find
          vaults whether or not they're connected. */}
      <div className="flex items-center gap-1 bg-base-200 rounded-lg p-1 w-fit">
        <button
          type="button"
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            mode === 'lending'
              ? 'bg-base-100 shadow-sm text-base-content'
              : 'text-base-content/60 hover:text-base-content'
          }`}
          onClick={() => setMode('lending')}
        >
          Pure Lending
        </button>
        <button
          type="button"
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            mode === 'vaults'
              ? 'bg-base-100 shadow-sm text-base-content'
              : 'text-base-content/60 hover:text-base-content'
          }`}
          onClick={() => setMode('vaults')}
        >
          Vaults
        </button>
      </div>

      {mode === 'lending' ? (
        <>
          {account && (
            <section className="space-y-3">
              <div className="flex items-center gap-1 bg-base-200 rounded-lg p-1 w-fit">
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    earnSubTab === 'assets'
                      ? 'bg-base-100 shadow-sm text-base-content'
                      : 'text-base-content/60 hover:text-base-content'
                  }`}
                  onClick={() => setEarnSubTab('assets')}
                >
                  Your Assets
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    earnSubTab === 'positions'
                      ? 'bg-base-100 shadow-sm text-base-content'
                      : 'text-base-content/60 hover:text-base-content'
                  }`}
                  onClick={() => setEarnSubTab('positions')}
                >
                  Your Lending Positions
                </button>
              </div>

              {earnSubTab === 'assets' && (
                <UserAssetsTable
                  balances={lendingBalances}
                  isLoading={isLendingBalancesLoading}
                  error={lendingBalancesError}
                  failedChains={balanceFailedChains}
                  tokensByChain={tokensByChain ?? {}}
                  showChain
                  filterOwned={filterOwned}
                  onFilterOwnedChange={setFilterOwned}
                  selectedAsset={selectedAsset}
                  onAssetClick={(address) => {
                    const addr = address.toLowerCase()
                    setSelectedAsset((prev) => (prev === addr ? null : addr))
                  }}
                />
              )}

              {earnSubTab === 'positions' && (
                <UserLenderPositionsTable
                  account={account}
                  chainIds={chainIds}
                  userData={userData}
                  lenderInfoMap={lenderInfoMap}
                  isLoading={isLoading}
                  error={userDataError}
                  refetch={refetchUserData}
                />
              )}
            </section>
          )}
          <LendingPoolsTable
            chainIds={chainIds}
            account={account}
            externalAssetFilter={externalAssetFilter}
            userData={userData}
          />
        </>
      ) : (
        // Vaults remain single-chain — the vault catalog, validators and
        // withdrawal queues are all per-chain reads with no CSV form.
        <VaultsView chainId={chainIds[0]} account={account} />
      )}
    </div>
  )
}
