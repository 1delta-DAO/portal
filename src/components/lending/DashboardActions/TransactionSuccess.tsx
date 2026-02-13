import React from 'react'
import type { ActionType } from './types'

const ACTION_LABELS: Record<ActionType, string> = {
  Deposit: 'deposited',
  Withdraw: 'withdrawn',
  Borrow: 'borrowed',
  Repay: 'repaid',
}

export const TransactionSuccess: React.FC<{
  actionType: ActionType
  amount: string
  symbol: string
  hash?: string
  onDismiss: () => void
}> = ({ actionType, amount, symbol, hash, onDismiss }) => {
  return (
    <div className="flex flex-col items-center gap-3 py-4 animate-in fade-in">
      {/* Checkmark circle */}
      <div className="w-14 h-14 rounded-full bg-success/15 flex items-center justify-center">
        <svg
          className="w-8 h-8 text-success"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <div className="text-center space-y-1">
        <p className="text-sm font-semibold">Transaction Confirmed</p>
        <p className="text-xs text-base-content/70">
          Successfully {ACTION_LABELS[actionType]}{' '}
          <span className="font-medium text-base-content">{amount} {symbol}</span>
        </p>
      </div>

      {hash && (
        <p className="text-[10px] text-base-content/40 font-mono truncate max-w-full px-2">
          {hash}
        </p>
      )}

      <button
        type="button"
        className="btn btn-sm btn-ghost w-full mt-1"
        onClick={onDismiss}
      >
        Done
      </button>
    </div>
  )
}
