// src/hooks/lending/useSimulatedLenderSelections.ts
import { useCallback, useMemo } from 'react'
import { LenderOperationSelection, useLenderSelection } from '../../contexts/LenderSelectionContext'
import { FlattenedPoolWithUserData, PositionTotals, UserConfigs } from './prepareMixedData'
import { simulateLenderSelections } from '../../contexts/Simulation/simulateLenderSelections'
import { adjustForAction } from '../../contexts/Simulation/deltas'

export function useSimulatedLenderSelections(
  positionTotals: PositionTotals,
  userConfigs: UserConfigs,
  defaultSubAccount = '0',
  prices: { [a: string]: number } = {}
) {
  const resolveAmountUsd = useCallback(
    (selection: LenderOperationSelection, pool: FlattenedPoolWithUserData) => {
      return Number(selection.amount) * (prices[pool.asset.assetGroup ?? ''] ?? 0)
    },
    [prices]
  )
  const { selections } = useLenderSelection()

  return useMemo(
    () =>
      simulateLenderSelections(
        selections,
        positionTotals,
        userConfigs,
        adjustForAction,
        resolveAmountUsd,
        { defaultSubAccount }
      ),
    [selections, positionTotals, userConfigs, resolveAmountUsd, defaultSubAccount]
  )
}
