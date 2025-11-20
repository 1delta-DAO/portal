import { BaseLendingPosition } from "@1delta/margin-fetcher"
import { FlattenedPoolWithUserData } from "../../../hooks/lending/prepareMixedData"
import { LenderOperationSelection } from "../../../contexts/LenderSelectionContext"
import { SimulatedActionState } from "../../../contexts/Simulation/simulateLenderSelections"

// Common props passed into each action-specific input
export interface ActionAmountInputProps {
    selection: LenderOperationSelection
    price?: number
    pool?: FlattenedPoolWithUserData
    simulated?: SimulatedActionState
    onChangeAmount: (amount: string) => void
}

/** parse decimal string like "1.23" or "1,23" into number */
export const parseAmount = (v: string): number => {
    if (!v) return 0
    const normalized = v.replace(/,/g, "")
    const n = parseFloat(normalized)
    return Number.isFinite(n) ? n : 0
}

/** make a nice token string for "max" buttons: 6 decimals, no trailing zeros */
export const formatTokenForInput = (v: number): string => {
    if (!Number.isFinite(v)) return ""
    return v.toString()
}

/** aggregate user token stats (sum deposits, debt+debtStable across all sub-accounts) */
export const getUserTokenStats = (pool?: FlattenedPoolWithUserData) => {
    const userMap = (pool?.userPosition as Record<string, BaseLendingPosition> | undefined) ?? undefined
    let depositsToken = 0
    let debtToken = 0

    if (userMap) {
        for (const pos of Object.values(userMap)) {
            const dep = parseAmount(pos.deposits)
            const debt = parseAmount(pos.debt)
            const debtStable = parseAmount(pos.debtStable)
            depositsToken += dep
            debtToken += debt + debtStable
        }
    }

    return { depositsToken, debtToken }
}
