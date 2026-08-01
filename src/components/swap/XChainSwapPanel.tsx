import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useSpyAccount } from '../../contexts/SpyMode'
import { parseUnits, zeroAddress, type Address } from 'viem'
import type { RawCurrency } from '../../types/currency'
import { useXChainSwapQuote, type XChainSwapQuote } from '../../hooks/useXChainSwapQuote'
import {
  compareAmountStrings,
  multiplyAmountString,
  sanitizeAmountInput,
} from '../lending/actions/format'
import { useBalanceQuery, type BalanceEntry } from '../../hooks/balances/useBalanceQuery'
import { useXChainBalances, type XChainBalanceItem } from '../../hooks/balances/useXChainBalances'
import { usePriceQuery } from '../../hooks/prices/usePriceQuery'
import { TokenSelectorModal } from '../token-selection/TokenSelectorModal'
import { SlippageInput } from '../lending/tabs/trading/SlippageInput'
import { ErrorDisplay } from '../lending/tabs/trading/ErrorDisplay'
import { useSyncChain } from '../../hooks/useSyncChain'
import { useChains } from '../../hooks/useChains'
import { WalletConnect } from '../connect'
import { getCurrency } from '../../lib/trade-helpers/utils'
import { useDebounce } from '../../hooks/useDebounce'
import { Logo } from '../common/Logo'

interface XChainSwapPanelProps {
  chainId: string
}

/**
 * Chains scanned by the multi-chain balance strip. Kept to majors — each
 * chain costs one client-side eth_call per refresh, and the server caps a
 * prepare request at 30 chains.
 */
const BALANCE_CHAINS = [
  '1',
  '10',
  '56',
  '130',
  '137',
  '999',
  '1868',
  '8453',
  '42161',
  '43114',
  '57073',
  '59144',
]

function formatAmount(v: number): string {
  if (v === 0) return ''
  if (v < 0.000001) return '<0.000001'
  if (v < 1) return v.toFixed(8)
  if (v < 1000) return v.toFixed(6)
  return v.toLocaleString('en-US', { maximumFractionDigits: 4, useGrouping: false })
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

function fmtDuration(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null
  if (seconds < 90) return `~${Math.round(seconds)}s`
  return `~${Math.round(seconds / 60)}m`
}

function XChainQuoteCard({
  quote,
  index,
  isSelected,
  onClick,
  inSymbol,
  outSymbol,
}: {
  quote: XChainSwapQuote
  index: number
  isSelected: boolean
  onClick: () => void
  inSymbol?: string
  outSymbol?: string
}) {
  const duration = fmtDuration(quote.estimatedDuration)
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
        <span className="font-semibold">{quote.label || `Route ${index + 1}`}</span>
        {duration && <span className="text-base-content/50">{duration}</span>}
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

export function XChainSwapPanel({ chainId }: XChainSwapPanelProps) {
  const { address: account } = useSpyAccount()
  const { syncChain, currentChainId } = useSyncChain()
  const { chains } = useChains()

  // Each side carries its own chain via the selected currency
  const [tokenIn, setTokenIn] = useState<RawCurrency | undefined>(undefined)
  const [tokenOut, setTokenOut] = useState<RawCurrency | undefined>(undefined)
  const [tokenInModalOpen, setTokenInModalOpen] = useState(false)
  const [tokenOutModalOpen, setTokenOutModalOpen] = useState(false)
  const [tokenQuery, setTokenQuery] = useState('')
  const [balancesOpen, setBalancesOpen] = useState(true)

  const fromChainId = tokenIn?.chainId ?? chainId
  const toChainId = tokenOut?.chainId ?? chainId
  const isWrongChain = !!account && currentChainId !== Number(fromChainId)

  const chainName = useCallback(
    (id: string) => chains.find((c) => c.chainId === id)?.name ?? `Chain ${id}`,
    [chains]
  )

  // Pay-side balance (single token)
  const tokenInCurrencies = useMemo(() => (tokenIn ? [tokenIn] : []), [tokenIn])
  const {
    data: tokenInBalances,
    isFetching: isBalancesFetching,
    refetch: refetchBalances,
  } = useBalanceQuery({ currencies: tokenInCurrencies, enabled: !!tokenIn && !!account })

  const tokenInBalance: BalanceEntry | undefined = useMemo(
    () => (tokenIn ? tokenInBalances?.[fromChainId]?.[tokenIn.address.toLowerCase()] : undefined),
    [tokenInBalances, fromChainId, tokenIn]
  )

  // Multi-chain main-token balances (prepare/parse mechanic)
  const {
    data: xBalances,
    isFetching: isXBalancesFetching,
    refetch: refetchXBalances,
  } = useXChainBalances({ chains: BALANCE_CHAINS, enabled: !!account })

  // Prices via the same endpoint as the spot page (fans out per chain)
  const priceCurrencies = useMemo(() => {
    const list: RawCurrency[] = []
    if (tokenIn) list.push(tokenIn)
    if (tokenOut) list.push(tokenOut)
    return list
  }, [tokenIn, tokenOut])

  const { data: priceData } = usePriceQuery({
    currencies: priceCurrencies,
    enabled: priceCurrencies.length > 0,
  })

  const tokenInPrice = useMemo(
    () => (tokenIn ? (priceData?.[fromChainId]?.[tokenIn.address.toLowerCase()]?.usd ?? 0) : 0),
    [priceData, fromChainId, tokenIn]
  )
  const tokenOutPrice = useMemo(
    () => (tokenOut ? (priceData?.[toChainId]?.[tokenOut.address.toLowerCase()]?.usd ?? 0) : 0),
    [priceData, toChainId, tokenOut]
  )

  // Amount state — bridges are exact-input; the receive side is read-only
  const [inputAmount, setInputAmount] = useState('')
  const [slippage, setSlippage] = useState('0.5')

  const {
    quotes,
    selectedIndex,
    isSpotFallback,
    noRoutes,
    loading,
    executing,
    error,
    txSuccess,
    fetchQuote,
    selectQuote,
    permissionsForQuote,
    executePermission,
    executeSwap,
    dismissSuccess,
    reset,
  } = useXChainSwapQuote({ fromChainId, account })

  const selectedQuote = selectedIndex !== null ? quotes[selectedIndex] : null
  const selectedPermissions = useMemo(
    () => permissionsForQuote(selectedQuote),
    [permissionsForQuote, selectedQuote]
  )

  // USD value impact of the selected route (bridge fees + dest swap included)
  const swapUsdImpact = useMemo(() => {
    if (!selectedQuote || tokenInPrice <= 0 || tokenOutPrice <= 0) return null
    const { tradeInput, tradeOutput } = selectedQuote
    if (tradeInput <= 0 || tradeOutput <= 0) return null
    const inputUsd = tradeInput * tokenInPrice
    const outputUsd = tradeOutput * tokenOutPrice
    const diff = outputUsd - inputUsd
    const pct = (diff / inputUsd) * 100
    return { inputUsd, outputUsd, diff, pct }
  }, [selectedQuote, tokenInPrice, tokenOutPrice])

  // Default the pay side to native on the app's selected chain
  useEffect(() => {
    if (!tokenIn) {
      const native = getCurrency(chainId, zeroAddress)
      if (native) setTokenIn(native)
    }
  }, [chainId, tokenIn])

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
    setInputAmount('')
    reset()
  }, [tokenIn, tokenOut, reset])

  const handleInputChange = useCallback(
    (value: string) => {
      setInputAmount(value)
      reset()
    },
    [reset]
  )

  const canFetchQuote = !!tokenIn && !!tokenOut && !!inputAmount

  const handleFetchQuote = useCallback(() => {
    if (!tokenIn || !tokenOut) return

    let amountWei: string
    try {
      amountWei = parseUnits(inputAmount || '0', tokenIn.decimals ?? 18).toString()
    } catch {
      return
    }

    fetchQuote({
      fromChainId: tokenIn.chainId,
      toChainId: tokenOut.chainId,
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      amount: amountWei,
      slippage: (parseFloat(slippage) || 0.5) * 100,
      account,
    })
  }, [tokenIn, tokenOut, inputAmount, slippage, account, fetchQuote])

  // Auto-quote with debounce
  const debouncedInputAmount = useDebounce(inputAmount, 500)
  const handleFetchQuoteRef = useRef(handleFetchQuote)
  handleFetchQuoteRef.current = handleFetchQuote

  useEffect(() => {
    if (!canFetchQuote) return
    if (!debouncedInputAmount || parseFloat(debouncedInputAmount) <= 0) return
    handleFetchQuoteRef.current()
  }, [debouncedInputAmount, canFetchQuote, tokenIn, tokenOut])

  const excludeIn = useMemo(
    () => (tokenOut && tokenOut.chainId === fromChainId ? [tokenOut.address as Address] : []),
    [tokenOut, fromChainId]
  )
  const excludeOut = useMemo(
    () => (tokenIn && tokenIn.chainId === toChainId ? [tokenIn.address as Address] : []),
    [tokenIn, toChainId]
  )

  const handleBalanceRowClick = useCallback(
    (itemChainId: string, item: XChainBalanceItem) => {
      // Full list entry when available (logo etc.), raw parse metadata otherwise
      const currency =
        getCurrency(itemChainId, item.address as Address) ??
        ({
          chainId: itemChainId,
          address: item.address,
          symbol: item.symbol,
          name: item.name,
          decimals: item.decimals,
        } as RawCurrency)
      setTokenIn(currency)
      setInputAmount('')
      reset()
    },
    [reset]
  )

  const chainChip = (id: string) => (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-base-300/60 text-base-content/60">
      {chainName(id)}
    </span>
  )

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-center gap-4">
        <div className="w-full max-w-md mx-auto lg:mx-0 rounded-box border border-base-300 bg-base-100 p-4 space-y-1">
          <h3 className="text-sm font-semibold mb-3">Cross-Chain Swap</h3>

          {txSuccess ? (
            <div className="flex flex-col items-center gap-3 py-4 animate-in fade-in">
              <div className="w-14 h-14 rounded-full bg-success/15 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-success"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold">
                  {isSpotFallback ? 'Swap Submitted' : 'Bridge Submitted'}
                </p>
                <p className="text-xs text-base-content/70">
                  {tokenIn?.symbol} ({chainName(fromChainId)}) → {tokenOut?.symbol} (
                  {chainName(toChainId)})
                </p>
                {!isSpotFallback && (
                  <p className="text-[10px] text-base-content/50">
                    Funds arrive on the destination chain after the bridge settles.
                  </p>
                )}
              </div>
              {txSuccess.hash && (
                <p className="text-[10px] text-base-content/40 font-mono truncate max-w-full px-2">
                  {txSuccess.hash}
                </p>
              )}
              <button
                type="button"
                className="btn btn-sm btn-ghost w-full mt-1"
                onClick={() => {
                  dismissSuccess()
                  setInputAmount('')
                  refetchXBalances()
                }}
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Pay side */}
              <div className="rounded-lg bg-base-200/60 p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-base-content/50">You pay</span>
                    {chainChip(fromChainId)}
                    {tokenIn && tokenInBalance && tokenInBalance.value > 0 && (
                      <div className="flex items-center gap-0.5">
                        {[
                          { label: '25%', fraction: 0.25 },
                          { label: '50%', fraction: 0.5 },
                          { label: '100%', fraction: 1 },
                        ].map((e) => (
                          <button
                            key={e.label}
                            type="button"
                            className="btn btn-ghost btn-xs px-1.5 py-0 h-5 min-h-0 text-[10px]"
                            onClick={() =>
                              handleInputChange(
                                e.fraction === 1
                                  ? tokenInBalance.balance
                                  : multiplyAmountString(tokenInBalance.balance, e.fraction)
                              )
                            }
                          >
                            {e.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {tokenIn && account && tokenInBalance && tokenInBalance.value > 0 && (
                    <span className="text-xs text-base-content/50 flex items-center gap-1">
                      {fmtBalance(tokenInBalance.value)}
                      {tokenInBalance.balanceUSD > 0 && (
                        <span>{fmtUsd(tokenInBalance.balanceUSD)}</span>
                      )}
                      <button
                        type="button"
                        className="text-base-content/30 hover:text-base-content/60 transition-colors"
                        onClick={() => refetchBalances()}
                        title="Refresh balance"
                      >
                        {isBalancesFetching ? (
                          <span className="loading loading-spinner w-2.5 h-2.5" />
                        ) : (
                          <svg
                            className="w-2.5 h-2.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M21 2v6h-6" />
                            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                            <path d="M3 22v-6h6" />
                            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                          </svg>
                        )}
                      </button>
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
                    onChange={(e) => {
                      const v = sanitizeAmountInput(e.target.value)
                      if (v !== null) handleInputChange(v)
                    }}
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
                        <Logo
                          src={tokenIn.logoURI}
                          alt={tokenIn.symbol}
                          fallbackText={tokenIn.symbol}
                          className="w-5 h-5 rounded-full object-contain token-logo"
                        />
                        <span className="font-medium text-sm">{tokenIn.symbol}</span>
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
                  {tokenIn && <div className="text-xs text-base-content/40">{tokenIn.name}</div>}
                </div>
              </div>

              {/* Direction flip */}
              <div className="flex justify-center -my-2 relative z-10">
                <button
                  type="button"
                  className="btn btn-circle btn-sm bg-base-100 border-base-300 shadow-sm hover:bg-base-200"
                  onClick={handleSwapDirection}
                  title="Switch sides"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4"
                  >
                    <path
                      fillRule="evenodd"
                      d="M2.24 6.8a.75.75 0 0 0 1.06-.04l1.95-2.1v8.59a.75.75 0 0 0 1.5 0V4.66l1.95 2.1a.75.75 0 1 0 1.1-1.02l-3.25-3.5a.75.75 0 0 0-1.1 0L2.2 5.74a.75.75 0 0 0 .04 1.06Zm8 6.4a.75.75 0 0 0-.04 1.06l3.25 3.5a.75.75 0 0 0 1.1 0l3.25-3.5a.75.75 1 0 0-1.1-1.02l-1.95 2.1V6.75a.75.75 0 0 0-1.5 0v8.59l-1.95-2.1a.75.75 0 0 0-1.06-.04Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>

              {/* Receive side (read-only, exact input only) */}
              <div className="rounded-lg bg-base-200/60 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs text-base-content/50">You receive</span>
                  {chainChip(toChainId)}
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-2xl font-medium flex-1 text-base-content/80 min-h-8">
                    {selectedQuote ? formatAmount(selectedQuote.tradeOutput) || '0' : '—'}
                  </div>
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
                        <Logo
                          src={tokenOut.logoURI}
                          alt={tokenOut.symbol}
                          fallbackText={tokenOut.symbol}
                          className="w-5 h-5 rounded-full object-contain token-logo"
                        />
                        <span className="font-medium text-sm">{tokenOut.symbol}</span>
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
                    const out = selectedQuote?.tradeOutput ?? 0
                    const usd = out > 0 && tokenOutPrice > 0 ? out * tokenOutPrice : 0
                    return usd > 0 ? (
                      <div className="text-xs text-base-content/50">{fmtUsd(usd)}</div>
                    ) : null
                  })()}
                  {tokenOut && <div className="text-xs text-base-content/40">{tokenOut.name}</div>}
                </div>
              </div>

              {/* Insufficient balance warning */}
              {tokenIn &&
                inputAmount &&
                parseFloat(inputAmount) > 0 &&
                account &&
                (tokenInBalance
                  ? compareAmountStrings(inputAmount, tokenInBalance.balance) > 0
                  : false) && (
                  <div className="text-xs text-warning flex items-center gap-1.5 px-1">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-4 h-4 shrink-0"
                    >
                      <path
                        fillRule="evenodd"
                        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                        clipRule="evenodd"
                      />
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

              {loading && (
                <div className="flex items-center justify-center gap-2 py-1 text-xs text-base-content/50">
                  <span className="loading loading-spinner loading-xs" />
                  Fetching bridge quotes...
                </div>
              )}

              {error && <ErrorDisplay error={error} />}

              {/* No routes */}
              {noRoutes && !loading && !error && (
                <div className="text-xs text-warning flex items-center gap-1.5 px-1 py-1">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4 shrink-0"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {isSpotFallback
                    ? `No swap routes found for this pair on ${chainName(fromChainId)}.`
                    : 'No bridge routes found for this pair.'}
                </div>
              )}

              {/* Quotes */}
              {quotes.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">
                      {isSpotFallback ? 'Quotes (same chain — spot swap)' : 'Bridge Quotes'}
                    </span>
                  </div>
                  {quotes.map((q, i) => (
                    <XChainQuoteCard
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

              {/* USD value impact */}
              {swapUsdImpact && (
                <div className="rounded-lg border border-base-300 bg-base-200/40 px-2.5 py-2 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-base-content/60">You pay</span>
                    <span className="font-medium">{fmtUsd(swapUsdImpact.inputUsd)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-base-content/60">You receive</span>
                    <span className="font-medium">{fmtUsd(swapUsdImpact.outputUsd)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-base-300 pt-1">
                    <span className="text-base-content/60">Value impact</span>
                    <span
                      className={`font-semibold ${swapUsdImpact.pct >= -0.1 ? 'text-success' : swapUsdImpact.pct >= -1 ? 'text-warning' : 'text-error'}`}
                    >
                      {swapUsdImpact.diff >= 0 ? '+' : ''}
                      {fmtUsd(swapUsdImpact.diff)} ({swapUsdImpact.pct >= 0 ? '+' : ''}
                      {swapUsdImpact.pct.toFixed(2)}%)
                    </span>
                  </div>
                </div>
              )}

              {/* Permissions + execute */}
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
                      onClick={() => syncChain(Number(fromChainId))}
                    >
                      Switch Wallet to {chainName(fromChainId)}
                    </button>
                  ) : (
                    <>
                      {selectedPermissions.map((tx, i) => (
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
                            Executing...
                          </>
                        ) : isSpotFallback ? (
                          'Execute Swap'
                        ) : (
                          `Bridge via ${selectedQuote?.label ?? '…'}`
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
            </>
          )}
        </div>

        {/* Multi-chain balances (prepare/parse, main tokens only) — side column on lg */}
        {account && (
          <div className="w-full max-w-md mx-auto lg:mx-0 lg:w-80 lg:shrink-0 rounded-box border border-base-300 bg-base-100 p-4 h-fit">
            <div className="w-full flex items-center justify-between">
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-semibold"
                onClick={() => setBalancesOpen((o) => !o)}
              >
                Your Balances
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`w-4 h-4 transition-transform ${balancesOpen ? 'rotate-180' : ''}`}
                >
                  <path
                    fillRule="evenodd"
                    d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              <span className="text-xs text-base-content/60 flex items-center gap-2">
                {xBalances && xBalances.totalUSD > 0 && fmtUsd(xBalances.totalUSD)}
                <button
                  type="button"
                  className="text-base-content/30 hover:text-base-content/60 transition-colors"
                  onClick={() => refetchXBalances()}
                  title="Rescan balances"
                >
                  {isXBalancesFetching ? (
                    <span className="loading loading-spinner w-3 h-3" />
                  ) : (
                    <svg
                      className="w-3 h-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 2v6h-6" />
                      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                      <path d="M3 22v-6h6" />
                      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                    </svg>
                  )}
                </button>
              </span>
            </div>

            {balancesOpen && (
              <div className="mt-3 space-y-3 max-h-96 overflow-y-auto">
                {!xBalances && (
                  <p className="text-xs text-base-content/50">
                    Scanning main tokens across {BALANCE_CHAINS.length} chains…
                  </p>
                )}
                {xBalances && Object.keys(xBalances.chains).length === 0 && (
                  <p className="text-xs text-base-content/50">
                    {xBalances.missingChains.length > 0
                      ? 'No balances found on the reachable chains.'
                      : 'No main-token balances found on the scanned chains.'}
                  </p>
                )}
                {xBalances &&
                  Object.entries(xBalances.chains).map(([cid, items]) => (
                    <div key={cid}>
                      <div className="text-xs font-medium text-base-content/60 mb-1">
                        {chainName(cid)}
                      </div>
                      <div className="space-y-0.5">
                        {items.map((item) => (
                          <button
                            key={`${cid}-${item.address}`}
                            type="button"
                            className="w-full flex items-center justify-between px-2 py-1 rounded hover:bg-base-200 text-xs"
                            onClick={() => handleBalanceRowClick(cid, item)}
                            title={`Pay with ${item.symbol} on ${chainName(cid)}`}
                          >
                            <span className="font-medium">{item.symbol}</span>
                            <span className="text-base-content/70 flex gap-2">
                              <span>{fmtBalance(parseFloat(item.balance))}</span>
                              {item.balanceUSD > 0 && (
                                <span className="text-base-content/50 w-20 text-right">
                                  {fmtUsd(item.balanceUSD)}
                                </span>
                              )}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                {xBalances && xBalances.missingChains.length > 0 && (
                  <p className="text-[10px] text-base-content/40">
                    Unreachable: {xBalances.missingChains.map(chainName).join(', ')} —{' '}
                    <button
                      type="button"
                      className="underline hover:text-base-content/70"
                      onClick={() => refetchXBalances()}
                    >
                      retry
                    </button>
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Token selector modals — chain selection enabled on both sides */}
      <TokenSelectorModal
        open={tokenInModalOpen}
        onClose={() => setTokenInModalOpen(false)}
        currency={tokenIn}
        onCurrencyChange={handleTokenInChange}
        query={tokenQuery}
        onQueryChange={setTokenQuery}
        excludeAddresses={excludeIn}
        showChainSelector={true}
        initialChainId={fromChainId}
      />
      <TokenSelectorModal
        open={tokenOutModalOpen}
        onClose={() => setTokenOutModalOpen(false)}
        currency={tokenOut}
        onCurrencyChange={handleTokenOutChange}
        query={tokenQuery}
        onQueryChange={setTokenQuery}
        excludeAddresses={excludeOut}
        showChainSelector={true}
        initialChainId={toChainId}
      />
    </div>
  )
}
