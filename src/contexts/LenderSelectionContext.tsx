// src/context/LenderSelectionContext.tsx
import React, { createContext, useCallback, useContext, useMemo, useState } from "react"
import { FlattenedPoolWithUserData } from "../hooks/lending/prepareMixedData"

// All possible operations a user can perform on a pool
export type LenderOperationKind = "deposit" | "withdraw" | "borrow" | "repay"

// One row / block in your UI
export interface LenderOperationSelection {
    /** Stable id for rendering lists & tracking updates */
    id: string
    /** Selected lender pool entity (or undefined if not chosen yet) */
    pool?: FlattenedPoolWithUserData
    /** Amount as string so you can keep partial input like "0." or "1e-" */
    amount: string
    /** Operation type */
    operation: LenderOperationKind
    /**
     * If true, the amount is conceptually "use the maximum".
     * This lets you distinguish intent even when floating point math is approximate.
     */
    useMax?: boolean
    /**
     * If true, this selection should use the running balance of this asset
     * (e.g. "use all USDC I have at this step" in a multi-step sequence).
     */
    useCurrentBalance?: boolean
}

// ---- context shape ----

interface LenderSelectionContextValue {
    selections: LenderOperationSelection[]

    // CRUD-like actions
    addSelection: (initial?: Partial<Omit<LenderOperationSelection, "id">>) => void
    removeSelection: (id: string) => void
    clearSelections: () => void

    // Fine-grained setters
    setSelectionPool: (id: string, pool: FlattenedPoolWithUserData | undefined) => void
    setSelectionAmount: (id: string, amount: string) => void
    setSelectionOperation: (id: string, op: LenderOperationKind) => void
    setSelectionUseMax: (id: string, useMax: boolean) => void
    setSelectionUseCurrentBalance: (id: string, useCurrentBalance: boolean) => void

    // Generic update in case you want to patch multiple fields
    updateSelection: (id: string, patch: Partial<Omit<LenderOperationSelection, "id">>) => void
}

const LenderSelectionContext = createContext<LenderSelectionContextValue | null>(null)

// --- simple id helper (no external deps) ---
function createSelectionId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID()
    }
    return `sel_${Math.random().toString(36).slice(2, 10)}`
}

interface LenderSelectionProviderProps {
    children: React.ReactNode
    /** Optional initial selections (e.g. to prefill from URL/state) */
    initialSelections?: Partial<LenderOperationSelection>[]
}

/**
 * Provider that holds the user's currently selected lender operations.
 *
 * You will later use this to let the user dynamically:
 *  - add blocks via "+" button (calls addSelection)
 *  - choose a pool from a dropdown (setSelectionPool)
 *  - type an amount (setSelectionAmount)
 *  - pick an operation (setSelectionOperation)
 */
export const LenderSelectionProvider: React.FC<LenderSelectionProviderProps> = ({ children, initialSelections }) => {
    const [selections, setSelections] = useState<LenderOperationSelection[]>(() => {
        if (!initialSelections || initialSelections.length === 0) return []
        return initialSelections.map((sel) => ({
            id: createSelectionId(),
            pool: sel.pool,
            amount: sel.amount ?? "",
            operation: sel.operation ?? "deposit",
            useMax: sel.useMax ?? false,
            useCurrentBalance: sel.useCurrentBalance ?? false,
        }))
    })

    const addSelection = useCallback((initial?: Partial<Omit<LenderOperationSelection, "id">>) => {
        setSelections((prev) => [
            ...prev,
            {
                id: createSelectionId(),
                pool: initial?.pool,
                amount: initial?.amount ?? "",
                operation: initial?.operation ?? "deposit",
                useMax: initial?.useMax ?? false,
                useCurrentBalance: initial?.useCurrentBalance ?? false,
            },
        ])
    }, [])

    const removeSelection = useCallback((id: string) => {
        setSelections((prev) => prev.filter((s) => s.id !== id))
    }, [])

    const clearSelections = useCallback(() => {
        setSelections([])
    }, [])

    const updateSelection = useCallback((id: string, patch: Partial<Omit<LenderOperationSelection, "id">>) => {
        setSelections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
    }, [])

    const setSelectionPool = useCallback(
        (id: string, pool: FlattenedPoolWithUserData | undefined) => {
            updateSelection(id, { pool })
        },
        [updateSelection]
    )

    const setSelectionAmount = useCallback(
        (id: string, amount: string) => {
            // You *could* auto-clear useMax/useCurrentBalance here on manual edit,
            // but that's a UX decision – for now we just set the amount.
            updateSelection(id, { amount })
        },
        [updateSelection]
    )

    const setSelectionOperation = useCallback(
        (id: string, op: LenderOperationKind) => {
            updateSelection(id, { operation: op })
        },
        [updateSelection]
    )

    const setSelectionUseMax = useCallback(
        (id: string, useMax: boolean) => {
            updateSelection(id, { useMax })
        },
        [updateSelection]
    )

    const setSelectionUseCurrentBalance = useCallback(
        (id: string, useCurrentBalance: boolean) => {
            updateSelection(id, { useCurrentBalance })
        },
        [updateSelection]
    )

    const value = useMemo<LenderSelectionContextValue>(
        () => ({
            selections,
            addSelection,
            removeSelection,
            clearSelections,
            setSelectionPool,
            setSelectionAmount,
            setSelectionOperation,
            setSelectionUseMax,
            setSelectionUseCurrentBalance,
            updateSelection,
        }),
        [
            selections,
            addSelection,
            removeSelection,
            clearSelections,
            setSelectionPool,
            setSelectionAmount,
            setSelectionOperation,
            setSelectionUseMax,
            setSelectionUseCurrentBalance,
            updateSelection,
        ]
    )

    return <LenderSelectionContext.Provider value={value}>{children}</LenderSelectionContext.Provider>
}

/**
 * Consumer hook for the lender selection context.
 */
export function useLenderSelection(): LenderSelectionContextValue {
    const ctx = useContext(LenderSelectionContext)
    if (!ctx) {
        throw new Error("useLenderSelection must be used within LenderSelectionProvider")
    }
    return ctx
}
