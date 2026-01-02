import {
  lenderDisplayNameFull,
  LendingMode,
  RawCurrency,
} from '@1delta/lib-utils'
import { LenderData, PoolData } from '@1delta/margin-fetcher'
import { useMemo, useState } from 'react'
import { parseUnits } from 'viem'
import { ExecuteSwapButton } from './Execute'

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

interface Props {
  lenderData: LenderData
  chainId: string
}

export const Swap = ({ lenderData, chainId }: Props) => {
  const [swapType, setSwapType] = useState<'debt' | 'collateral'>('debt')

  const lenders = useMemo(() => {
    return Object.keys(lenderData?.[chainId]?.data ?? {})
  }, [lenderData, chainId])

  const [selectedLender, setSelectedLender] = useState<string | ''>(lenders[0] ?? '')

  const pools = useMemo(() => {
    if (!selectedLender) return {}
    return lenderData[chainId]?.data?.[selectedLender]?.data ?? {}
  }, [lenderData, chainId, selectedLender])

  const poolList = useMemo(() => Object.values(pools), [pools])

  const [assetInPool, setAssetInPool] = useState<PoolData | null>(null)
  const [assetOutPool, setAssetOutPool] = useState<PoolData | null>(null)
  const [amount, setAmount] = useState<string>('')
  const [slippage, setSlippage] = useState<string>('0.3')
  const [irModeIn, setIrModeIn] = useState<LendingMode>(LendingMode.VARIABLE)
  const [irModeOut, setIrModeOut] = useState<LendingMode>(LendingMode.VARIABLE)
  const [tradeType, setTradeType] = useState<number>(0)
  const [usePendleMintRedeem, setUsePendleMintRedeem] = useState<boolean>(false)
  const [isMax, setIsMax] = useState<boolean>(false)

  const handleLenderChange = (lender: string) => {
    setSelectedLender(lender)
    setAssetInPool(null)
    setAssetOutPool(null)
    setAmount('')
  }

  const [lenderSearch, setLenderSearch] = useState('')
  const [isLenderOpen, setIsLenderOpen] = useState(false)

  const filteredLenders = useMemo(() => {
    const q = lenderSearch.trim().toLowerCase()
    if (!q) return lenders

    return lenders.filter((lender) => {
      const label = lenderDisplayNameFull(lender).toLowerCase()
      return lender.toLowerCase().includes(q) || label.includes(q)
    })
  }, [lenders, lenderSearch])

  const selectLender = (lender: string) => {
    handleLenderChange(lender)
    setLenderSearch(lenderDisplayNameFull(lender))
    setIsLenderOpen(false)
  }

  const handleSwapTypeChange = (type: 'debt' | 'collateral') => {
    setSwapType(type)
    setAssetInPool(null)
    setAssetOutPool(null)
    setAmount('')
    if (type === 'debt') {
      setIrModeIn(LendingMode.VARIABLE)
      setIrModeOut(LendingMode.VARIABLE)
    } else {
      setIrModeIn(LendingMode.NONE)
      setIrModeOut(LendingMode.NONE)
    }
  }

  const handlePoolChange = (side: 'in' | 'out') => (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pool = pools[e.target.value]

    if (side === 'in') setAssetInPool(pool)
    else setAssetOutPool(pool)
  }

  const getParams = () => {
    const baseParams: Record<string, string | number | boolean | bigint> = {
      chainId,
      lender: selectedLender,
      amount: parseUnits(amount || '0', assetInPool?.asset?.decimals || 18),
      slippage: parseFloat(slippage) || 0.3,
      irModeIn: irModeIn,
      irModeOut: irModeOut,
      tradeType,
      usePendleMintRedeem,
    }

    if (swapType === 'debt') {
      return {
        ...baseParams,
        debtAssetIn: assetInPool?.asset.address!,
        debtAssetOut: assetOutPool?.asset.address!,
        isMaxOut: isMax,
      }
    } else {
      return {
        ...baseParams,
        collateralAssetIn: assetInPool?.asset.address!,
        collateralAssetOut: assetOutPool?.asset.address!,
        isMaxIn: isMax,
      }
    }
  }

  return (
    <div className="w-full max-w-md space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          className={`btn flex-1 ${swapType === 'debt' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => handleSwapTypeChange('debt')}
        >
          Debt Swap
        </button>
        <button
          type="button"
          className={`btn flex-1 ${swapType === 'collateral' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => handleSwapTypeChange('collateral')}
        >
          Collateral Swap
        </button>
      </div>

      <div className="relative">
        <input
          type="text"
          className="input input-bordered w-full"
          placeholder="Select lender…"
          value={
            isLenderOpen
              ? lenderSearch
              : selectedLender
                ? lenderDisplayNameFull(selectedLender)
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
              const label = lenderDisplayNameFull(lender)
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

      <div className="flex items-center gap-3">
        <select
          className="select select-bordered flex-1"
          onChange={handlePoolChange('in')}
          value={assetInPool?.poolId ?? ''}
          disabled={!selectedLender}
        >
          <option value="" disabled>
            {swapType === 'debt' ? 'Debt Asset In' : 'Collateral Asset In'}
          </option>
          {poolList.map((pool) => (
            <option key={pool.poolId} value={pool.poolId}>
              {pool.asset.symbol ?? pool.poolId}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2 min-w-[220px]">
          {assetInPool && renderCurrency(assetInPool.asset)}
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

      <div className="flex items-center gap-3">
        <select
          className="select select-bordered flex-1"
          onChange={handlePoolChange('out')}
          value={assetOutPool?.poolId ?? ''}
          disabled={!selectedLender}
        >
          <option value="" disabled>
            {swapType === 'debt' ? 'Debt Asset Out' : 'Collateral Asset Out'}
          </option>
          {poolList.map((pool) => (
            <option key={pool.poolId} value={pool.poolId}>
              {pool.asset.symbol ?? pool.poolId}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2 min-w-[220px]">
          {assetOutPool && renderCurrency(assetOutPool.asset)}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="label min-w-[120px]">
          <span className="label-text">Slippage %</span>
        </label>
        <input
          type="text"
          inputMode="decimal"
          className="input input-bordered flex-1"
          placeholder="0.3"
          value={slippage}
          onChange={(e) => setSlippage(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-3">
        <label className="label min-w-[120px]">
          <span className="label-text">IR Mode In</span>
        </label>
        <select
          className="select select-bordered flex-1"
          value={irModeIn}
          onChange={(e) => setIrModeIn(Number(e.target.value) as LendingMode)}
        >
          <option value={LendingMode.NONE}>NONE</option>
          <option value={LendingMode.STABLE}>STABLE</option>
          <option value={LendingMode.VARIABLE}>VARIABLE</option>
        </select>
      </div>

      <div className="flex items-center gap-3">
        <label className="label min-w-[120px]">
          <span className="label-text">IR Mode Out</span>
        </label>
        <select
          className="select select-bordered flex-1"
          value={irModeOut}
          onChange={(e) => setIrModeOut(Number(e.target.value) as LendingMode)}
        >
          <option value={LendingMode.NONE}>NONE</option>
          <option value={LendingMode.STABLE}>STABLE</option>
          <option value={LendingMode.VARIABLE}>VARIABLE</option>
        </select>
      </div>

      <div className="flex items-center gap-3">
        <label className="label min-w-[120px]">
          <span className="label-text">Trade Type</span>
        </label>
        <select
          className="select select-bordered flex-1"
          value={tradeType}
          onChange={(e) => setTradeType(Number(e.target.value))}
        >
          <option value={0}>EXACT_INPUT</option>
          <option value={1}>EXACT_OUTPUT</option>
        </select>
      </div>

      <div className="flex items-center gap-3">
        <label className="label cursor-pointer min-w-[120px]">
          <span className="label-text">Use Pendle</span>
          <input
            type="checkbox"
            className="checkbox checkbox-primary"
            checked={usePendleMintRedeem}
            onChange={(e) => setUsePendleMintRedeem(e.target.checked)}
          />
        </label>
        <label className="label cursor-pointer flex-1">
          <span className="label-text">{swapType === 'debt' ? 'Max Out' : 'Max In'}</span>
          <input
            type="checkbox"
            className="checkbox checkbox-primary"
            checked={isMax}
            onChange={(e) => setIsMax(e.target.checked)}
          />
        </label>
      </div>

      <ExecuteSwapButton params={getParams()} swapType={swapType} />
    </div>
  )
}

