import type { TradingOperation } from './types'
import type { TradingQuotes } from './useTradingQuotes'
import { BatchExecuteButton } from '../../../common/BatchExecuteButton'

interface TradingExecuteBlockProps {
  quotes: TradingQuotes
  operation: TradingOperation
  /** Verb on the final button, e.g. "Execute Collateral Swap". */
  executeLabel: string
}

/**
 * The execute stack shared by every trading action (Loop / Close / ColSwap /
 * DebtSwap). Two modes:
 *
 *  - **Atomic** (wallet advertises EIP-5792 batching, switch on): one button
 *    that bundles permissions + setup transactions + the selected quote into a
 *    single confirmation.
 *  - **Sequential** (fallback, unchanged): one button per permission, one per
 *    setup transaction, then the execute button — gated until both are done.
 */
export function TradingExecuteBlock({ quotes, operation, executeLabel }: TradingExecuteBlockProps) {
  const {
    permissions,
    transactions,
    completedPermissions,
    completedTransactions,
    executingPermissionIdx,
    executingTransactionIdx,
    allPermissionsDone,
    allTransactionsDone,
    executingQuote,
    batchSupported,
    batchNeedsUpgrade,
    executeNextPermission,
    executeNextTransaction,
    executeQuote,
    executeAll,
  } = quotes

  const permLabel = (i: number) => permissions[i].description || `Approval ${i + 1}`
  const txLabel = (i: number) => transactions[i].description || `Setup transaction ${i + 1}`

  // Once any step has been confirmed on its own, stay sequential: re-bundling
  // would ask the wallet to repeat grants that already landed.
  const partiallyExecuted = completedPermissions.length > 0 || completedTransactions.length > 0

  if (batchSupported && !partiallyExecuted) {
    return (
      <BatchExecuteButton
        steps={[
          ...permissions.map((_p, i) => permLabel(i)),
          ...transactions.map((_t, i) => txLabel(i)),
          executeLabel,
        ]}
        label={executeLabel}
        executing={executingQuote}
        needsUpgrade={batchNeedsUpgrade}
        onExecute={() => executeAll(operation)}
      />
    )
  }

  return (
    <div className="space-y-1.5">
      {permissions.map((_tx, i) => {
        const done = completedPermissions.includes(i)
        const executing = executingPermissionIdx === i
        const label = permLabel(i)
        return (
          <button
            key={`perm-${i}`}
            type="button"
            className={`btn btn-sm w-full h-auto min-h-8 py-1 text-xs ${done ? 'btn-outline btn-success' : 'btn-outline'}`}
            disabled={executing || executingPermissionIdx !== null}
            title={label}
            onClick={() => executeNextPermission(i)}
          >
            {executing ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <span className="block truncate max-w-full">{done ? `✓ ${label}` : label}</span>
            )}
          </button>
        )
      })}

      {transactions.map((_tx, i) => {
        const done = completedTransactions.includes(i)
        const executing = executingTransactionIdx === i
        const label = txLabel(i)
        return (
          <button
            key={`tx-${i}`}
            type="button"
            className={`btn btn-sm w-full h-auto min-h-8 py-1 text-xs ${done ? 'btn-outline btn-success' : 'btn-outline'}`}
            disabled={executing || executingTransactionIdx !== null}
            title={label}
            onClick={() => executeNextTransaction(i)}
          >
            {executing ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <span className="block truncate max-w-full">{done ? `✓ ${label}` : label}</span>
            )}
          </button>
        )
      })}

      {/* The composer pulls the margin with `transferFrom`, so an approval left
          pending reverts the whole action ("transfer amount exceeds allowance").
          Approvals are sized to the exact amount and are consumed by every run,
          so this gate matters each time. */}
      <button
        type="button"
        className="btn btn-success btn-sm w-full"
        disabled={executingQuote || !allPermissionsDone || !allTransactionsDone}
        title={
          !allPermissionsDone
            ? 'Complete the approval(s) above first'
            : !allTransactionsDone
              ? 'Complete the setup transaction(s) above first'
              : undefined
        }
        onClick={() => executeQuote(operation)}
      >
        {executingQuote ? (
          <span className="loading loading-spinner loading-xs" />
        ) : !allPermissionsDone ? (
          'Approve first'
        ) : !allTransactionsDone ? (
          'Complete setup first'
        ) : (
          executeLabel
        )}
      </button>
    </div>
  )
}
