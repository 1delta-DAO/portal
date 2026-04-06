import React from 'react'
import { sanitizeAmountInput } from '../lending/DashboardActions/format'
import { AmountQuickButtons } from '../lending/DashboardActions/AmountQuickButtons'

interface AmountInputProps {
  /** Decimal string. Owned by the parent. */
  value: string
  /**
   * Called when the user types or selects a 25/50/75 preset. Always passes a
   * sanitized decimal string (or `''` when the field is cleared).
   */
  onChange: (next: string) => void
  /**
   * Maximum the user can enter, as a decimal string. Drives the quick-buttons.
   * Pass `'0'` to disable the presets.
   */
  maxAmount: string
  /**
   * Optional callback for the **Max** preset specifically. When provided, the
   * Max button calls this instead of `onChange(maxAmount)` — used by Withdraw
   * and Repay to flip an `isAll` flag in the parent. When omitted, Max behaves
   * like any other preset and just fills the input.
   */
  onMaxClick?: () => void
  /**
   * Error message to display under the input. Falsy hides the row entirely.
   * The parent decides which message wins (Repay shows wallet-overflow vs
   * debt-overflow exclusively, for example).
   */
  error?: string | null
  disabled?: boolean
  /** Defaults to "Amount". */
  label?: React.ReactNode
  placeholder?: string
}

/**
 * The label-row + presets + decimal input + error block used by all four
 * basic action forms (Deposit, Withdraw, Borrow, Repay). Sanitizes input
 * via `sanitizeAmountInput` so the parent never sees garbage.
 */
export const AmountInput: React.FC<AmountInputProps> = ({
  value,
  onChange,
  maxAmount,
  onMaxClick,
  error,
  disabled,
  label = 'Amount',
  placeholder = '0.0',
}) => (
  <>
    <div className="form-control">
      <div className="flex justify-between items-center mb-1">
        <span className="label-text text-xs">{label}</span>
        <AmountQuickButtons
          maxAmount={maxAmount}
          onSelect={onChange}
          onMax={onMaxClick}
        />
      </div>
      <input
        type="text"
        inputMode="decimal"
        className={`input input-bordered input-sm w-full ${error ? 'input-error' : ''}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          const v = sanitizeAmountInput(e.target.value)
          if (v !== null) onChange(v)
        }}
        disabled={disabled}
      />
    </div>
    {error && <div className="text-[10px] text-error">{error}</div>}
  </>
)
