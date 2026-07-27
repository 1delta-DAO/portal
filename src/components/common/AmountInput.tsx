import React from 'react'
import { sanitizeAmountInput } from '../lending/actions/format'
import { AmountQuickButtons } from '../lending/actions/AmountQuickButtons'
import { UsdAmount } from './UsdAmount'

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
  /** Token decimals — clamps preset results so e.g. USDC never shows 18 dp. */
  decimals?: number
  /**
   * USD equivalent of the current amount. When provided and non-zero it renders
   * as a canonical {@link UsdAmount} chip at the bottom-right under the input —
   * the single consistent spot for the dollar value across every action panel.
   */
  usdValue?: number
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
  decimals,
  usdValue,
}) => (
  <>
    <div className="form-control">
      <div className="flex justify-between items-center mb-1">
        <span className="label-text text-xs">{label}</span>
        <AmountQuickButtons
          maxAmount={maxAmount}
          onSelect={onChange}
          onMax={onMaxClick}
          decimals={decimals}
        />
      </div>
      {/* The USD equivalent lives inside the field, right-aligned — the input
          has ample empty space and it saves a row. `plain` drops the capsule
          so it doesn't nest a chip inside the bordered box. */}
      <label
        className={`input input-bordered input-sm flex w-full items-center gap-2 ${error ? 'input-error' : ''}`}
      >
        <input
          type="text"
          inputMode="decimal"
          className="grow"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            const v = sanitizeAmountInput(e.target.value)
            if (v !== null) onChange(v)
          }}
          disabled={disabled}
        />
        {usdValue != null && usdValue > 0 && (
          <UsdAmount value={usdValue} plain className="shrink-0" />
        )}
      </label>
    </div>
    {error && <div className="text-[10px] text-error">{error}</div>}
  </>
)
