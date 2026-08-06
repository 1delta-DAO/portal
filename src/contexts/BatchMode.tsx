import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

/**
 * App-wide switch for atomic batching (EIP-5792 `wallet_sendCalls`, fulfilled
 * for EOAs by the wallet's own EIP-7702 delegation).
 *
 * When on, every multi-step flow (permission grants + setup txns + the action
 * itself) collapses into ONE wallet confirmation — but only where the connected
 * wallet advertises the `atomic` capability for the active chain. Detection is
 * dynamic (see `useAtomicBatch`), so this switch is purely an override: turning
 * it off forces the sequential button stacks everywhere, which is what you want
 * when debugging a flow step by step or when a wallet mis-reports support.
 *
 * Persisted to `localStorage` (globally, not per-chain or per-wallet).
 */
interface BatchModeState {
  /** User preference. Says nothing about whether the wallet can actually batch. */
  batchEnabled: boolean
  setBatchEnabled: (value: boolean) => void
}

const STORAGE_KEY = 'atomicBatchEnabled'

/** Ships on. Capability detection already gates it, so the fallback is automatic. */
const DEFAULT_BATCH_ENABLED = true

function readStored(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return DEFAULT_BATCH_ENABLED
    return raw === 'true'
  } catch {
    return DEFAULT_BATCH_ENABLED
  }
}

const BatchModeContext = createContext<BatchModeState>({
  batchEnabled: DEFAULT_BATCH_ENABLED,
  setBatchEnabled: () => {},
})

export function BatchModeProvider({ children }: { children: ReactNode }) {
  const [batchEnabled, setBatchEnabledState] = useState<boolean>(readStored)

  const setBatchEnabled = useCallback((value: boolean) => {
    setBatchEnabledState(value)
    try {
      localStorage.setItem(STORAGE_KEY, String(value))
    } catch {
      /* ignore persistence failures (private mode, quota) */
    }
  }, [])

  const value = useMemo<BatchModeState>(
    () => ({ batchEnabled, setBatchEnabled }),
    [batchEnabled, setBatchEnabled]
  )

  return <BatchModeContext.Provider value={value}>{children}</BatchModeContext.Provider>
}

export function useBatchMode() {
  return useContext(BatchModeContext)
}
