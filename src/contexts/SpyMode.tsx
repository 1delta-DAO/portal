import { createContext, useContext, useMemo, useState, useCallback, type ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { isAddress, getAddress, type Address } from 'viem'

interface SpyModeState {
  spyAddress: Address | null
  isSpyMode: boolean
  enableSpy: (address: string) => boolean
  disableSpy: () => void
}

const SpyModeContext = createContext<SpyModeState>({
  spyAddress: null,
  isSpyMode: false,
  enableSpy: () => false,
  disableSpy: () => {},
})

export function SpyModeProvider({ children }: { children: ReactNode }) {
  const [spyAddress, setSpyAddress] = useState<Address | null>(null)

  const enableSpy = useCallback((raw: string) => {
    const trimmed = raw.trim()
    if (!isAddress(trimmed)) return false
    setSpyAddress(getAddress(trimmed))
    return true
  }, [])

  const disableSpy = useCallback(() => setSpyAddress(null), [])

  // Memoised: an inline object here is a new identity on every render of this
  // provider, which re-renders every consumer — and `useSpyAccount` is called
  // from most of the data hooks in the app. `BatchMode` and `RiskMode` do the
  // same; keep all three in step.
  const value = useMemo<SpyModeState>(
    () => ({ spyAddress, isSpyMode: !!spyAddress, enableSpy, disableSpy }),
    [spyAddress, enableSpy, disableSpy]
  )

  return <SpyModeContext.Provider value={value}>{children}</SpyModeContext.Provider>
}

export function useSpyMode() {
  return useContext(SpyModeContext)
}

/**
 * Drop-in replacement for wagmi's `useAccount` that returns the spy address
 * when spy mode is active. Use this in read-only components (balances, positions, etc).
 * Do NOT use this in transaction-signing hooks — those need the real wallet.
 */
export function useSpyAccount() {
  const real = useAccount()
  const { spyAddress, isSpyMode } = useSpyMode()

  // Memoised so the returned object keeps a stable identity while spying —
  // otherwise every render hands consumers a fresh object, and the hooks that
  // put `account` in a dependency array or a query key would churn.
  return useMemo(() => {
    if (!isSpyMode || !spyAddress) return real
    return {
      ...real,
      address: spyAddress,
      isConnected: true as const,
      status: 'connected' as const,
    }
  }, [real, isSpyMode, spyAddress])
}
