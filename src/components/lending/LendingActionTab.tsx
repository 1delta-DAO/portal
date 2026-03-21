import { useMemo, useState } from 'react'
import { parseUnits } from 'viem'
import { useAccount } from 'wagmi'
import type { RawCurrency } from '../../types/currency'
import { LenderData, PoolDataItem } from '../../hooks/lending/usePoolData'
import { sortLenderKeysByTvl } from '../../utils/format'
import {
  fetchLendingAction,
  type LendingActionResponse,
} from '../../sdk/lending-helper/fetchLendingAction'
import { useSendLendingTransaction } from '../../hooks/useSendLendingTransaction'

type ActionType = 'Deposit' | 'Withdraw' | 'Borrow' | 'Repay'

interface Props {
  lenderData: LenderData
  actionType: ActionType
  chainId: string
}

const renderCurrency = (asset: RawCurrency) => {
  const symbol = asset?.symbol ?? (asset as any)?.ticker ?? ''
  const name = asset?.name ?? (asset as any)?.label ?? symbol

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="bg-base-300 rounded-full w-7 h-7 flex items-center justify-center overflow-hidden">
        {asset.logoURI && <img src={asset.logoURI} width={20} height={20} alt={symbol} />}
      </div>
      <div className="flex flex-col truncate">
        <span className="font-medium leading-tight truncate">{symbol || name}</span>
        {name && symbol && name !== symbol && (
          <span className="text-xs text-base-content/60 truncate">{name}</span>
        )}
      </div>
    </div>
  )
}

export const LendingActionTab = ({ lenderData, actionType, chainId }: Props) => {
  const { address: account } = useAccount()
  const { send, sending: txSending } = useSendLendingTransaction({ chainId, account })

  const lenders = useMemo(() => sortLenderKeysByTvl(lenderData), [lenderData])

  const [selectedLender, setSelectedLender] = useState<string>(lenders[0] ?? '')

  const poolList = useMemo(() => {
    if (!selectedLender) return []
    return lenderData[selectedLender] ?? []
  }, [lenderData, selectedLender])

  const [selectedPool, setSelectedPool] = useState<PoolDataItem | null>(null)
  const [amount, setAmount] = useState('')
  const [isAll, setIsAll] = useState(false)

  // Lender search/dropdown state
  const [lenderSearch, setLenderSearch] = useState('')
  const [isLenderOpen, setIsLenderOpen] = useState(false)

  const filteredLenders = useMemo(() => {
    const q = lenderSearch.trim().toLowerCase()
    if (!q) return lenders
    return lenders.filter((lender) => {
      const label = String(lender).toLowerCase()
      return lender.toLowerCase().includes(q) || label.includes(q)
    })
  }, [lenders, lenderSearch])

  const selectLender = (lender: string) => {
    setSelectedLender(lender)
    setSelectedPool(null)
    setAmount('')
    setLenderSearch(String(lender))
    setIsLenderOpen(false)
  }

  const handlePoolChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedPool(poolList.find(p => p.marketUid === e.target.value) ?? null)
  }

  // Transaction state
  const [result, setResult] = useState<LendingActionResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAction = async () => {
    if (!account || !selectedPool) return

    setLoading(true)
    setError(null)
    setResult(null)

    const decimals = selectedPool.asset.decimals ?? 18
    const parsedAmount = parseUnits(amount || '0', decimals)

    const response = await fetchLendingAction({
      marketUid: selectedPool.marketUid,
      operator: account,
      amount: parsedAmount.toString(),
      actionType,
      receiver: account,
      isAll: isAll || undefined,
    })

    setLoading(false)

    if (!response.success) {
      setError(response.error ?? 'Failed to fetch transaction data')
      return
    }

    setResult(response.data ?? null)
  }

  const execute = async () => {
    if (!result) return

    setExecuting(true)
    setError(null)

    try {
      for (const perm of result.permissions) {
        const permResult = await send(perm)
        if (!permResult.ok) {
          setError(permResult.error ?? 'Permission transaction failed')
          return
        }
      }

      for (const tx of result.transactions) {
        const { ok, error: txError } = await send(tx)
        if (!ok) {
          setError(txError ?? 'Transaction failed')
          return
        }
      }
    } finally {
      setExecuting(false)
    }
  }

  const showIsAll = actionType === 'Withdraw' || actionType === 'Repay'

  return (
    <div className="w-full max-w-md space-y-4">
      {/* Lender selector */}
      <div className="relative">
        <input
          type="text"
          className="input input-bordered w-full"
          placeholder="Select lender..."
          value={
            isLenderOpen
              ? lenderSearch
              : selectedLender
                ? String(selectedLender)
                : ''
          }
          onFocus={() => {
            setIsLenderOpen(true)
            setLenderSearch('')
          }}
          onChange={(e) => {
            setLenderSearch(e.target.value)
            setIsLenderOpen(true)
          }}
          onBlur={() => {
            setTimeout(() => setIsLenderOpen(false), 100)
          }}
        />

        {isLenderOpen && (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-base-300 bg-base-100 shadow">
            {filteredLenders.length === 0 && (
              <div className="px-3 py-2 text-sm text-base-content/60">No lenders found</div>
            )}
            {filteredLenders.map((lender) => {
              const label = String(lender)
              const selected = lender === selectedLender
              return (
                <button
                  key={lender}
                  type="button"
                  onMouseDown={() => selectLender(lender)}
                  className={`flex w-full items-center px-3 py-2 text-left text-sm hover:bg-base-200 ${
                    selected ? 'bg-base-200 font-medium' : ''
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Asset selector + amount */}
      <div className="flex items-center gap-3">
        <select
          className="select select-bordered flex-1"
          onChange={handlePoolChange}
          value={selectedPool?.marketUid ?? ''}
          disabled={!selectedLender}
        >
          <option value="" disabled>
            Select asset
          </option>
          {poolList.map((pool) => (
            <option key={pool.marketUid} value={pool.marketUid}>
              {pool.name ?? pool.asset.symbol ?? pool.marketUid}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2 min-w-[220px]">
          {selectedPool && renderCurrency(selectedPool.asset)}
          <input
            type="text"
            inputMode="decimal"
            className="input input-bordered text-right w-32"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </div>

      {/* isAll toggle for withdraw/repay */}
      {showIsAll && (
        <label className="label cursor-pointer justify-start gap-3">
          <input
            type="checkbox"
            className="checkbox checkbox-primary"
            checked={isAll}
            onChange={(e) => setIsAll(e.target.checked)}
          />
          <span className="label-text">{actionType} full balance</span>
        </label>
      )}

      {error && <div className="text-error text-sm">{error}</div>}

      {/* Fetch button */}
      <button
        className="btn btn-primary w-full"
        disabled={loading || !selectedPool || !account}
        onClick={fetchAction}
      >
        {loading ? 'Fetching...' : `Get ${actionType} Transaction`}
      </button>

      {/* Permission + execute buttons */}
      {result && (
        <div className="space-y-2">
          <button className="btn btn-success w-full" disabled={executing} onClick={execute}>
            {executing ? 'Executing...' : `Execute ${actionType}`}
          </button>
        </div>
      )}
    </div>
  )
}
