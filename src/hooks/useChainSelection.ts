import { useCallback, useMemo } from 'react'

import {
  MAX_MULTI_CHAINS,
  TAB_CHAIN_MODE,
  parseChainIds,
  type ChainMode,
  type SubTab,
} from '../utils/routes'

/**
 * Chain selection is a *data filter*, not a wallet concern.
 *
 * Nothing in this module touches wagmi: selecting chains never switches the
 * connected network and never opens an RPC connection. The wallet chain is
 * only reconciled at transaction time, by `useSyncChain`, against the chain of
 * the specific row the user acted on. Keep it that way — a selector that
 * switched networks would prompt the wallet on every filter change.
 */

const SINGLE_KEY = 'selectedChainId'
const MULTI_KEY = 'selectedChainIds'
const FALLBACK_CHAIN = '1'

function readStored(key: string): string[] {
  try {
    return parseChainIds(localStorage.getItem(key) ?? undefined)
  } catch {
    // localStorage can throw in private-mode / embedded browsers.
    return []
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* quota exceeded or unavailable — selection still works for this session */
  }
}

export interface ChainSelection {
  /** The tab's effective selection, always at least one chain. */
  chainIds: string[]
  /**
   * First selected chain. Single-chain tabs use this exclusively; multi-chain
   * tabs use it for the few things that still need one chain (e.g. the token
   * list backing a search box).
   */
  primaryChainId: string
  mode: ChainMode
  /** True when the active tab renders no chain selector at all. */
  isHidden: boolean
  maxChains: number
}

/**
 * Resolves the chain selection for the active tab from the URL segment, with
 * localStorage as the fallback for a fresh visit.
 *
 * Single- and multi-chain selections are remembered separately so moving
 * Earn (multi) → Lending (single) → Earn restores the multi set instead of
 * collapsing it permanently. A multi-chain tab entered for the first time
 * seeds from the single-chain selection, so the user lands on the chain they
 * were already looking at.
 */
export function useChainSelection(tab: SubTab, chainIdParam: string | undefined): ChainSelection {
  const mode = TAB_CHAIN_MODE[tab]

  return useMemo(() => {
    const fromUrl = parseChainIds(chainIdParam)
    const storedSingle = readStored(SINGLE_KEY)
    const storedMulti = readStored(MULTI_KEY)

    // Precedence: URL → the store for this mode → the store for the other mode
    // → mainnet. The cross-mode fallback is what makes a first visit to a
    // multi-chain tab open on the chain the user was already browsing.
    let resolved: string[]
    if (fromUrl.length > 0) resolved = fromUrl
    else if (mode === 'multi') resolved = storedMulti.length ? storedMulti : storedSingle
    else resolved = storedSingle.length ? storedSingle : storedMulti

    if (resolved.length === 0) resolved = [FALLBACK_CHAIN]

    // A single-chain tab reached with a multi-chain URL (tab switch, shared
    // link) collapses to the first entry rather than erroring.
    const chainIds = mode === 'multi' ? resolved.slice(0, MAX_MULTI_CHAINS) : resolved.slice(0, 1)

    return {
      chainIds,
      primaryChainId: chainIds[0],
      mode,
      isHidden: mode === 'none',
      maxChains: mode === 'multi' ? MAX_MULTI_CHAINS : 1,
    }
  }, [mode, chainIdParam])
}

/**
 * Persist a selection so the *other* kind of tab can restore it later. Writes
 * both keys when a multi-selection collapses to one chain, so a single-chain
 * tab opened next lands on the same place.
 */
export function usePersistChainSelection() {
  return useCallback((chainIds: string[], mode: ChainMode) => {
    if (chainIds.length === 0) return
    if (mode === 'multi') {
      writeStored(MULTI_KEY, chainIds.join(','))
      writeStored(SINGLE_KEY, chainIds[0])
    } else if (mode === 'single') {
      writeStored(SINGLE_KEY, chainIds[0])
    }
  }, [])
}
