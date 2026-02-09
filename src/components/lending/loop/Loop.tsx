import {
  CurrencyHandler,
  isWNative,
  lenderDisplayNameFull,
  LendingMode,
  RawCurrency,
} from '@1delta/lib-utils'
import { LenderData, PoolDataItem } from '../../../hooks/lending/usePoolData'
import { useMemo, useState } from 'react'
import { useTokenLists } from '../../../hooks/useTokenLists'
import { parseUnits, zeroAddress } from 'viem'
import { ExecuteLoopButton } from './Execute'

/* ---------- Currency Renderer ---------- */

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

/* ---------- Component ---------- */

interface Props {
  lenderData: LenderData
  chainId: string
}

export const Loop = ({ lenderData, chainId }: Props) => {
  /* ---------- Lender selection ---------- */

  const { data } = useTokenLists()

  const lenders = useMemo(() => {
    return Object.keys(lenderData ?? {})
  }, [lenderData])

  const [selectedLender, setSelectedLender] = useState<string | ''>(lenders[0] ?? '')

  /* ---------- Pools ---------- */

  const poolList = useMemo(() => {
    if (!selectedLender) return []
    return lenderData[selectedLender] ?? []
  }, [lenderData, selectedLender])

  /* ---------- State keeps FULL PoolDataItem ---------- */

  const [fromPool, setFromPool] = useState<PoolDataItem | null>(null)
  const [toPool, setToPool] = useState<PoolDataItem | null>(null)

  const [fromAmount, setFromAmount] = useState<string>('')
  const [toAmount, setToAmount] = useState<string>('')

  /* ---------- Reset on lender change ---------- */

  const handleLenderChange = (lender: string) => {
    setSelectedLender(lender)
    setFromPool(null)
    setToPool(null)
    setFromAmount('')
    setToAmount('')
    setPayCurrency(null)
    setPayAmount('')
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

  /* ---------- Helpers ---------- */

  const [payCurrency, setPayCurrency] = useState<RawCurrency | null>(null)
  const payCurrencies = useMemo(() => {
    const assets: RawCurrency[] = []

    if (fromPool?.asset) assets.push(fromPool.asset)
    if (toPool?.asset && toPool.asset.address !== fromPool?.asset.address) {
      assets.push(toPool.asset)
    }

    const wnative = assets.find((asset) => isWNative(asset))
    const hasWrappedNative = Boolean(wnative)

    if (hasWrappedNative) {
      assets.unshift(data?.[chainId]?.[zeroAddress])
    }

    return assets
  }, [fromPool, toPool, data])

  const handlePoolChange = (side: 'from' | 'to') => (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pool = poolList.find(p => p.marketUid === e.target.value) ?? null

    if (side === 'from') setFromPool(pool)
    else setToPool(pool)

    setPayCurrency(null)
  }

  const [payAmount, setPayAmount] = useState<string>('')

  /* ---------- Render ---------- */

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
            // small delay so click registers
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

      {/* FROM */}
      <div className="flex items-center gap-3">
        <select
          className="select select-bordered flex-1"
          onChange={handlePoolChange('from')}
          value={fromPool?.marketUid ?? ''}
          disabled={!selectedLender}
        >
          <option value="" disabled>
            Select pool
          </option>
          {poolList.map((pool) => (
            <option key={pool.marketUid} value={pool.marketUid}>
              {pool.asset.symbol ?? pool.marketUid}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2 min-w-[220px]">
          {fromPool && renderCurrency(fromPool.asset)}
          <input
            type="text"
            inputMode="decimal"
            className="input input-bordered text-right w-32"
            placeholder="0.0"
            value={fromAmount}
            onChange={(e) => setFromAmount(e.target.value)}
          />
        </div>
      </div>

      {/* TO */}
      <div className="flex items-center gap-3">
        <select
          className="select select-bordered flex-1"
          onChange={handlePoolChange('to')}
          value={toPool?.marketUid ?? ''}
          disabled={!selectedLender}
        >
          <option value="" disabled>
            Select pool
          </option>
          {poolList.map((pool) => (
            <option key={pool.marketUid} value={pool.marketUid}>
              {pool.asset.symbol ?? pool.marketUid}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2 min-w-[220px]">
          {toPool && renderCurrency(toPool.asset)}
          {/* <input
            type="text"
            inputMode="decimal"
            className="input input-bordered text-right w-32"
            placeholder="0.0"
            value={toAmount}
            onChange={(e) => setToAmount(e.target.value)}
          /> */}
        </div>
      </div>

      {/* PAY CURRENCY */}
      <div className="flex items-center gap-3">
        <select
          className="select select-bordered flex-1"
          value={payCurrency?.address ?? ''}
          disabled={payCurrencies.length === 0}
          onChange={(e) => {
            const curr = payCurrencies.find((c) => c.address === e.target.value) ?? null
            setPayCurrency(curr)
            setPayAmount('')
          }}
        >
          <option value="" disabled>
            Pay with
          </option>
          {payCurrencies.map((currency) => (
            <option key={currency.address} value={currency.address}>
              {currency.symbol}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2 min-w-[220px]">
          {payCurrency && renderCurrency(payCurrency)}
          <input
            type="text"
            inputMode="decimal"
            className="input input-bordered text-right w-32"
            placeholder="0.0"
            value={payAmount}
            disabled={!payCurrency}
            onChange={(e) => setPayAmount(e.target.value)}
          />
        </div>
      </div>

      <ExecuteLoopButton
        params={{
          chainId,
          collateralAsset: toPool?.asset.address!,
          debtAsset: fromPool?.asset.address!,
          payAsset: payCurrency?.address!,
          lender: selectedLender,
          payAmount: parseUnits(payAmount, payCurrency?.decimals!),
          debtAmount: parseUnits(fromAmount, fromPool?.asset?.decimals!),
          slippage: 0.3,
          borrowMode: LendingMode.VARIABLE,
          usePendleMintRedeem: false,
        }}
      />
    </div>
  )
}
