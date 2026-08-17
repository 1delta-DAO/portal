import { BatchExecuteButton } from '../../common/BatchExecuteButton'

/**
 * Structural view of the ladder state — satisfied by `usePermissionLadder`
 * and by the hooks that embed it (`useActionExecution`,
 * `useVaultActionExecution`), so any of them can drive this component.
 */
export interface LadderView {
  permissions: ReadonlyArray<{ description?: string }>
  hasPermissions: boolean
  permissionsCompleted: number
  allPermissionsDone: boolean
  executingPermission: boolean
  executingMain: boolean
  batchSupported: boolean
  batchNeedsUpgrade: boolean
  executeNextPermission: () => void | Promise<void>
  executeMain: () => void | Promise<void>
  executeAll: () => void | Promise<void>
}

interface ExecutionLadderProps {
  ladder: LadderView
  /** Verb on the final button, e.g. "Execute Deposit". */
  label: string
  /** Extra gate on the final button (form invalid, over max, …). */
  disabled?: boolean
}

/**
 * The one approvals + execute UI. Renders one atomic confirmation where the
 * wallet supports EIP-5792 batching, otherwise the step-by-step stack:
 * approvals first (one at a time, in order), then the action button.
 */
export function ExecutionLadder({ ladder, label, disabled }: ExecutionLadderProps) {
  const {
    permissions,
    hasPermissions,
    permissionsCompleted,
    allPermissionsDone,
    executingPermission,
    executingMain,
    batchSupported,
    batchNeedsUpgrade,
    executeNextPermission,
    executeMain,
    executeAll,
  } = ladder

  const permLabel = (i: number) => permissions[i].description || `Approval ${i + 1}`

  // Once an approval has been confirmed on its own, stay sequential: re-bundling
  // would ask the wallet to repeat a grant that already landed.
  if (batchSupported && permissionsCompleted === 0) {
    return (
      <BatchExecuteButton
        steps={[...permissions.map((_p, i) => permLabel(i)), label]}
        label={label}
        executing={executingMain}
        needsUpgrade={batchNeedsUpgrade}
        onExecute={executeAll}
        disabled={disabled}
      />
    )
  }

  return (
    <>
      {hasPermissions && !allPermissionsDone && (
        <div className="space-y-1">
          <span className="text-xs text-base-content/60">
            Approvals ({permissionsCompleted}/{permissions.length})
          </span>
          {permissions.map((_perm, i) => {
            const done = i < permissionsCompleted
            const isCurrent = i === permissionsCompleted
            return (
              <button
                key={i}
                type="button"
                className={`btn btn-sm w-full ${done ? 'btn-disabled btn-outline btn-success' : isCurrent ? 'btn-warning' : 'btn-outline btn-ghost'}`}
                disabled={!isCurrent || executingPermission}
                onClick={isCurrent ? executeNextPermission : undefined}
                title={permLabel(i)}
              >
                <span className="truncate max-w-full">
                  {done ? (
                    `✓ ${permLabel(i)}`
                  ) : isCurrent && executingPermission ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    permLabel(i)
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {allPermissionsDone && (
        <button
          type="button"
          className="btn btn-success btn-sm w-full"
          disabled={executingMain || disabled}
          onClick={executeMain}
        >
          {executingMain ? <span className="loading loading-spinner loading-xs" /> : label}
        </button>
      )}
    </>
  )
}
