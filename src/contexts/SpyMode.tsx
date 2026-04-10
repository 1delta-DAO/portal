import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
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

  return (
    <SpyModeContext.Provider
      value={{ spyAddress, isSpyMode: !!spyAddress, enableSpy, disableSpy }}
    >
      {children}
    </SpyModeContext.Provider>
  )
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

  if (isSpyMode && spyAddress) {
    return {
      ...real,
      address: spyAddress,
      isConnected: true as const,
      status: 'connected' as const,
    }
  }

  return real
}
