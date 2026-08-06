import type { ActionExecution } from './useActionExecution'
import { BatchExecuteButton } from '../../common/BatchExecuteButton'
import { TermsDisclosure } from '../terms'
import type { TermsAcknowledgement } from '../terms/TermsDisclosure'
import type { TermSide } from '../terms/types'

interface ActionExecuteBlockProps {
  exec: ActionExecution
  /** Verb on the final button, e.g. "Execute Deposit". */
  label: string
  /**
   * Term-sheet gate for this market side. When the market carries `critical`
   * terms the user has not yet acknowledged, the disclosure replaces the
   * execute button until they do — this is the only place in the flow that
   * stands between the action and the wallet.
   *
   * Omit for actions with no market terms (or where terms are still loading);
   * the block then behaves exactly as before.
   */
  terms?: TermsAcknowledgement
  termsSide?: TermSide
  termsActionLabel?: string
}

/**
 * Approvals + execute for the direct lending actions (Deposit / Borrow /
 * Withdraw / Repay). Renders one atomic confirmation where the wallet supports
 * EIP-5792 batching, otherwise the unchanged step-by-step stack: approvals
 * first (one at a time, in order), then the action button.
 */
export function ActionExecuteBlock({
  exec,
  label,
  terms,
  termsSide = 'supply',
  termsActionLabel,
}: ActionExecuteBlockProps) {
  const {
    result,
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
  } = exec

  if (!result) return null

  // Disclose BEFORE anything reaches the wallet — including approvals, since a
  // grant is itself part of what the user is agreeing to.
  if (terms && !terms.cleared) {
    return <TermsDisclosure ack={terms} side={termsSide} actionLabel={termsActionLabel} />
  }

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

      {(!hasPermissions || allPermissionsDone) && (
        <button
          type="button"
          className="btn btn-success btn-sm w-full"
          disabled={executingMain}
          onClick={executeMain}
        >
          {executingMain ? <span className="loading loading-spinner loading-xs" /> : label}
        </button>
      )}
    </>
  )
}
