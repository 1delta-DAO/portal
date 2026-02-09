import {
  lenderDisplayNameFull,
  LendingMode,
  RawCurrency,
} from '@1delta/lib-utils'
import { LenderData, PoolDataItem } from '../../../hooks/lending/usePoolData'
import { useMemo, useState } from 'react'
import { parseUnits } from 'viem'
import { ExecuteCloseButton } from './Execute'

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

export const Close = ({ lenderData, chainId }: Props) => {
  const lenders = useMemo(() => {
    return Object.keys(lenderData ?? {})
  }, [lenderData])

  const [selectedLender, setSelectedLender] = useState<string | ''>(lenders[0] ?? '')

  const poolList = useMemo(() => {
    if (!selectedLender) return []
    return lenderData[selectedLender] ?? []
  }, [lenderData, selectedLender])

  const [collateralPool, setCollateralPool] = useState<PoolDataItem | null>(null)
  const [debtPool, setDebtPool] = useState<PoolDataItem | null>(null)
  const [amount, setAmount] = useState<string>('')
  const [slippage, setSlippage] = useState<string>('0.3')
  const [irModeOut, setIrModeOut] = useState<LendingMode>(LendingMode.VARIABLE)
  const [tradeType, setTradeType] = useState<number>(0)
  const [usePendleMintRedeem, setUsePendleMintRedeem] = useState<boolean>(false)
  const [isMaxOut, setIsMaxOut] = useState<boolean>(false)

  const handleLenderChange = (lender: string) => {
    setSelectedLender(lender)
    setCollateralPool(null)
    setDebtPool(null)
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

  const handlePoolChange = (side: 'collateral' | 'debt') => (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pool = poolList.find(p => p.marketUid === e.target.value) ?? null

    if (side === 'collateral') setCollateralPool(pool)
    else setDebtPool(pool)
  }

  const getParams = () => {
    return {
      chainId,
      lender: selectedLender,
      collateralAssetIn: collateralPool?.asset.address!,
      debtAssetOut: debtPool?.asset.address!,
      amount: parseUnits(amount || '0', collateralPool?.asset?.decimals || 18),
      slippage: parseFloat(slippage) || 0.3,
      irModeOut,
      tradeType,
      usePendleMintRedeem,
      isMaxOut,
    }
  }

  return (
    <div className="w-full max-w-md space-y-4">
      {/* Lender selector */}
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

      {/* Collateral Asset In */}
      <div className="flex items-center gap-3">
        <select
          className="select select-bordered flex-1"
          onChange={handlePoolChange('collateral')}
          value={collateralPool?.marketUid ?? ''}
          disabled={!selectedLender}
        >
          <option value="" disabled>
            Collateral Asset
          </option>
          {poolList.map((pool) => (
            <option key={pool.marketUid} value={pool.marketUid}>
              {pool.asset.symbol ?? pool.marketUid}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2 min-w-[220px]">
          {collateralPool && renderCurrency(collateralPool.asset)}
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

      {/* Debt Asset Out */}
      <div className="flex items-center gap-3">
        <select
          className="select select-bordered flex-1"
          onChange={handlePoolChange('debt')}
          value={debtPool?.marketUid ?? ''}
          disabled={!selectedLender}
        >
          <option value="" disabled>
            Debt Asset
          </option>
          {poolList.map((pool) => (
            <option key={pool.marketUid} value={pool.marketUid}>
              {pool.asset.symbol ?? pool.marketUid}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2 min-w-[220px]">
          {debtPool && renderCurrency(debtPool.asset)}
        </div>
      </div>

      {/* Slippage */}
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

      {/* IR Mode Out */}
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

      {/* Trade Type */}
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

      {/* Options */}
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
          <span className="label-text">Max Out</span>
          <input
            type="checkbox"
            className="checkbox checkbox-primary"
            checked={isMaxOut}
            onChange={(e) => setIsMaxOut(e.target.checked)}
          />
        </label>
      </div>

      <ExecuteCloseButton params={getParams()} />
    </div>
  )
}
