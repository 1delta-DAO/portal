import type { ActionExecution } from './useActionExecution'
import { ExecutionLadder } from './ExecutionLadder'
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
  if (!exec.result) return null

  // Disclose BEFORE anything reaches the wallet — including approvals, since a
  // grant is itself part of what the user is agreeing to.
  if (terms && !terms.cleared) {
    return <TermsDisclosure ack={terms} side={termsSide} actionLabel={termsActionLabel} />
  }

  return <ExecutionLadder ladder={exec} label={label} />
}
