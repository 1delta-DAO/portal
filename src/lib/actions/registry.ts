import type { DestinationActionConfig } from "../types/destinationAction"

type ModuleType = {
    default?: DestinationActionConfig | DestinationActionConfig[]
    actions?: DestinationActionConfig[]
    getActions?: (opts?: { dstToken?: string; dstChainId?: string }) => DestinationActionConfig[]
}

/**
 * Loads all action configs from src/lib/actions/.../config.ts and merges with static actions.
 * Each module can export:
 * - default: DestinationActionConfig | DestinationActionConfig[]
 * - actions: DestinationActionConfig[]
 * - getActions: (opts?: { dstToken?: string; dstChainId?: string }) => DestinationActionConfig[]
 *   (for dynamic actions that need runtime data)
 */
export function getAllActions(opts?: { dstToken?: string; dstChainId?: string }): DestinationActionConfig[] {
    const modules = import.meta.glob<ModuleType>("./**/config.ts", { eager: true })

    const dynamic: DestinationActionConfig[] = []

    for (const key in modules) {
        const mod = modules[key]
        if (!mod) continue

        if (Array.isArray(mod.default)) {
            dynamic.push(...mod.default)
        } else if (mod.default) {
            dynamic.push(mod.default)
        }
        if (Array.isArray(mod.actions)) {
            dynamic.push(...mod.actions)
        }

        // Process dynamic exports (functions that return actions)
        if (mod.getActions) {
            try {
                const actions = mod.getActions(opts)
                if (Array.isArray(actions)) {
                    dynamic.push(...actions)
                }
            } catch (e) {
                console.warn(`Failed to get actions from ${key}:`, e)
            }
        }
    }

    return [...dynamic]
}

export function getActionsByGroup(group?: string, opts?: { dstToken?: string; dstChainId?: string }): DestinationActionConfig[] {
    const all = getAllActions(opts)
    if (!group) return all
    return all.filter((a) => (a as any).group === group || a.actionType === (group as any))
}
