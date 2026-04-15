import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import { useTokenLists } from '../../hooks/useTokenLists'
import { useBalanceQuery } from '../../hooks/balances/useBalanceQuery'
import { usePriceQuery } from '../../hooks/prices/usePriceQuery'
import { useChainsRegistry } from '../../sdk/hooks/useChainsRegistry'
import { SupportedChainId } from '../../sdk/types'
import { getCurrency } from '../../lib/trade-helpers/utils'
import type { RawCurrency } from '../../types/currency'
import { TokenSelectorDropdownMode } from './Dropdown'
import { TokenSelectorListMode } from './ListMode'
import type { TokenRowData } from './types'
import { useSpyAccount } from '../../contexts/SpyMode'
import { getMainTokensCache, isMainToken } from '../../lib/assetLists'
import { getUserTokensForChain, addUserToken, isUserToken } from '../../lib/userTokens'
import { useDebounce } from '../../hooks/useDebounce'

const MAX_SEARCH_RESULTS = 100

type TokenSelectorProps = {
  chainId: string
  value?: Address
  onChange: (address: Address) => void
  excludeAddresses?: Address[]
  query?: string
  onQueryChange?: (v: string) => void
  showSearch?: boolean
  listMode?: boolean // When true, shows only the list without dropdown button
}

export function TokenSelector({
  chainId,
  value,
  onChange,
  excludeAddresses,
  query: externalQuery,
  onQueryChange,
  showSearch = true,
  listMode = false,
}: TokenSelectorProps) {
  const { address: userAddress } = useSpyAccount()
  const { data: lists, isLoading: listsLoading } = useTokenLists(chainId)
  const { data: chains } = useChainsRegistry()
  const [open, setOpen] = useState(false)
  const [internalQuery, setInternalQuery] = useState('')
  const searchQuery = externalQuery !== undefined ? externalQuery : internalQuery
  const setSearchQuery = onQueryChange || setInternalQuery
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (listMode) return // No dropdown behavior in list mode
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onDocClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) {
      document.addEventListener('keydown', onKey)
      document.addEventListener('mousedown', onDocClick)
    }
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDocClick)
    }
  }, [open, listMode])

  const tokensMap = lists || {}
  const allAddrs = useMemo(() => Object.keys(tokensMap) as Address[], [tokensMap])
  const nativeCurrencySymbol = chains?.[chainId]?.data?.nativeCurrency?.symbol?.toUpperCase() || ''

  const mainTokensSet = useMemo(() => {
    const mainTokensCache = getMainTokensCache()
    return mainTokensCache?.[chainId] || new Set<string>()
  }, [chainId])

  const [userTokensVersion, setUserTokensVersion] = useState(0)
  const userTokensForChain = useMemo(() => {
    return getUserTokensForChain(chainId)
  }, [chainId, userTokensVersion])

  const mainAndUserTokensSet = useMemo(() => {
    const set = new Set<string>(mainTokensSet)
    set.add(zeroAddress.toLowerCase())
    for (const addr of userTokensForChain) {
      set.add(addr.toLowerCase())
    }
    return set
  }, [mainTokensSet, userTokensForChain])

  const balanceCurrencies = useMemo(() => {
    if (!userAddress) return []
    const currencies: RawCurrency[] = []
    const seenAddresses = new Set<string>()

    const addressesToFetch = new Set<string>()

    addressesToFetch.add(zeroAddress.toLowerCase())

    for (const addr of mainTokensSet) {
      addressesToFetch.add(addr.toLowerCase())
    }

    for (const addr of userTokensForChain) {
      addressesToFetch.add(addr.toLowerCase())
    }

    for (const addr of allAddrs) {
      const addrLower = addr.toLowerCase()
      if (addressesToFetch.has(addrLower)) {
        const currency = getCurrency(chainId, addr)
        if (currency) {
          const key = currency.address.toLowerCase()
          if (!seenAddresses.has(key)) {
            seenAddresses.add(key)
            currencies.push(currency)
          }
        }
      }
    }

    const nativeCurrency = getCurrency(chainId, zeroAddress)
    if (nativeCurrency && !seenAddresses.has(zeroAddress.toLowerCase())) {
      currencies.push(nativeCurrency)
    }

    return currencies
  }, [allAddrs, chainId, userAddress, mainTokensSet, userTokensForChain])

  const { data: balances, isLoading: balancesLoading } = useBalanceQuery({
    currencies: balanceCurrencies,
    enabled: balanceCurrencies.length > 0 && Boolean(userAddress),
  })

  const relevant = useMemo(() => {
    const relevantTokens: Address[] = []

    const isAlreadyIncluded = (addr: string) => {
      const addrLower = addr.toLowerCase()
      return relevantTokens.some((a) => a.toLowerCase() === addrLower)
    }

    const addTokenIfNotIncluded = (
      candidates: [string, any][],
      selector: (candidates: [string, any][]) => [string, any] | undefined
    ) => {
      if (candidates.length === 0) return
      const selected = selector(candidates)
      if (selected && !isAlreadyIncluded(selected[0])) {
        relevantTokens.push(selected[0] as Address)
      }
    }

    // Native
    relevantTokens.push(zeroAddress as Address)

    const wrappedEntry = Object.entries(tokensMap).find(
      ([addr, t]: [string, any]) => t?.props?.wnative === true && !isAlreadyIncluded(addr)
    )
    if (wrappedEntry) {
      relevantTokens.push(wrappedEntry[0] as Address)
    }

    // USDC selection logic
    const usdcCandidates = Object.entries(tokensMap).filter(
      ([, t]: [string, any]) => t?.assetGroup === 'USDC'
    )
    addTokenIfNotIncluded(usdcCandidates, (candidates) => {
      const isMoonbeam = chainId === SupportedChainId.MOONBEAM
      if (isMoonbeam) {
        // On moonbeam, prefer xc tokens
        const xcUsdc = candidates.find(([, t]: [string, any]) => {
          const symbolUpper = t?.symbol?.toUpperCase() || ''
          return symbolUpper.startsWith('XC') && symbolUpper.includes('USDC')
        })
        if (xcUsdc) return xcUsdc
      }
      return (
        candidates.find(([, t]: [string, any]) => t?.symbol?.toUpperCase() === 'USDC') ||
        candidates[0]
      )
    })

    // USDT selection logic
    const usdtCandidates = Object.entries(tokensMap).filter(
      ([, t]: [string, any]) => t?.assetGroup === 'USDT'
    )
    addTokenIfNotIncluded(usdtCandidates, (candidates) => {
      const isMoonbeam = chainId === SupportedChainId.MOONBEAM
      if (isMoonbeam) {
        // On moonbeam, prefer xc tokens
        const xcUsdt = candidates.find(([, t]: [string, any]) => {
          const symbolUpper = t?.symbol?.toUpperCase() || ''
          return symbolUpper.startsWith('XC') && symbolUpper.includes('USDT')
        })
        if (xcUsdt) return xcUsdt
      }
      return (
        candidates.find(([, t]: [string, any]) => t?.symbol?.toUpperCase() === 'USDT') ||
        candidates[0]
      )
    })

    // WBTC selection logic
    const wbtcCandidates = Object.entries(tokensMap).filter(([, t]: [string, any]) => {
      const assetGroupUpper = t?.assetGroup?.toUpperCase() || ''
      return assetGroupUpper === 'WBTC'
    })
    addTokenIfNotIncluded(wbtcCandidates, (candidates) => {
      return (
        candidates.find(([, t]: [string, any]) => t?.symbol?.toUpperCase() === 'WBTC') ||
        candidates[0]
      )
    })

    return relevantTokens
  }, [tokensMap, chainId, nativeCurrencySymbol])

  const getTokenCategory = useCallback(
    (token: { symbol?: string }): number => {
      const symbolUpper = (token.symbol ?? '').toUpperCase()
      const isNative = symbolUpper === nativeCurrencySymbol
      const isWrappedNative =
        symbolUpper === `W${nativeCurrencySymbol}` ||
        symbolUpper.startsWith(`W${nativeCurrencySymbol}`)

      if (isNative || isWrappedNative) {
        return 1
      }
      return 2
    },
    [nativeCurrencySymbol]
  )

  // Debounce search query to avoid blocking the UI on large token lists
  const debouncedQuery = useDebounce(searchQuery, 200)

  // Compute visible addresses (filtered by search + main/user set)
  const visibleAddresses: Address[] = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    const excludeSet = excludeAddresses
      ? new Set(excludeAddresses.map((a) => a.toLowerCase()))
      : null

    if (!q) {
      return allAddrs.filter((addr) => {
        const addrLower = addr.toLowerCase()
        return mainAndUserTokensSet.has(addrLower) && (!excludeSet || !excludeSet.has(addrLower))
      })
    }

    const mainAndUserMatches: Address[] = []
    const otherMatches: Address[] = []
    const seen = new Set<string>()

    for (const addr of allAddrs) {
      if (mainAndUserMatches.length + otherMatches.length >= MAX_SEARCH_RESULTS) break
      const addrLower = addr.toLowerCase()
      if (seen.has(addrLower)) continue
      if (excludeSet?.has(addrLower)) continue

      const token = tokensMap[addr]
      if (!token) continue

      const symbolLower = (token.symbol ?? '').toLowerCase()
      const nameLower = (token.name ?? '').toLowerCase()
      if (symbolLower.includes(q) || nameLower.includes(q) || addrLower.includes(q)) {
        seen.add(addrLower)
        if (mainAndUserTokensSet.has(addrLower)) {
          mainAndUserMatches.push(addr)
        } else {
          otherMatches.push(addr)
        }
      }
    }

    return [...mainAndUserMatches, ...otherMatches]
  }, [allAddrs, tokensMap, debouncedQuery, excludeAddresses, mainAndUserTokensSet])

  // Build price query currencies from visible addresses (debounced to avoid rapid refetches)
  const priceCurrencies = useMemo(() => {
    const currencies: RawCurrency[] = []
    const seen = new Set<string>()
    for (const addr of visibleAddresses) {
      const currency = getCurrency(chainId, addr)
      if (currency) {
        const key = currency.address.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          currencies.push(currency)
        }
      }
    }
    return currencies
  }, [visibleAddresses, chainId])

  const debouncedPriceCurrencies = useDebounce(priceCurrencies, 300)

  const { data: prices, isLoading: pricesLoading } = usePriceQuery({
    currencies: debouncedPriceCurrencies,
    enabled: debouncedPriceCurrencies.length > 0,
  })

  const rows: TokenRowData[] = useMemo(() => {
    const relevantSet = new Set(relevant.map((addr) => addr.toLowerCase()))

    const mapped = visibleAddresses.map((addr) => {
      const token = tokensMap[addr]
      const addrLower = addr.toLowerCase()
      const bal = balances?.[chainId]?.[addrLower]
      const priceData = prices?.[chainId]?.[addrLower]
      const price = priceData?.usd || 0

      const balanceAmount = bal ? Number(bal.value || 0) : 0
      const usdValue = bal?.balanceUSD ? bal.balanceUSD : balanceAmount * price

      const isRelevant = relevantSet.has(addrLower)
      return {
        addr,
        token,
        usdValue,
        price,
        balanceAmount,
        category: getTokenCategory(token),
        isRelevant,
      }
    })

    return mapped.sort((a, b) => {
      // Primary: USD balance value (highest first)
      const usdValueDiff = b.usdValue - a.usdValue
      if (Math.abs(usdValueDiff) > 0.01) return usdValueDiff

      // Secondary: token balance amount (holders first)
      const balDiff = b.balanceAmount - a.balanceAmount
      if (Math.abs(balDiff) > 0.000001) return balDiff

      // Tertiary: category (native/wrapped first)
      if (a.category !== b.category) return a.category - b.category

      return (a.token.symbol ?? '').localeCompare(b.token.symbol ?? '')
    })
  }, [
    visibleAddresses,
    tokensMap,
    balances,
    prices,
    chainId,
    getTokenCategory,
    relevant,
  ])

  const selected = value ? tokensMap[value.toLowerCase()] : undefined

  const handleTokenChange = useCallback(
    (address: Address) => {
      if (!isMainToken(chainId, address) && !isUserToken(chainId, address)) {
        addUserToken(chainId, address)
        setUserTokensVersion((v) => v + 1)
      }
      onChange(address)
    },
    [chainId, onChange]
  )

  // List mode: just show the token list without dropdown button
  if (listMode) {
    return (
      <TokenSelectorListMode
        chainId={chainId}
        chains={chains}
        relevant={relevant}
        rows={rows}
        tokensMap={tokensMap}
        balances={balances}
        prices={prices}
        balancesLoading={balancesLoading}
        pricesLoading={pricesLoading}
        userAddress={userAddress}
        onChange={handleTokenChange}
      />
    )
  }

  // Dropdown mode: show button and dropdown
  return (
    <TokenSelectorDropdownMode
      dropdownRef={dropdownRef as any}
      open={open}
      setOpen={setOpen}
      chainId={chainId}
      chains={chains}
      relevant={relevant}
      rows={rows}
      tokensMap={tokensMap}
      balances={balances}
      prices={prices}
      balancesLoading={balancesLoading}
      pricesLoading={pricesLoading}
      userAddress={userAddress}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      showSearch={showSearch}
      listsLoading={listsLoading}
      selected={selected}
      onChange={handleTokenChange}
    />
  )
}
