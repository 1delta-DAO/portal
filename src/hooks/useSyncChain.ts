import { useCallback } from 'react'
import { useSwitchChain, useConnection } from 'wagmi'
import { useToast } from '../components/common/ToastHost'

export function useSyncChain() {
  const { chainId: currentChainId } = useConnection()
  const { switchChainAsync } = useSwitchChain()
  const toast = useToast()
  const syncChain = useCallback(
    async (targetChainId: number) => {
      if (currentChainId === targetChainId) return true

      try {
        await switchChainAsync({ chainId: targetChainId })
        return true
      } catch (err) {
        toast.showError(`Please switch to chain ${targetChainId}`)
        return false
      }
    },
    [currentChainId, switchChainAsync, toast]
  )

  return { syncChain, currentChainId }
}
