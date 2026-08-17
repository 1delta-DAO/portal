import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import { useTokenLists } from '../../hooks/useTokenLists'
import { useBalanceQuery } from '../../hooks/balances/useBalanceQuery'
import { usePriceQuery } from '../../hooks/prices/usePriceQuery'
import { useChainsRegistry } from '../../hooks/useChainsRegistry'
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
import { NO_MATCH, compareTokenMatches, normalizeTokenQuery, scoreTokenMatch } from './tokenSearch'

const MAX_SEARCH_RESULTS = 100
/**
 * Cap for the fallback list shown when a chain's token list carries no
 * `mainTokens` — without a curated set there is nothing to trim by, and the
 * full list can run to thousands of entries.
 */
const MAX_FALLBACK_RESULTS = 100

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

  // `getMainTokensCache()` is a plain module-level object, populated as a side
  // effect of the token-list fetch — it is not reactive. Keying this on chainId
  // alone read it *before* the newly selected chain had loaded and then never
  // recomputed, leaving the set empty for the rest of the chain's lifetime:
  // the unsearched list filters by this set, so switching chains showed an
  // empty selector until a search bypassed the filter. `lists` changes identity
  // when the fetch lands, which is the signal that the cache is now filled.
  const mainTokensSet = useMemo(() => {
    const mainTokensCache = getMainTokensCache()
    return mainTokensCache?.[chainId] || new Set<string>()
  }, [chainId, lists])

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

  // Compute visible addresses (filtered by search + main/user set), plus the
  // relevance score of each one so the row sort can honour it.
  const { visibleAddresses, searchScores } = useMemo((): {
    visibleAddresses: Address[]
    searchScores: Map<string, number> | null
  } => {
    const q = normalizeTokenQuery(debouncedQuery)
    const excludeSet = excludeAddresses
      ? new Set(excludeAddresses.map((a) => a.toLowerCase()))
      : null
    const notExcluded = (addrLower: string) => !excludeSet || !excludeSet.has(addrLower)

    if (!q) {
      const curated = allAddrs.filter((addr) => {
        const addrLower = addr.toLowerCase()
        return mainAndUserTokensSet.has(addrLower) && notExcluded(addrLower)
      })
      // A chain whose list ships without `mainTokens` would otherwise render an
      // empty selector that only fills in once the user types. Show the head of
      // the list instead — degraded, but never dead.
      if (curated.length === 0 && allAddrs.length > 0) {
        return {
          visibleAddresses: allAddrs
            .filter((addr) => notExcluded(addr.toLowerCase()))
            .slice(0, MAX_FALLBACK_RESULTS),
          searchScores: null,
        }
      }
      return { visibleAddresses: curated, searchScores: null }
    }

    // Score every candidate before trimming. The old code broke out of the loop
    // at the cap, so the 100 kept were the first 100 in list order rather than
    // the 100 best — an exact match late in the list never surfaced at all.
    const scored: { addr: Address; score: number; isMainOrUser: boolean; symbol?: string }[] = []
    const seen = new Set<string>()

    for (const addr of allAddrs) {
      const addrLower = addr.toLowerCase()
      if (seen.has(addrLower)) continue
      if (excludeSet?.has(addrLower)) continue

      const token = tokensMap[addr]
      if (!token) continue

      const score = scoreTokenMatch(q, token, addrLower)
      if (score === NO_MATCH) continue

      seen.add(addrLower)
      scored.push({
        addr,
        score,
        isMainOrUser: mainAndUserTokensSet.has(addrLower),
        symbol: token.symbol,
      })
    }

    scored.sort(compareTokenMatches)
    const top = scored.slice(0, MAX_SEARCH_RESULTS)

    return {
      visibleAddresses: top.map((entry) => entry.addr),
      searchScores: new Map(top.map((entry) => [entry.addr.toLowerCase(), entry.score])),
    }
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
        matchScore: searchScores?.get(addrLower) ?? 0,
        isMainOrUser: mainAndUserTokensSet.has(addrLower),
      }
    })

    return mapped.sort((a, b) => {
      // While searching, relevance outranks holdings: this sort used to run
      // unconditionally and threw the search ordering away, so a big PT-USDe
      // balance buried the USDe the user typed. Balance still breaks ties
      // *within* a tier.
      if (searchScores) {
        if (a.matchScore !== b.matchScore) return a.matchScore - b.matchScore
        if (a.isMainOrUser !== b.isMainOrUser) return a.isMainOrUser ? -1 : 1
      }

      // Primary: USD balance value (highest first)
      const usdValueDiff = b.usdValue - a.usdValue
      if (Math.abs(usdValueDiff) > 0.01) return usdValueDiff

      // Secondary: token balance amount (holders first)
      const balDiff = b.balanceAmount - a.balanceAmount
      if (Math.abs(balDiff) > 0.000001) return balDiff

      // Tertiary: category (native/wrapped first)
      if (a.category !== b.category) return a.category - b.category

      if (searchScores) {
        // Plainer symbol first: USDC before USDC-LP-ABC.
        const lengthDiff = (a.token.symbol ?? '').length - (b.token.symbol ?? '').length
        if (lengthDiff !== 0) return lengthDiff
      }

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
    searchScores,
    mainAndUserTokensSet,
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
        listsLoading={listsLoading}
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
