import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { parseUnits, zeroAddress, type Address } from 'viem'
import type { RawCurrency } from '../../types/currency'
import { useSpotSwapQuote, type SpotSwapQuote } from '../../hooks/useSpotSwapQuote'
import { useTokenLists } from '../../hooks/useTokenLists'
import { useBalanceQuery, type BalanceEntry } from '../../hooks/balances/useBalanceQuery'
import { TokenSelectorModal } from '../token-selection/TokenSelectorModal'
import { formatTokenForInput } from '../lending/DashboardActions/format'
import { SlippageInput } from '../lending/TradingDashboard/SlippageInput'
import { ErrorDisplay } from '../lending/TradingDashboard/ErrorDisplay'
import { useSyncChain } from '../../hooks/useSyncChain'
import { WalletConnect } from '../connect'
import { getCurrency } from '../../lib/trade-helpers/utils'
import { useDebounce } from '../../hooks/useDebounce'

interface SpotSwapPanelProps {
  chainId: string
}

function formatAmount(v: number): string {
  if (v === 0) return ''
  if (v < 0.000001) return '<0.000001'
  if (v < 1) return v.toFixed(8)
  if (v < 1000) return v.toFixed(6)
  return v.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

function fmtBalance(v: number): string {
  if (v === 0) return '0'
  if (v < 0.0001) return '<0.0001'
  if (v < 1) return v.toFixed(6)
  if (v < 1000) return v.toFixed(4)
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function fmtUsd(v: number): string {
  if (v === 0) return ''
  if (v < 0.01) return '<$0.01'
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function fmtTradeAmount(v: number): string {
  if (!Number.isFinite(v) || v === 0) return '0'
  if (v < 0.0001) return '<0.0001'
  if (v < 1) return v.toFixed(6)
  if (v < 1000) return v.toFixed(4)
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function SwapQuoteCard({
  quote,
  index,
  isSelected,
  onClick,
  inSymbol,
  outSymbol,
}: {
  quote: SpotSwapQuote
  index: number
  isSelected: boolean
  onClick: () => void
  inSymbol?: string
  outSymbol?: string
}) {
  return (
    <button
      type="button"
      className={`w-full text-left p-2 rounded-lg border transition-colors text-xs ${
        isSelected
          ? 'border-primary bg-primary/10'
          : 'border-base-300 bg-base-200/50 hover:bg-base-200'
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold">{quote.aggregator || `Route ${index + 1}`}</span>
      </div>
      <div className="flex gap-3 text-base-content/70">
        <span>
          In:{' '}
          <span className="font-medium text-error">
            {fmtTradeAmount(quote.tradeInput)} {inSymbol}
          </span>
        </span>
        <span>
          Out:{' '}
          <span className="font-medium text-success">
            {fmtTradeAmount(quote.tradeOutput)} {outSymbol}
          </span>
        </span>
      </div>
    </button>
  )
}

export function SpotSwapPanel({ chainId }: SpotSwapPanelProps) {
  const { address: account } = useAccount()
  const { syncChain, currentChainId } = useSyncChain()
  const { data: tokensMap } = useTokenLists(chainId)
  const isWrongChain = !!account && currentChainId !== Number(chainId)

  // Token selection state
  const [tokenIn, setTokenIn] = useState<RawCurrency | undefined>(undefined)
  const [tokenOut, setTokenOut] = useState<RawCurrency | undefined>(undefined)
  const [tokenInModalOpen, setTokenInModalOpen] = useState(false)
  const [tokenOutModalOpen, setTokenOutModalOpen] = useState(false)
  const [tokenQuery, setTokenQuery] = useState('')

  // Fetch balances separately per token so switching one doesn't discard the other's cache
  const tokenInCurrencies = useMemo(() => (tokenIn ? [tokenIn] : []), [tokenIn])
  const tokenOutCurrencies = useMemo(() => (tokenOut ? [tokenOut] : []), [tokenOut])

  const { data: tokenInBalances } = useBalanceQuery({
    currencies: tokenInCurrencies,
    enabled: !!tokenIn && !!account,
  })
  const { data: tokenOutBalances } = useBalanceQuery({
    currencies: tokenOutCurrencies,
    enabled: !!tokenOut && !!account,
  })

  const tokenInBalance: BalanceEntry | undefined = useMemo(
    () => tokenIn ? tokenInBalances?.[chainId]?.[tokenIn.address.toLowerCase()] : undefined,
    [tokenInBalances, chainId, tokenIn]
  )

  const tokenOutBalance: BalanceEntry | undefined = useMemo(
    () => tokenOut ? tokenOutBalances?.[chainId]?.[tokenOut.address.toLowerCase()] : undefined,
    [tokenOutBalances, chainId, tokenOut]
  )

  const tokenInPriceRaw = tokenInBalance?.priceUSD ?? 0
  const tokenOutPriceRaw = tokenOutBalance?.priceUSD ?? 0

  // Amount state
  const [inputAmount, setInputAmount] = useState('')
  const [outputAmount, setOutputAmount] = useState('')
  const [activeField, setActiveField] = useState<'input' | 'output'>('input')

  // Slippage
  const [slippage, setSlippage] = useState('0.5')

  // Swap hook
  const {
    quotes,
    selectedIndex,
    permissions,
    loading,
    executing,
    error,
    fetchQuote,
    selectQuote,
    executePermission,
    executeSwap,
    reset,
  } = useSpotSwapQuote({ chainId, account })

  const selectedQuote = selectedIndex !== null ? quotes[selectedIndex] : null

  // Token prices: use balance-derived price, or cross-derive from quote + other token's price
  const tokenInPrice = useMemo(() => {
    if (tokenInPriceRaw > 0) return tokenInPriceRaw
    if (selectedQuote && tokenOutPriceRaw > 0 && selectedQuote.tradeInput > 0) {
      return (selectedQuote.tradeOutput * tokenOutPriceRaw) / selectedQuote.tradeInput
    }
    return 0
  }, [tokenInPriceRaw, tokenOutPriceRaw, selectedQuote])

  const tokenOutPrice = useMemo(() => {
    if (tokenOutPriceRaw > 0) return tokenOutPriceRaw
    if (selectedQuote && tokenInPriceRaw > 0 && selectedQuote.tradeOutput > 0) {
      return (selectedQuote.tradeInput * tokenInPriceRaw) / selectedQuote.tradeOutput
    }
    return 0
  }, [tokenOutPriceRaw, tokenInPriceRaw, selectedQuote])

  // Reset everything when chain changes
  useEffect(() => {
    setTokenIn(undefined)
    setTokenOut(undefined)
    setInputAmount('')
    setOutputAmount('')
    setActiveField('input')
    reset()
  }, [chainId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select default tokens when token list loads
  useEffect(() => {
    if (!tokensMap || Object.keys(tokensMap).length === 0) return
    if (!tokenIn) {
      const native = getCurrency(chainId, zeroAddress)
      if (native) {
        setTokenIn(native)
      }
    }
  }, [tokensMap, chainId, tokenIn])

  // Update output/input amount when the selected quote changes
  useEffect(() => {
    if (!selectedQuote) return
    if (activeField === 'input' && selectedQuote.tradeOutput > 0) {
      setOutputAmount(formatAmount(selectedQuote.tradeOutput))
    } else if (activeField === 'output' && selectedQuote.tradeInput > 0) {
      setInputAmount(formatAmount(selectedQuote.tradeInput))
    }
  }, [selectedQuote, activeField])

  const handleTokenInChange = useCallback(
    (currency: RawCurrency) => {
      setTokenIn(currency)
      setTokenInModalOpen(false)
      setTokenQuery('')
      reset()
    },
    [reset]
  )

  const handleTokenOutChange = useCallback(
    (currency: RawCurrency) => {
      setTokenOut(currency)
      setTokenOutModalOpen(false)
      setTokenQuery('')
      reset()
    },
    [reset]
  )

  const handleSwapDirection = useCallback(() => {
    setTokenIn(tokenOut)
    setTokenOut(tokenIn)
    setInputAmount(outputAmount)
    setOutputAmount(inputAmount)
    setActiveField((f) => (f === 'input' ? 'output' : 'input'))
    reset()
  }, [tokenIn, tokenOut, inputAmount, outputAmount, reset])

  const handleInputChange = useCallback(
    (value: string) => {
      setInputAmount(value)
      setOutputAmount('')
      setActiveField('input')
      reset()
    },
    [reset]
  )

  const handleOutputChange = useCallback(
    (value: string) => {
      setOutputAmount(value)
      setInputAmount('')
      setActiveField('output')
      reset()
    },
    [reset]
  )

  const resolvedTokenInAddress = useMemo(() => {
    if (!tokenIn) return undefined
    return tokenIn.address as string
  }, [tokenIn])

  const resolvedTokenOutAddress = useMemo(() => {
    if (!tokenOut) return undefined
    return tokenOut.address as string
  }, [tokenOut])

  const canFetchQuote = useMemo(() => {
    if (!resolvedTokenInAddress || !resolvedTokenOutAddress) return false
    if (activeField === 'input' && !inputAmount) return false
    if (activeField === 'output' && !outputAmount) return false
    return true
  }, [resolvedTokenInAddress, resolvedTokenOutAddress, inputAmount, outputAmount, activeField])

  const handleFetchQuote = useCallback(() => {
    if (!resolvedTokenInAddress || !resolvedTokenOutAddress) return
    if (!tokenIn || !tokenOut) return

    const tradeType = activeField === 'input' ? 0 : 1
    const amountRaw = activeField === 'input' ? inputAmount : outputAmount

    let amountWei: string
    try {
      const decimals = tradeType === 0 ? tokenIn.decimals : tokenOut.decimals
      amountWei = parseUnits(amountRaw || '0', decimals ?? 18).toString()
    } catch {
      return
    }

    fetchQuote({
      chainId,
      tokenIn: resolvedTokenInAddress,
      tokenOut: resolvedTokenOutAddress,
      amount: amountWei,
      slippage: (parseFloat(slippage) || 0.5) * 100,
      tradeType: tradeType as 0 | 1,
      account,
    })
  }, [
    chainId,
    resolvedTokenInAddress,
    resolvedTokenOutAddress,
    tokenIn,
    tokenOut,
    inputAmount,
    outputAmount,
    activeField,
    slippage,
    account,
    fetchQuote,
  ])

  // Auto-quote with debounce when inputs change
  const debouncedInputAmount = useDebounce(inputAmount, 500)
  const debouncedOutputAmount = useDebounce(outputAmount, 500)
  const handleFetchQuoteRef = useRef(handleFetchQuote)
  handleFetchQuoteRef.current = handleFetchQuote

  const debouncedActiveAmount = activeField === 'input' ? debouncedInputAmount : debouncedOutputAmount

  useEffect(() => {
    if (!canFetchQuote) return
    if (!debouncedActiveAmount || parseFloat(debouncedActiveAmount) <= 0) return
    handleFetchQuoteRef.current()
  }, [debouncedActiveAmount, canFetchQuote, resolvedTokenInAddress, resolvedTokenOutAddress])

  // Excluded addresses for each modal
  const excludeIn = useMemo(
    () => (tokenOut ? [tokenOut.address as Address] : []),
    [tokenOut]
  )
  const excludeOut = useMemo(
    () => (tokenIn ? [tokenIn.address as Address] : []),
    [tokenIn]
  )

  return (
    <div className="max-w-md mx-auto">
      <div className="rounded-box border border-base-300 bg-base-100 p-4 space-y-1">
        <h3 className="text-sm font-semibold mb-3">Spot Swap</h3>

        {/* Input token panel (exact input / tradeType=0) */}
        <div className="rounded-lg bg-base-200/60 p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-base-content/50">You pay</span>
              {tokenIn && tokenInBalance && tokenInBalance.value > 0 && (
                <div className="flex items-center gap-0.5">
                  {[
                    { label: '25%', fraction: 0.25 },
                    { label: '50%', fraction: 0.5 },
                    { label: '75%', fraction: 0.75 },
                    { label: '100%', fraction: 1 },
                  ].map((e) => (
                    <button
                      key={e.label}
                      type="button"
                      className="btn btn-ghost btn-xs px-1.5 py-0 h-5 min-h-0 text-[10px]"
                      onClick={() => handleInputChange(formatTokenForInput(tokenInBalance.value * e.fraction))}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {tokenIn && tokenInBalance && tokenInBalance.value > 0 && (
              <span className="text-xs text-base-content/50">
                {fmtBalance(tokenInBalance.value)}
                {tokenInBalance.balanceUSD > 0 && (
                  <span className="ml-1">{fmtUsd(tokenInBalance.balanceUSD)}</span>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              className="input input-ghost text-2xl font-medium flex-1 p-0 h-auto focus:outline-none bg-transparent"
              placeholder="0"
              value={inputAmount}
              onChange={(e) => handleInputChange(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-sm gap-1.5 shrink-0"
              onClick={() => {
                setTokenQuery('')
                setTokenInModalOpen(true)
              }}
            >
              {tokenIn ? (
                <>
                  <img
                    src={tokenIn.logoURI}
                    alt={tokenIn.symbol}
                    className="w-5 h-5 rounded-full object-contain token-logo"
                  />
                  <div className="flex flex-col items-start">
                    <span className="font-medium text-sm">{tokenIn.symbol}</span>
                  </div>
                </>
              ) : (
                <span className="text-base-content/50">Select</span>
              )}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path
                  fillRule="evenodd"
                  d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
          <div className="flex items-center justify-between mt-1">
            {(() => {
              const amt = parseFloat(inputAmount)
              const usd = amt > 0 && tokenInPrice > 0 ? amt * tokenInPrice : 0
              return usd > 0 ? (
                <div className="text-xs text-base-content/50">{fmtUsd(usd)}</div>
              ) : null
            })()}
            {tokenIn && (
              <div className="text-xs text-base-content/40">{tokenIn.name}</div>
            )}
          </div>
        </div>

        {/* Swap direction button */}
        <div className="flex justify-center -my-2 relative z-10">
          <button
            type="button"
            className="btn btn-circle btn-sm bg-base-100 border-base-300 shadow-sm hover:bg-base-200"
            onClick={handleSwapDirection}
            title="Switch tokens"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path
                fillRule="evenodd"
                d="M2.24 6.8a.75.75 0 0 0 1.06-.04l1.95-2.1v8.59a.75.75 0 0 0 1.5 0V4.66l1.95 2.1a.75.75 0 1 0 1.1-1.02l-3.25-3.5a.75.75 0 0 0-1.1 0L2.2 5.74a.75.75 0 0 0 .04 1.06Zm8 6.4a.75.75 0 0 0-.04 1.06l3.25 3.5a.75.75 0 0 0 1.1 0l3.25-3.5a.75.75 0 1 0-1.1-1.02l-1.95 2.1V6.75a.75.75 0 0 0-1.5 0v8.59l-1.95-2.1a.75.75 0 0 0-1.06-.04Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Output token panel (exact output / tradeType=1) */}
        <div className="rounded-lg bg-base-200/60 p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-base-content/50">You receive</span>
            {tokenOut && tokenOutBalance && tokenOutBalance.value > 0 && (
              <span className="text-xs text-base-content/50">
                {fmtBalance(tokenOutBalance.value)}
                {tokenOutBalance.balanceUSD > 0 && (
                  <span className="ml-1">{fmtUsd(tokenOutBalance.balanceUSD)}</span>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              className="input input-ghost text-2xl font-medium flex-1 p-0 h-auto focus:outline-none bg-transparent"
              placeholder="0"
              value={outputAmount}
              onChange={(e) => handleOutputChange(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-sm gap-1.5 shrink-0"
              onClick={() => {
                setTokenQuery('')
                setTokenOutModalOpen(true)
              }}
            >
              {tokenOut ? (
                <>
                  <img
                    src={tokenOut.logoURI}
                    alt={tokenOut.symbol}
                    className="w-5 h-5 rounded-full object-contain token-logo"
                  />
                  <div className="flex flex-col items-start">
                    <span className="font-medium text-sm">{tokenOut.symbol}</span>
                  </div>
                </>
              ) : (
                <span className="text-base-content/50">Select</span>
              )}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path
                  fillRule="evenodd"
                  d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
          <div className="flex items-center justify-between mt-1">
            {(() => {
              const amt = parseFloat(outputAmount)
              const usd = amt > 0 && tokenOutPrice > 0 ? amt * tokenOutPrice : 0
              return usd > 0 ? (
                <div className="text-xs text-base-content/50">{fmtUsd(usd)}</div>
              ) : null
            })()}
            {tokenOut && (
              <div className="text-xs text-base-content/40">{tokenOut.name}</div>
            )}
          </div>
        </div>

        {/* Insufficient balance warning */}
        {tokenIn && inputAmount && parseFloat(inputAmount) > 0 && account && (
          tokenInBalance ? parseFloat(inputAmount) > tokenInBalance.value : false
        ) && (
          <div className="text-xs text-warning flex items-center gap-1.5 px-1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
            </svg>
            Insufficient {tokenIn.symbol} balance
          </div>
        )}

        {/* Slippage */}
        <div className="pt-1">
          <SlippageInput
            value={slippage}
            onChange={(v) => {
              setSlippage(v)
              reset()
            }}
          />
        </div>

        {/* Loading indicator */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-1 text-xs text-base-content/50">
            <span className="loading loading-spinner loading-xs" />
            Fetching quotes...
          </div>
        )}

        {/* Error */}
        {error && <ErrorDisplay error={error} />}

        {/* Quotes list */}
        {quotes.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-medium">Quotes</span>
            {quotes.map((q, i) => (
              <SwapQuoteCard
                key={i}
                quote={q}
                index={i}
                isSelected={selectedIndex === i}
                onClick={() => selectQuote(i)}
                inSymbol={tokenIn?.symbol}
                outSymbol={tokenOut?.symbol}
              />
            ))}
          </div>
        )}

        {/* Permissions, and execute */}
        {selectedIndex !== null && (
          <div className="space-y-1.5">
            {!account ? (
              <div className="w-full flex justify-center">
                <WalletConnect />
              </div>
            ) : isWrongChain ? (
              <button
                type="button"
                className="btn btn-warning btn-sm w-full"
                onClick={() => syncChain(Number(chainId))}
              >
                Switch Wallet Chain
              </button>
            ) : (
              <>
                {permissions.map((tx, i) => (
                  <button
                    key={`perm-${i}`}
                    type="button"
                    className="btn btn-outline btn-sm w-full"
                    onClick={() => executePermission(tx)}
                  >
                    {tx.description || 'Approve'}
                  </button>
                ))}
                <button
                  type="button"
                  className="btn btn-success btn-sm w-full"
                  disabled={executing}
                  onClick={executeSwap}
                >
                  {executing ? (
                    <>
                      <span className="loading loading-spinner loading-xs" />
                      Executing swap...
                    </>
                  ) : (
                    'Execute Swap'
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs w-full"
                  disabled={loading}
                  onClick={handleFetchQuote}
                >
                  Refresh Quotes
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Token selector modals */}
      <TokenSelectorModal
        open={tokenInModalOpen}
        onClose={() => setTokenInModalOpen(false)}
        currency={tokenIn}
        onCurrencyChange={handleTokenInChange}
        query={tokenQuery}
        onQueryChange={setTokenQuery}
        excludeAddresses={excludeIn}
        showChainSelector={false}
        initialChainId={chainId}
      />
      <TokenSelectorModal
        open={tokenOutModalOpen}
        onClose={() => setTokenOutModalOpen(false)}
        currency={tokenOut}
        onCurrencyChange={handleTokenOutChange}
        query={tokenQuery}
        onQueryChange={setTokenQuery}
        excludeAddresses={excludeOut}
        showChainSelector={false}
        initialChainId={chainId}
      />
    </div>
  )
}
