import { useMemo, useState } from 'react'
import { UserLenderPositionsTable } from './UserPositionsTable'
import { UserAssetsTable } from './UserAssetsTable'
import { LendingPoolsTable } from './MarketsView'
import type { TokenBalance } from '../../../../hooks/lending/useTokenBalances'
import type { LenderInfoMap } from '../../../../hooks/lending/usePoolData'
import type { UserDataResult } from '../../../../hooks/lending/useUserData'
import type { RawCurrency } from '../../../../types/currency'

interface EarnTabProps {
  account?: string
  chainId: string
  tokens?: Record<string, RawCurrency>
  userData?: UserDataResult
  lenderInfoMap?: LenderInfoMap
  lendingBalances: TokenBalance[]
  isLendingBalancesLoading: boolean
  lendingBalancesError: any
  isLoading: boolean
  userDataError: any
  refetchUserData: () => void
}

export function EarnTab({
  account,
  chainId,
  tokens,
  userData,
  lenderInfoMap,
  lendingBalances,
  isLendingBalancesLoading,
  lendingBalancesError,
  isLoading,
  userDataError,
  refetchUserData,
}: EarnTabProps) {
  const [earnSubTab, setEarnSubTab] = useState<'assets' | 'positions'>('assets')
  const [filterOwned, setFilterOwned] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null)

  const externalAssetFilter = useMemo(() => {
    if (selectedAsset) return selectedAsset
    if (!filterOwned || lendingBalances.length === 0) return ''
    return lendingBalances.map((b) => b.address.toLowerCase()).join(',')
  }, [selectedAsset, filterOwned, lendingBalances])

  return (
    <div className="space-y-3 sm:space-y-4">
      {account && (
        <div className="space-y-3">
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
              tokens={tokens ?? {}}
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
              chainId={chainId}
              userData={userData}
              lenderInfoMap={lenderInfoMap}
              isLoading={isLoading}
              error={userDataError}
              refetch={refetchUserData}
            />
          )}
        </div>
      )}
      <LendingPoolsTable
        chainId={chainId}
        account={account}
        externalAssetFilter={externalAssetFilter}
        userData={userData}
      />
    </div>
  )
}
